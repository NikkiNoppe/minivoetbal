
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  AppModal,
  AppModalBody,
} from "@/components/modals/base/app-modal";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

interface TeamOption {
  id: number;
  name: string;
}

interface UserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingUser?: {
    id: number;
    username: string;
    email?: string;
    password: string;
    role: "admin" | "referee" | "player_manager";
    teamId?: number;
    teams?: {team_id: number, team_name: string}[];
  };
  onSave: (formData: any) => Promise<boolean>;
  teams: TeamOption[];
  isLoading?: boolean;
}

interface FormData {
  username: string;
  email: string;
  password: string;
  role: "admin" | "referee" | "player_manager";
  selectedTeamId: number | null;
}

export const UserModal: React.FC<UserModalProps> = ({
  open,
  onOpenChange,
  editingUser,
  onSave,
  teams,
  isLoading = false,
}) => {
  const [formData, setFormData] = useState<FormData>({
    username: "",
    email: "",
    password: "",
    role: "player_manager",
    selectedTeamId: null
  });
  const [showPassword, setShowPassword] = useState(false);
  const [sendPasswordSetupEmail, setSendPasswordSetupEmail] = useState(false);

  // Memoized initial form data to prevent unnecessary recalculations
  const initialFormData = useMemo((): FormData | null => {
    if (!open) return null;
    
    if (editingUser) {
      const currentTeamId = editingUser.teams && editingUser.teams.length > 0 
        ? editingUser.teams[0].team_id 
        : editingUser.teamId || null;

      return {
        username: editingUser.username,
        email: editingUser.email || "",
        password: "",
        role: editingUser.role,
        selectedTeamId: currentTeamId
      };
    } else {
      return {
        username: "",
        email: "",
        password: "",
        role: "player_manager",
        selectedTeamId: null
      };
    }
  }, [open, editingUser, teams]);

  // Optimized useEffect with memoized dependency
  useEffect(() => {
    if (initialFormData) {
      setFormData(initialFormData);
      setSendPasswordSetupEmail(false);
    }
    if (!open) {
      setShowPassword(false);
      setSendPasswordSetupEmail(false);
    }
  }, [initialFormData, open]);

  // Memoized input change handler
  const handleInputChange = useCallback((field: keyof FormData, value: string | number | null) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Auto-clear team when role changes to admin/referee
      if (field === 'role' && (value === 'admin' || value === 'referee')) {
        newData.selectedTeamId = null;
      }
      
      return newData;
    });

    if (field === "email" && typeof value === "string" && !value.trim().includes("@")) {
      setSendPasswordSetupEmail(false);
    }
  }, []);

  // Memoized submit handler
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.username.trim()) {
      console.error('Username is required');
      return;
    }

    // Validate admin/referee roles don't have team assignments
    if ((formData.role === 'admin' || formData.role === 'referee') && formData.selectedTeamId) {
      alert('Administrators en scheidsrechters kunnen geen team hebben toegewezen.');
      return;
    }

    try {
      const submitData = {
        username: formData.username.trim(),
        email: formData.email.trim() || undefined,
        password: formData.password,
        role: formData.role,
        teamId: (formData.role === 'player_manager' && formData.selectedTeamId) ? formData.selectedTeamId : null,
        teamIds: (formData.role === 'player_manager' && formData.selectedTeamId) ? [formData.selectedTeamId] : [],
        sendPasswordSetupEmail:
          Boolean(editingUser) &&
          sendPasswordSetupEmail &&
          formData.email.trim().includes("@"),
      };

      const success = await onSave(submitData);
      
      if (success) {
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Error saving user:', error);
    }
  }, [formData, sendPasswordSetupEmail, editingUser, onSave, onOpenChange]);

  // Memoized cancel handler
  const handleCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // Memoized computed values
  const isTeamSelectionDisabled = useMemo(() => 
    formData.role === "admin" || formData.role === "referee", 
    [formData.role]
  );

  const modalTitle = useMemo(() => 
    editingUser ? "Gebruiker bewerken" : "Nieuwe gebruiker toevoegen",
    [editingUser]
  );

  const modalDescription = useMemo(() => 
    editingUser ? "Bewerk de gegevens van de gebruiker" : "Voeg een nieuwe gebruiker toe",
    [editingUser]
  );

  const submitButtonText = useMemo(() => 
    isLoading ? "Bezig..." : (editingUser ? "Bijwerken" : "Toevoegen"),
    [isLoading, editingUser]
  );

  const hasInviteEmail = useMemo(
    () => !editingUser && formData.email.trim().includes("@"),
    [editingUser, formData.email],
  );

  const canSendPasswordSetupEmail = useMemo(
    () => Boolean(editingUser) && formData.email.trim().includes("@"),
    [editingUser, formData.email],
  );

  const passwordLabel = useMemo(() => {
    if (editingUser) return "Nieuw wachtwoord (leeg laten om niet te wijzigen)";
    if (hasInviteEmail) return "Tijdelijk wachtwoord (optioneel)";
    return "Wachtwoord *";
  }, [editingUser, hasInviteEmail]);

  const passwordPlaceholder = useMemo(() => {
    if (editingUser) return "Nieuw wachtwoord (optioneel)";
    if (hasInviteEmail) return "Laat leeg voor uitnodiging per e-mail";
    return "Voer wachtwoord in";
  }, [editingUser, hasInviteEmail]);

  const isPasswordRequired = useMemo(
    () => !editingUser && !hasInviteEmail,
    [editingUser, hasInviteEmail],
  );

  // Memoized team options
  const teamOptions = useMemo(() => 
    teams.map((team) => (
      <option key={team.id} value={team.id}>
        {team.name}
      </option>
    )),
    [teams]
  );

  // Memoized team selection value
  const teamSelectionValue = useMemo(() => 
    isTeamSelectionDisabled ? "" : (formData.selectedTeamId || ""),
    [isTeamSelectionDisabled, formData.selectedTeamId]
  );

  // Memoized team selection className
  const teamSelectionClassName = useMemo(() => 
    `modal__input ${isTeamSelectionDisabled ? 'opacity-50 cursor-not-allowed' : ''}`,
    [isTeamSelectionDisabled]
  );

  // Memoized team label
  const teamLabel = useMemo(() => {
    if (isTeamSelectionDisabled) {
      return (
        <>
          Team{' '}
          <span className="text-orange-600 text-sm">(niet beschikbaar voor deze rol)</span>
        </>
      );
    }
    return (
      <>
        Team <span className="text-muted-foreground text-sm font-normal">(optioneel)</span>
      </>
    );
  }, [isTeamSelectionDisabled]);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={modalTitle}
      size="md"
      aria-describedby="user-modal-description"
      primaryAction={{
        label: submitButtonText,
        onClick: () => handleSubmit({ preventDefault: () => {} } as React.FormEvent),
        disabled: isLoading,
        variant: "primary",
        loading: isLoading,
      }}
      secondaryAction={{
        label: "Annuleren",
        onClick: handleCancel,
        disabled: isLoading,
        variant: "secondary",
      }}
    >
      <AppModalBody>
        <div id="user-modal-description" className="sr-only">
          {modalDescription}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div className="space-y-2">
            <label className="text-brand-dark font-medium">Gebruikersnaam *</label>
            <Input
              placeholder="Voer gebruikersnaam in"
              className="modal__input"
              value={formData.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              disabled={isLoading}
              required
            />
          </div>
          
          {/* Email */}
          <div className="space-y-2">
            <label className="text-brand-dark font-medium">E-mail (optioneel)</label>
            <Input
              type="email"
              placeholder="E-mailadres (optioneel)"
              className="modal__input"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              disabled={isLoading}
            />
          </div>
          
          {/* Password */}
          <div className="space-y-2">
            <label className="text-brand-dark font-medium">{passwordLabel}</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder={passwordPlaceholder}
                className="modal__input pr-11"
                value={formData.password}
                onChange={(e) => handleInputChange('password', e.target.value)}
                disabled={isLoading}
                minLength={6}
                required={isPasswordRequired}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                disabled={isLoading}
                className="absolute right-0 top-0 flex h-full min-h-[44px] min-w-[44px] items-center justify-center rounded-r-md text-brand-500 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                aria-label={showPassword ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden />
                )}
              </button>
            </div>
            {hasInviteEmail && (
              <Alert className="border-primary/20 bg-brand-50/60">
                <Mail className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  De gebruiker ontvangt een e-mail met een link om een persoonlijk wachtwoord in te stellen.
                  Laat het wachtwoord leeg om alleen via die link te activeren.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {editingUser ? (
            <div
              className={cn(
                "flex items-start gap-3 rounded-lg border border-primary/15 bg-brand-50/40 p-3",
                !canSendPasswordSetupEmail && "opacity-70",
              )}
            >
              <Checkbox
                id="send-password-setup-email"
                checked={sendPasswordSetupEmail && canSendPasswordSetupEmail}
                onCheckedChange={(checked) =>
                  setSendPasswordSetupEmail(checked === true)
                }
                disabled={isLoading || !canSendPasswordSetupEmail}
                className="mt-1"
                aria-describedby="send-password-setup-email-hint"
              />
              <div className="min-w-0 space-y-1">
                <label
                  htmlFor="send-password-setup-email"
                  className="block text-sm font-medium text-brand-dark cursor-pointer"
                >
                  Stuur e-mail om wachtwoord in te stellen
                </label>
                <p
                  id="send-password-setup-email-hint"
                  className="text-xs text-muted-foreground leading-relaxed"
                >
                  {canSendPasswordSetupEmail
                    ? "Na het bijwerken ontvangt de gebruiker een link om een (nieuw) wachtwoord te kiezen."
                    : "Vul eerst een geldig e-mailadres in om deze optie te gebruiken."}
                </p>
              </div>
            </div>
          ) : null}
          
          {/* Role */}
          <div className="space-y-2">
            <label className="text-brand-dark font-medium">Rol *</label>
            <select
              className="modal__input"
              value={formData.role}
              onChange={(e) => handleInputChange('role', e.target.value as "admin" | "referee" | "player_manager")}
              disabled={isLoading}
              required
            >
              <option value="player_manager">Teamverantwoordelijke</option>
              <option value="admin">Administrator</option>
              <option value="referee">Scheidsrechter</option>
            </select>
          </div>
          
          {/* Team Selection */}
          <div className="space-y-2">
            <label className="text-brand-dark font-medium">
              {teamLabel}
            </label>
            <select
              className={teamSelectionClassName}
              value={teamSelectionValue}
              onChange={(e) => handleInputChange('selectedTeamId', e.target.value ? parseInt(e.target.value) : null)}
              disabled={isLoading || isTeamSelectionDisabled}
            >
              <option value="">Geen team</option>
              {teamOptions}
            </select>
          </div>

        </form>
      </AppModalBody>
    </AppModal>
  );
};

