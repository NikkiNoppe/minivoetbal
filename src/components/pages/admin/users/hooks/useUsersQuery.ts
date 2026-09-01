import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getRpcSessionArgs } from "@/lib/authSession";
import { useAuth } from "@/hooks/useAuth";
import { useOrgQueryScope } from "@/hooks/useOrganization";
import { withOrgQueryKey } from "@/lib/orgQueryKey";
import type { DbUser } from "../userTypes";

export const adminUserQueryKeys = {
  all: ["adminUsers"] as const,
  list: () => [...adminUserQueryKeys.all, "list"] as const,
};

export async function fetchAdminUsers(): Promise<DbUser[]> {
  const { data: usersData, error: usersError } = await supabase.rpc(
    "get_all_users_for_admin",
    getRpcSessionArgs(),
  );

  if (usersError) {
    throw new Error(`Fout bij het ophalen van gebruikers: ${usersError.message}`);
  }

  return (usersData || []).map((user: {
    user_id: number;
    username: string;
    email?: string | null;
    role: string;
    team_users?: Array<{ team_id: number; team_name: string }>;
  }) => {
    const teams = user.team_users || [];

    return {
      user_id: user.user_id,
      username: user.username,
      email: user.email ?? undefined,
      role: user.role,
      team_id: teams.length > 0 ? teams[0].team_id : null,
      team_name: teams.length > 0 ? teams[0].team_name : null,
      teams,
    };
  });
}

export function useAdminUsersQuery() {
  const { user, authContextReady } = useAuth();
  const { organizationId, orgQueryEnabled } = useOrgQueryScope();
  const isAdmin = user?.role === "admin";

  return useQuery({
    queryKey: withOrgQueryKey(adminUserQueryKeys.list(), organizationId),
    queryFn: fetchAdminUsers,
    enabled: orgQueryEnabled && authContextReady && isAdmin,
    staleTime: 0,
    gcTime: 10 * 60 * 1000,
    retry: 2,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: keepPreviousData,
    networkMode: "online",
  });
}
