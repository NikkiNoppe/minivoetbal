
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionHeaders, getRpcSessionArgs } from "@/lib/authSession";
import { Team } from "../userTypes";
import { useToast } from "@/hooks/use-toast";

function createTemporaryPassword(): string {
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `Tmp-${randomPart}!9`;
}

export const useUserOperations = (teams: Team[], refreshData: () => Promise<void>) => {
  const { toast } = useToast();

  const addUser = async (newUser: {
    username: string;
    email: string | undefined;
    password: string; // Add password parameter
    role: "admin" | "referee" | "player_manager";
    teamId: number | null;
    teamIds?: number[];
  }) => {
    // Validate form
    if (!newUser.username) {
      toast({
        title: "Fout",
        description: "Gebruikersnaam is verplicht",
        variant: "destructive"
      });
      return false;
    }
    
    // Email is now optional, but if provided, it should be valid
    if (newUser.email && !newUser.email.includes('@')) {
      toast({
        title: "Fout",
        description: "Vul een geldig e-mailadres in of laat het veld leeg",
        variant: "destructive"
      });
      return false;
    }
    
    try {
      const hasInviteEmail = Boolean(newUser.email && newUser.email.includes("@"));
      const passwordToUse =
        newUser.password?.trim() ||
        (hasInviteEmail ? createTemporaryPassword() : "");

      if (!passwordToUse) {
        toast({
          title: "Fout",
          description: "Wachtwoord is verplicht wanneer geen e-mailadres is opgegeven",
          variant: "destructive",
        });
        return false;
      }

      // Create user via RPC which hashes password server-side (bcrypt)
      const { data, error } = await supabase.rpc('create_user_for_session', {
        ...getRpcSessionArgs(),
        username_param: newUser.username,
        email_param: newUser.email || null,
        password_param: passwordToUse,
        role_param: newUser.role
      });
      
      if (error) {
        throw error;
      }
      
      if (!data) {
        throw new Error('No user data returned from creation');
      }
      
      // Send welcome email with password setup link (no plaintext password)
      if (hasInviteEmail && data?.user_id) {
        try {
          const { data: emailResponse, error: emailError } = await supabase.functions.invoke(
            "send-welcome-email",
            {
              body: {
                email: newUser.email,
                username: newUser.username,
                userId: data.user_id,
              },
              headers: getEdgeFunctionHeaders(),
            },
          );

          if (
            emailError ||
            emailResponse?.error ||
            emailResponse?.success === false
          ) {
            const detail =
              emailError?.message ||
              emailResponse?.error ||
              "Welkomstmail mislukt";
            throw new Error(detail);
          }
        } catch (e) {
          console.warn("Kon welkomstmail niet verzenden:", e);
          const detail = e instanceof Error ? e.message : "Onbekende fout";
          toast({
            title: "Gebruiker aangemaakt",
            description:
              `De gebruiker is aangemaakt, maar de uitnodigingsmail kon niet worden verzonden (${detail}). Probeer later opnieuw of reset het wachtwoord handmatig.`,
            variant: "destructive",
            duration: 15000,
          });
          await new Promise((resolve) => setTimeout(resolve, 300));
          await refreshData();
          return true;
        }
      }

      // Add team assignments for player_manager role
      if (data && newUser.role === "player_manager") {
        const teamIds = newUser.teamIds || (newUser.teamId ? [newUser.teamId] : []);
        
        if (teamIds.length > 0) {
          const { data: teamLinkResult, error: teamUserError } = await supabase.rpc(
            'manage_team_user_for_session',
            {
              ...getRpcSessionArgs(),
              p_operation: 'assign_many',
              p_user_id: data.user_id,
              p_team_ids: teamIds,
            } as any,
          );

          if (teamUserError) {
            throw teamUserError;
          }
          const linkPayload = teamLinkResult as { success?: boolean; error?: string };
          if (!linkPayload?.success) {
            throw new Error(linkPayload?.error || 'Teamkoppeling mislukt');
          }
          
          const teamNames = teams
            .filter(team => teamIds.includes(team.team_id))
            .map(team => team.team_name)
            .join(", ");
          
          toast({
            title: "Gebruiker toegevoegd",
            description: `${newUser.username} is toegevoegd als teamverantwoordelijke voor ${teamNames}.${hasInviteEmail ? " Een uitnodigingsmail is verzonden." : ""}`,
            duration: 15000
          });
        } else {
          toast({
            title: "Gebruiker toegevoegd",
            description: `${newUser.username} is toegevoegd zonder teamkoppeling.${hasInviteEmail ? " Een uitnodigingsmail is verzonden." : ""}`,
            duration: 15000
          });
        }
      } else {
        toast({
          title: "Gebruiker toegevoegd",
          description: `${newUser.username} is toegevoegd als ${newUser.role}.${hasInviteEmail ? " Een uitnodigingsmail is verzonden." : ""}`,
          duration: 15000
        });
      }
      
      // Add delay to ensure database transaction is committed
      await new Promise(resolve => setTimeout(resolve, 300));
      await refreshData();
      return true;
    } catch (error: any) {
      console.error('Error adding user:', error);
      const message = error.message?.includes('Gebruikersnaam bestaat al')
        ? 'Deze gebruikersnaam bestaat al binnen deze organisatie.'
        : error.message?.includes('users_organization_id_username_key')
          ? 'Deze gebruikersnaam bestaat al binnen deze organisatie.'
          : error.message || 'Onbekende fout';
      toast({
        title: "Fout",
        description: `Er is een fout opgetreden bij het toevoegen van de gebruiker: ${message}`,
        variant: "destructive"
      });
      return false;
    }
  };

  const updateUser = async (userId: number, formData: {
    username: string;
    email: string | undefined;
    password?: string;
    role: "admin" | "referee" | "player_manager";
    teamId?: number;
    teamIds?: number[];
    sendPasswordSetupEmail?: boolean;
  }) => {
    try {
      // Update user in users table (including password if provided)
      const updateData: any = {
        username: formData.username,
        email: formData.email || null,
        role: formData.role
      };
      
      if (formData.password?.trim()) {
        const { error: pwdError } = await supabase.rpc('update_user_password_for_session', {
          ...getRpcSessionArgs(),
          user_id_param: userId,
          new_password: formData.password
        });
        if (pwdError) {
          throw pwdError;
        }
      }
      
      const { data: updateResult, error: userError } = await supabase.rpc(
        'update_user_for_session',
        {
          ...getRpcSessionArgs(),
          p_user_id: userId,
          p_username: updateData.username ?? null,
          p_email: updateData.email ?? null,
          p_role: updateData.role ?? null,
        },
      );

      if (userError) {
        throw userError;
      }
      if (!(updateResult as { success?: boolean })?.success) {
        throw new Error('Gebruiker niet bijgewerkt');
      }

      const shouldSendPasswordSetupEmail =
        Boolean(formData.sendPasswordSetupEmail) &&
        Boolean(formData.email && formData.email.includes("@"));

      let passwordEmailSent = false;
      let passwordEmailError: string | null = null;

      if (shouldSendPasswordSetupEmail) {
        try {
          const { data: emailResponse, error: emailError } = await supabase.functions.invoke(
            "send-welcome-email",
            {
              body: {
                email: formData.email,
                username: formData.username,
                userId,
              },
              headers: getEdgeFunctionHeaders(),
            },
          );

          if (
            emailError ||
            emailResponse?.error ||
            emailResponse?.success === false
          ) {
            passwordEmailError =
              emailError?.message ||
              emailResponse?.error ||
              "Versturen van wachtwoordmail mislukt";
          } else {
            passwordEmailSent = true;
          }
        } catch (e) {
          console.warn("Kon wachtwoord-instelmail niet verzenden:", e);
          passwordEmailError = e instanceof Error ? e.message : "Onbekende fout";
        }
      }

      const emailSuffix = passwordEmailSent
        ? " Een e-mail om het wachtwoord in te stellen is verzonden."
        : "";

      if (formData.role === "player_manager") {
        const teamIds = formData.teamIds || (formData.teamId ? [formData.teamId] : []);

        if (teamIds.length > 0) {
          const { error: teamUserError } = await supabase.rpc('manage_team_user_for_session', {
            ...getRpcSessionArgs(),
            p_operation: 'assign_many',
            p_user_id: userId,
            p_team_id: null,
            p_team_ids: teamIds,
          } as any);

          if (teamUserError) {
            throw teamUserError;
          }

          const teamNames = teams
            .filter(team => teamIds.includes(team.team_id))
            .map(team => team.team_name)
            .join(", ");

          toast({
            title: "Gebruiker bijgewerkt",
            description: `${formData.username || 'Gebruiker'} is bijgewerkt als teamverantwoordelijke voor ${teamNames}.${emailSuffix}`,
          });
        } else {
          await supabase.rpc('manage_team_user_for_session', {
            ...getRpcSessionArgs(),
            p_operation: 'remove',
            p_user_id: userId,
            p_team_id: null,
            p_team_ids: null,
          } as any);
          toast({
            title: "Gebruiker bijgewerkt",
            description: `${formData.username || 'Gebruiker'} is bijgewerkt zonder teamkoppeling.${emailSuffix}`,
          });
        }
      } else {
        await supabase.rpc('manage_team_user_for_session', {
          ...getRpcSessionArgs(),
          p_operation: 'remove',
          p_user_id: userId,
          p_team_id: null,
          p_team_ids: null,
        } as any);
        toast({
          title: "Gebruiker bijgewerkt",
          description: `${formData.username || 'Gebruiker'} is bijgewerkt als ${formData.role}.${emailSuffix}`,
        });
      }

      if (passwordEmailError) {
        toast({
          title: "Gebruiker bijgewerkt",
          description: `De gebruiker is bijgewerkt, maar de wachtwoordmail kon niet worden verzonden (${passwordEmailError}).`,
          variant: "destructive",
          duration: 15000,
        });
      }

      // Add delay to ensure database transaction is committed
      await new Promise(resolve => setTimeout(resolve, 300));
      await refreshData();
      return true;
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast({
        title: "Fout",
        description: `Er is een fout opgetreden bij het bijwerken van de gebruiker: ${error.message || 'Onbekende fout'}`,
        variant: "destructive"
      });
      return false;
    }
  };

  const deleteUser = async (userId: number) => {
    try {
      // Try Edge Function first
      try {
        const { data: delResp, error: delErr } = await supabase.functions.invoke('delete-user', {
          body: { userId },
          headers: getEdgeFunctionHeaders(),
        });
        if (delErr || (delResp && delResp.error)) {
          throw new Error(delErr?.message || delResp?.error || 'Deletion failed');
        }
      } catch (edgeErr) {
        const { data: delResult, error: rpcDelErr } = await supabase.rpc('delete_user_for_session', {
          ...getRpcSessionArgs(),
          p_user_id: userId,
        });
        if (rpcDelErr || !(delResult as { success?: boolean })?.success) {
          throw edgeErr;
        }
      }
      
      toast({
        title: "Gebruiker verwijderd",
        description: "De gebruiker is succesvol verwijderd"
      });
      
      // Add delay to ensure database transaction is committed
      await new Promise(resolve => setTimeout(resolve, 300));
      await refreshData();
      return true;
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast({
        title: "Fout",
        description: `Er is een fout opgetreden bij het verwijderen van de gebruiker: ${error.message || 'Onbekende fout'}`,
        variant: "destructive"
      });
      return false;
    }
  };

  return { addUser, updateUser, deleteUser };
};
