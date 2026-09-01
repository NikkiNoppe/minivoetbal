import React, { memo, useState, useCallback, useRef, useEffect, useMemo } from "react";
import { ToastAction } from "@/components/ui/toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  User, Mail, Shield, Users, Award, Phone, 
  AlertCircle, MapPin, Calendar, Clock, ArrowRight,
  CheckCircle, Lock, Edit2, Save, X, Loader2, ChevronDown, History,
  Wallet, MessageSquare, TrendingDown, CreditCard, Download, FileSpreadsheet, FileJson,
  ClipboardList,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader, PublicPage, PublicSectionHeading, PUBLIC_CARD_CLASS, SectionCollapsibleCard, ProfileSectionsAccordion, SECTION_COLLAPSIBLE_NESTED_TRIGGER, useProfileAccordionItem } from "@/components/layout";
import { FilterSelect } from "@/components/ui/filter-select";
import { useOrganizationContent } from "@/hooks/useOrganizationContent";
import { useOrganization } from "@/hooks/useOrganization";
import { getOrganizationFeatures } from "@/config/organizationFeatures";
import { useMinLoadingGate } from "@/hooks/useMinLoadingGate";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { joinContactEmails, parseContactEmails, validateContactEmails } from "@/lib/contactEmails";
import { useUpcomingMatches } from "@/hooks/useUpcomingMatches";
import { useRefereeMatches } from "@/hooks/useRefereeMatches";
import { formatDateWithDay, formatTimeForDisplay, isoToLocalDateTime } from "@/lib/dateUtils";
import { shouldAutoLockMatch } from "@/lib/matchLockUtils";
import MatchesCard from "@/components/pages/admin/matches/components/MatchesCard";
import { WedstrijdformulierModal } from "@/components/modals/matches/wedstrijdformulier-modal";
import { MatchFormData } from "@/components/pages/admin/matches/types";
import { TeamModal } from "@/components/modals";
import { useToast } from "@/hooks/use-toast";
import { teamService } from "@/services/core";
import { fetchTeamBalanceForSession } from "@/services/core/userProfileSessionFetch";
import { fetchTeamTransactionsByTeamId } from "@/services/financial/financialTransactionsFetch";
import { listApplicationSettingsForSession } from "@/services/core/applicationSettingsSessionFetch";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import RefereeNotesCard from "./RefereeNotesCard";
import { ProfileTeamSuspensionsCard } from "./ProfileTeamSuspensionsCard";
import { ProfileTeamPlayersCard } from "./ProfileTeamPlayersCard";
import { ProfilePollAdminCollapsible } from "./profile-polls/ProfilePollAdminCollapsible";
import { ProfilePollRespondentCollapsible } from "./profile-polls/ProfilePollRespondentCollapsible";
import { rowsToCsv, buildCsvZip } from "@/lib/backupExportUtils";
import { fetchAdminDatabaseBackupForSession } from "@/services/core/adminBackupSessionFetch";
import { ColorPreview } from "@/components/common/ColorPreview";
import { ProfileRefereePlanningCard } from "./ProfileRefereePlanningCard";

const ICON_BUTTON_CLASS = "btn btn--icon btn--outline shrink-0";

// Loading skeleton
const ProfileSkeleton = memo(() => (
  <PublicPage>
    <PageHeader title="Mijn Profiel"
        icon={User} />
    
    <div className="space-y-4 sm:space-y-6">
      <Card className={cn(PUBLIC_CARD_CLASS, "bg-gradient-to-br from-primary/5 to-primary/10")}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3 sm:gap-4">
            <Skeleton className="h-12 w-12 sm:h-14 sm:w-14 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-6 sm:h-7 w-32 sm:w-48" />
              <Skeleton className="h-4 w-24 sm:w-32" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>

      <Card className={PUBLIC_CARD_CLASS}>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="pt-0">
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>

      <Card className={PUBLIC_CARD_CLASS}>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  </PublicPage>
));

// Error component
const ProfileError = memo(() => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <PublicPage>
      <PageHeader title="Mijn Profiel"
        icon={User} />
      <Card className={PUBLIC_CARD_CLASS}>
        <CardContent className="py-12">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2 text-foreground">Fout bij laden</h3>
            <p className="text-muted-foreground mb-6">
              Kon profielgegevens niet laden
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button
                onClick={() => {
                  void queryClient.invalidateQueries({ queryKey: ["userProfile"] });
                }}
                className="min-h-[44px]"
              >
                Opnieuw proberen
              </Button>
              <Button onClick={() => navigate(-1)} variant="outline" className="min-h-[44px]">
                Terug
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </PublicPage>
  );
});

const getClubColorName = (clubColors?: string | null) => {
  if (!clubColors) return null;
  return clubColors.split("-").find((part) => !part.startsWith("#")) || null;
};

interface ProfileTeamShape {
  team_name: string;
  club_colors?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
}

/** Team header + contact — matches /admin/teams styling */
const ProfileTeamDetails: React.FC<{ team: ProfileTeamShape }> = memo(({ team }) => {
  const colorName = getClubColorName(team.club_colors);
  const hasContact =
    team.contact_person || team.contact_phone || team.contact_email;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-semibold text-base text-foreground">{team.team_name}</h3>
        {(colorName || team.club_colors) && (
          <div className="flex items-center gap-2 mt-1">
            {colorName && (
              <p className="text-xs text-muted-foreground">{colorName}</p>
            )}
            {team.club_colors && (
              <ColorPreview
                clubColors={team.club_colors}
                size="sm"
                className="flex-shrink-0"
              />
            )}
          </div>
        )}
      </div>
      {hasContact && (
        <div className="space-y-1.5 text-sm">
          {team.contact_person && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <User className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{team.contact_person}</span>
            </div>
          )}
          {team.contact_phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5 flex-shrink-0" />
              <a
                href={`tel:${team.contact_phone}`}
                className="truncate hover:text-foreground hover:underline"
              >
                {team.contact_phone}
              </a>
            </div>
          )}
          {parseContactEmails(team.contact_email)
            .filter(Boolean)
            .map((email) => (
              <div key={email} className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                <a
                  href={`mailto:${email}`}
                  className="truncate break-all hover:text-foreground hover:underline"
                >
                  {email}
                </a>
              </div>
            ))}
        </div>
      )}
    </div>
  );
});
ProfileTeamDetails.displayName = "ProfileTeamDetails";

// Role badge component
const RoleBadge: React.FC<{ role: string }> = ({ role }) => {
  const roleConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
    admin: { label: "Administrator", variant: "default" },
    player_manager: { label: "Team Manager", variant: "secondary" },
    referee: { label: "Scheidsrechter", variant: "outline" },
  };

  const config = roleConfig[role.toLowerCase()] || { label: role, variant: "outline" as const };

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  );
};

// Combined User & Team Info Card Component
const UserTeamInfoCard: React.FC<{
  user: {
    username: string;
    role: string;
    email?: string;
  };
  team: {
    team_id: number;
    team_name: string;
    club_colors?: string;
    contact_person?: string;
    contact_email?: string;
    contact_phone?: string;
  } | null;
  onTeamUpdate?: () => void;
}> = memo(({ user, team, onTeamUpdate }) => {
  const { user: authUser } = useAuth();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: team?.team_name || '',
    contact_person: team?.contact_person || '',
    contact_email: team?.contact_email || '',
    contact_phone: team?.contact_phone || '',
    club_colors: team?.club_colors || '',
  });
  const formDataRef = useRef(formData);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Keep ref in sync with formData
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  // Sync form data when team prop changes
  useEffect(() => {
    if (team) {
      setFormData({
        name: team.team_name || '',
        contact_person: team.contact_person || '',
        contact_email: team.contact_email || '',
        contact_phone: team.contact_phone || '',
        club_colors: team.club_colors || '',
      });
    }
  }, [team?.team_name, team?.club_colors, team?.contact_person, team?.contact_email, team?.contact_phone]);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (team) {
      // Update formData and ref immediately before opening modal
      const newFormData = {
        name: team.team_name || '',
        contact_person: team.contact_person || '',
        contact_email: team.contact_email || '',
        contact_phone: team.contact_phone || '',
        club_colors: team.club_colors || '',
      };
      setFormData(newFormData);
      formDataRef.current = newFormData; // Update ref immediately
      setIsEditModalOpen(true);
    }
  };

  const handleFormChange = useCallback((field: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: value };
      formDataRef.current = updated; // Update ref immediately
      return updated;
    });
  }, []);

  const handleSave = async () => {
    if (!team) return;

    const emailError = validateContactEmails(formDataRef.current.contact_email);
    if (emailError) {
      toast({
        title: "Validatie fout",
        description: emailError,
        variant: "destructive",
      });
      return;
    }
    
    setIsSaving(true);
    try {
      const currentFormData = formDataRef.current;
      
      const updated = await teamService.updateTeam(team.team_id, {
        contact_person: currentFormData.contact_person?.trim() || null,
        contact_email:
          joinContactEmails(parseContactEmails(currentFormData.contact_email)) || null,
        contact_phone: currentFormData.contact_phone?.trim() || null,
        club_colors: currentFormData.club_colors || null,
      });

      if (updated) {
        toast({
          title: "Succesvol opgeslagen",
          description: "Team gegevens zijn bijgewerkt.",
        });
        setIsEditModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ['userProfile'] });
        queryClient.refetchQueries({ queryKey: ['userProfile'] });
        if (onTeamUpdate) onTeamUpdate();
      } else {
        throw new Error('Update returned null');
      }
    } catch (error: any) {
      console.error('❌ Error updating team:', error);
      const errorMessage = error?.message || 'Onbekende fout';
      const errorDetails = error?.details || error?.hint || '';
      
      toast({
        title: "Fout",
        description: errorDetails 
          ? `Kon team gegevens niet bijwerken: ${errorMessage} (${errorDetails})`
          : `Kon team gegevens niet bijwerken: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const fetchBackupData = useCallback(async () => {
    const backup = await fetchAdminDatabaseBackupForSession();
    const tables = Object.keys(backup);
    return { backup, tables };
  }, []);

  const triggerDownload = useCallback((blob: Blob, filename: string): string => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 500);
    // Revoke after 60s so the fallback toast link stays usable
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
    return url;
  }, []);

  const handleDownloadBackup = useCallback(async (format: 'json' | 'csv') => {
    if (isDownloadingBackup) return;
    setIsDownloadingBackup(true);
    
    try {
      const { backup, tables } = await fetchBackupData();
      const dateStr = new Date().toISOString().slice(0, 10);
      const totalRows = Object.values(backup).reduce((sum, rows) => sum + rows.length, 0);

      let blobUrl: string;
      let filename: string;

      if (format === 'json') {
        const backupData = {
          _metadata: {
            created_at: new Date().toISOString(),
            tables: Object.keys(backup),
            row_counts: Object.fromEntries(Object.entries(backup).map(([k, v]) => [k, v.length]))
          },
          ...backup
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        filename = `backup_${dateStr}.json`;
        blobUrl = triggerDownload(blob, filename);
      } else {
        const csvFiles: Record<string, string> = {};
        for (const [table, rows] of Object.entries(backup)) {
          if (rows.length === 0) continue;
          csvFiles[`${table}.csv`] = rowsToCsv(rows);
        }
        const zipBlob = buildCsvZip(csvFiles);
        filename = `backup_${dateStr}_csv.zip`;
        blobUrl = triggerDownload(zipBlob, filename);
      }
      
      toast({
        title: "Backup klaar",
        description: `${totalRows} rijen uit ${tables.length} tabellen (${format.toUpperCase()}).`,
        action: (
          <ToastAction altText="Download bestand" asChild>
            <a
              href={blobUrl}
              download={filename}
              className="font-semibold underline"
            >
              Download
            </a>
          </ToastAction>
        ),
      });
    } catch (error) {
      console.error('Backup error:', error);
      toast({
        title: "Fout",
        description: "Kon backup niet downloaden.",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingBackup(false);
    }
  }, [isDownloadingBackup, toast, fetchBackupData, triggerDownload]);

  const showCardContent = user.role !== 'admin' || !!team;
  const [detailsOpen, setDetailsOpen] = useState(false);


  return (
    <>
      <Card className={cn(PUBLIC_CARD_CLASS, "bg-gradient-to-br from-primary/5 to-primary/10")}>
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3 sm:gap-4 flex-1">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2 truncate">
                  {user.username}
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <RoleBadge role={user.role} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {/* DB backup button - Admin only */}
              {authUser?.role === 'admin' && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="unstyled"
                      className={ICON_BUTTON_CLASS}
                      disabled={isDownloadingBackup}
                      title="Database backup downloaden"
                      aria-label="Database backup downloaden"
                    >
                      {isDownloadingBackup ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 bg-popover">
                    <DropdownMenuItem onClick={() => handleDownloadBackup('json')} className="cursor-pointer">
                      <FileJson className="mr-2 h-4 w-4" />
                      <span>Download JSON</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDownloadBackup('csv')} className="cursor-pointer">
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      <span>Download CSV (ZIP)</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {/* Edit button for team managers */}
              {team && user.role === 'player_manager' && (
                <Button
                  type="button"
                  variant="unstyled"
                  className="btn btn--icon btn--edit shrink-0"
                  onClick={handleEditClick}
                  title="Team gegevens bewerken"
                  aria-label="Team gegevens bewerken"
                >
                  <Edit2 className="h-4 w-4" aria-hidden />
                </Button>
              )}
              {showCardContent && (
                <Button
                  type="button"
                  variant="unstyled"
                  onClick={() => setDetailsOpen((v) => !v)}
                  className={ICON_BUTTON_CLASS}
                  title={detailsOpen ? 'Details inklappen' : 'Details uitklappen'}
                  aria-label={detailsOpen ? 'Details inklappen' : 'Details uitklappen'}
                  aria-expanded={detailsOpen}
                >
                  <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", detailsOpen && "rotate-180")} aria-hidden />
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Always-visible: team name + club colors */}
        {team && (
          <CardContent className="pt-0 pb-4">
            <div>
              <h3 className="font-semibold text-base text-foreground">{team.team_name}</h3>
              {(getClubColorName(team.club_colors) || team.club_colors) && (
                <div className="flex items-center gap-2 mt-1">
                  {getClubColorName(team.club_colors) && (
                    <p className="text-xs text-muted-foreground">{getClubColorName(team.club_colors)}</p>
                  )}
                  {team.club_colors && (
                    <ColorPreview
                      clubColors={team.club_colors}
                      size="sm"
                      className="flex-shrink-0"
                    />
                  )}
                </div>
              )}
            </div>
          </CardContent>
        )}

        {showCardContent && detailsOpen && (
        <CardContent className="space-y-4 pt-0">
          {/* User Email Section — hidden for admins */}
          {user.role !== 'admin' && (
            <div className="pb-4 border-b border-primary/20">
              <div className="flex items-center gap-2 sm:gap-3 text-sm">
                <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                {user.email ? (
                  <a 
                    href={`mailto:${user.email}`}
                    className="text-primary hover:underline truncate"
                  >
                    {user.email}
                  </a>
                ) : (
                  <span className="text-muted-foreground italic">Geen e-mailadres beschikbaar</span>
                )}
              </div>
            </div>
          )}

          {/* Team contact details */}
          {team ? (
            (team.contact_person || team.contact_phone || team.contact_email) && (
              <div className="space-y-1.5 text-sm">
                {team.contact_person && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{team.contact_person}</span>
                  </div>
                )}
                {team.contact_phone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                    <a
                      href={`tel:${team.contact_phone}`}
                      className="truncate hover:text-foreground hover:underline"
                    >
                      {team.contact_phone}
                    </a>
                  </div>
                )}
                {parseContactEmails(team.contact_email)
                  .filter(Boolean)
                  .map((email) => (
                    <div key={email} className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      <a
                        href={`mailto:${email}`}
                        className="truncate break-all hover:text-foreground hover:underline"
                      >
                        {email}
                      </a>
                    </div>
                  ))}
              </div>
            )
          ) : (
            user.role === 'player_manager' && (
              <div className="text-center py-4">
                <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">
                  Geen team gekoppeld
                </p>
              </div>
            )
          )}
        </CardContent>
        )}

      </Card>

      {/* Edit Team Modal */}
      {team && (
        <TeamModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          editingTeam={team}
          formData={formData}
          onFormChange={handleFormChange}
          onSave={handleSave}
          loading={isSaving}
          hideTeamName={true}
          hidePreferences={true}
        />
      )}
    </>
  );
});

// Custom comparison function for memo to ensure re-render when team data changes
const areTeamInfoEqual = (
  prevProps: {
    user: { username: string; role: string; email?: string };
    team: { team_id: number; team_name: string; club_colors?: string; contact_person?: string; contact_email?: string; contact_phone?: string } | null;
    onTeamUpdate?: () => void;
  },
  nextProps: {
    user: { username: string; role: string; email?: string };
    team: { team_id: number; team_name: string; club_colors?: string; contact_person?: string; contact_email?: string; contact_phone?: string } | null;
    onTeamUpdate?: () => void;
  }
): boolean => {
  // Compare user
  if (prevProps.user.username !== nextProps.user.username ||
      prevProps.user.role !== nextProps.user.role ||
      prevProps.user.email !== nextProps.user.email) {
    return false;
  }
  
  // Compare team - check all relevant fields, especially club_colors
  if (prevProps.team?.team_id !== nextProps.team?.team_id ||
      prevProps.team?.team_name !== nextProps.team?.team_name ||
      prevProps.team?.club_colors !== nextProps.team?.club_colors ||
      prevProps.team?.contact_person !== nextProps.team?.contact_person ||
      prevProps.team?.contact_email !== nextProps.team?.contact_email ||
      prevProps.team?.contact_phone !== nextProps.team?.contact_phone) {
    return false;
  }
  
  // If both are null, they're equal
  if (prevProps.team === null && nextProps.team === null) {
    return true;
  }
  
  // If one is null and the other isn't, they're not equal
  if (prevProps.team === null || nextProps.team === null) {
    return false;
  }
  
  return true;
};

// Create memoized version with custom comparison
const MemoizedUserTeamInfoCard = memo(UserTeamInfoCard, areTeamInfoEqual);
MemoizedUserTeamInfoCard.displayName = 'MemoizedUserTeamInfoCard';

UserTeamInfoCard.displayName = 'UserTeamInfoCard';

// Next Match Card Component - Wrapper with title
const NextMatchCard: React.FC<{
  match: {
    match_id: number;
    match_date: string;
    opponent_name: string;
    home_team_name?: string;
    away_team_name?: string;
    is_home: boolean;
    speeldag?: string;
    location?: string;
    unique_number?: string;
    is_locked?: boolean;
    is_submitted?: boolean;
    home_team_id: number;
    away_team_id: number;
    home_players?: any[];
    away_players?: any[];
    home_score?: number | null;
    away_score?: number | null;
    referee?: string;
    referee_notes?: string;
  };
  teamName: string;
  onSelectMatch: (match: MatchFormData) => void;
  /** Geen sectiekop — voor gebruik binnen SectionCollapsibleCard op profiel */
  embedded?: boolean;
}> = memo(({ match, teamName, onSelectMatch, embedded = false }) => {
  // Determine home and away team names
  const homeTeam = match.is_home ? teamName : (match.opponent_name || match.away_team_name || '');
  const awayTeam = match.is_home ? (match.opponent_name || match.away_team_name || '') : teamName;
  
  // Convert ISO date to local date/time format (same as league page)
  const { date, time } = isoToLocalDateTime(match.match_date);
  
  // Determine match status (same logic as league page)
  const getMatchStatus = () => {
    if (match.is_submitted) {
      return {
        label: "Gespeeld",
        className: "bg-success text-success-foreground border border-success/30",
        icon: CheckCircle,
      };
    }

    const isAutoLocked = shouldAutoLockMatch(date, time);

    if (match.is_locked || isAutoLocked) {
      return {
        label: "Gesloten",
        className: "bg-destructive text-destructive-foreground border border-destructive/30",
        icon: Lock,
      };
    }

    return {
      label: "Open",
      className: "bg-accent text-accent-foreground border border-primary/25",
      icon: Clock,
    };
  };

  const status = getMatchStatus();
  const StatusIcon = status.icon;
  
  // Convert to MatchFormData and open modal
  const handleClick = useCallback(() => {
    const matchFormData: MatchFormData = {
      matchId: match.match_id,
      uniqueNumber: match.unique_number || '',
      date,
      time,
      homeTeamId: match.home_team_id,
      homeTeamName: homeTeam,
      awayTeamId: match.away_team_id,
      awayTeamName: awayTeam,
      location: match.location || 'Te bepalen',
      matchday: match.speeldag || 'Te bepalen',
      isCompleted: !!match.is_submitted,
      isLocked: !!(match.is_locked || shouldAutoLockMatch(date, time)),
      homeScore: match.home_score ?? undefined,
      awayScore: match.away_score ?? undefined,
      referee: match.referee ?? undefined,
      refereeNotes: match.referee_notes ?? undefined,
      homePlayers: match.home_players || [],
      awayPlayers: match.away_players || [],
    };
    onSelectMatch(matchFormData);
  }, [match, homeTeam, awayTeam, date, time, onSelectMatch]);

  const matchButton = (
    <button
      onClick={handleClick}
      className="border-none bg-transparent p-0 transition-all duration-200 text-left w-full group hover:shadow-none hover:border-none hover:bg-transparent cursor-pointer"
    >
      <MatchesCard
        id={undefined}
        home={homeTeam}
        away={awayTeam}
        homeScore={undefined}
        awayScore={undefined}
        date={match.match_date}
        time={time}
        location={match.location || 'Te bepalen'}
        status={undefined}
        badgeSlot={
          <span className="ml-auto flex items-center gap-2">
            <span
              className={cn(
                `${status.className} text-xs font-semibold px-2 py-0.5 shadow-sm rounded flex items-center gap-1`,
              )}
            >
              <StatusIcon className="h-3 w-3 shrink-0" aria-hidden />
              {status.label}
            </span>
          </span>
        }
      />
    </button>
  );

  if (embedded) {
    return matchButton;
  }

  return (
    <section aria-labelledby="next-match-heading" className="space-y-3 sm:space-y-4">
      <PublicSectionHeading id="next-match-heading">
        <span className="inline-flex items-center gap-2">
          <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
          Eerstvolgende wedstrijd
        </span>
      </PublicSectionHeading>
      {matchButton}
    </section>
  );
});
NextMatchCard.displayName = 'NextMatchCard';

// Financial Overview Card - Detailed breakdown for team managers
const FinancialOverviewCard: React.FC<{ teamId: number; teamName?: string }> = memo(({ teamId, teamName }) => {
  const { user } = useAuth();
  const { profileFinancial } = useOrganizationContent();
  const {
    seasonDepositTarget,
    depositDeadlineLabel,
    accountHolder,
    iban,
    seasonDepositNotice,
  } = profileFinancial;
  
  // Fetch balance
  const {
    data: balanceData,
    isLoading: balanceLoading,
    isError: balanceError,
    refetch: refetchBalance,
  } = useQuery({
    queryKey: ['teamBalanceProfile', teamId],
    queryFn: async () => {
      const balance = await fetchTeamBalanceForSession(teamId);
      if (balance === null) throw new Error('Saldo niet beschikbaar');
      return balance;
    },
    enabled: !!user && !!teamId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  // Fetch transaction breakdown
  const {
    data: breakdown,
    isLoading: breakdownLoading,
    isError: breakdownError,
    refetch: refetchBreakdown,
  } = useQuery({
    queryKey: ['teamFinancialBreakdown', teamId],
    queryFn: async () => {
      const rows = await fetchTeamTransactionsByTeamId(teamId);
      const transactions = rows.map((t) => ({
        amount: t.amount,
        costs: {
          name: t.cost_settings?.name,
          category: t.cost_settings?.category,
          amount: t.cost_settings?.amount,
        },
      }));
      let matchCount = 0;
      let fieldCosts = 0;
      let adminCosts = 0;
      let refereeCosts = 0;
      let fines = 0;
      let deposits = 0;

      transactions.forEach((t) => {
        const amount = Number(t.amount != null ? t.amount : (t.costs?.amount ?? 0));
        const category = t.costs?.category || '';
        const name = (t.costs?.name || '').toLowerCase();

        if (category === 'deposit') {
          deposits += amount;
        } else if (category === 'penalty') {
          fines += Math.abs(amount);
        } else if (category === 'match_cost') {
          if (name.includes('veld')) {
            fieldCosts += Math.abs(amount);
            matchCount++;
          } else if (name.includes('administratie')) {
            adminCosts += Math.abs(amount);
          } else if (name.includes('scheidsrechter')) {
            refereeCosts += Math.abs(amount);
          } else {
            fieldCosts += Math.abs(amount);
          }
        }
      });

      return { matchCount, fieldCosts, adminCosts, refereeCosts, fines, deposits };
    },
    enabled: !!user && !!teamId,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  });

  const balance = balanceData ?? 0;
  const isNegative = balance < 0;
  const hasData = balanceData !== undefined && breakdown !== undefined;
  const waitingForInitialLoad =
    !hasData && (balanceLoading || breakdownLoading);
  const loadingGate = useMinLoadingGate(waitingForInitialLoad);
  const isError = balanceError || breakdownError;
  const showSkeleton =
    !loadingGate.timedOut &&
    !isError &&
    (waitingForInitialLoad || !loadingGate.minReady);
  const showTimeoutError = loadingGate.timedOut && !hasData;
  const fmt = (n: number) => `€${n.toFixed(2)}`;
  const remainingAmount =
    balance < seasonDepositTarget ? seasonDepositTarget - balance : 0;
  const hasPaymentDetails = Boolean(accountHolder && iban);

  const handleRetry = () => {
    void refetchBalance();
    void refetchBreakdown();
  };

  if ((isError || showTimeoutError) && !showSkeleton) {
    return (
      <div className="py-4 text-center space-y-3">
        <p className="text-sm text-muted-foreground">
          {showTimeoutError
            ? "Het laden van het financieel overzicht duurt te lang."
            : "Kon financieel overzicht niet laden."}
        </p>
        <Button variant="outline" className="min-h-[44px]" onClick={handleRetry}>
          Opnieuw proberen
        </Button>
      </div>
    );
  }

  return (
    <div>
      {showSkeleton ? (
        <div className="py-4 space-y-2" aria-busy="true" aria-label="Financieel overzicht laden">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Balance hero */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-medium text-muted-foreground">Huidig saldo</span>
            <span className="text-xl font-bold tabular-nums text-primary">
              {isNegative ? '−' : ''}€{Math.abs(balance).toFixed(2)}
            </span>
          </div>

          {/* Compact breakdown grid */}
          {breakdown && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs border-t border-border/50 pt-2.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Wedstrijden</span>
                <span className="font-medium tabular-nums text-foreground">{breakdown.matchCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Boetes</span>
                <span className="font-medium tabular-nums text-primary">{fmt(breakdown.fines)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Veldkosten</span>
                <span className="font-medium tabular-nums text-foreground">{fmt(breakdown.fieldCosts)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scheidsrechter</span>
                <span className="font-medium tabular-nums text-foreground">{fmt(breakdown.refereeCosts)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Administratie</span>
                <span className="font-medium tabular-nums text-foreground">{fmt(breakdown.adminCosts)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Stortingen</span>
                <span className="font-medium tabular-nums text-green-600">{fmt(breakdown.deposits)}</span>
              </div>
            </div>
          )}

          {/* Season deposit notice */}
          <div className="rounded-md bg-primary/10 border border-primary/20 p-4 space-y-3">
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">
                Einde seizoen — saldo aanvullen
              </p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {seasonDepositNotice ? (
                  seasonDepositNotice
                ) : (
                  <>
                    Gelieve tegen <span className="font-medium text-foreground">{depositDeadlineLabel}</span> uw saldo aan te vullen tot <span className="font-medium text-foreground">€{seasonDepositTarget.toFixed(2)}</span>.
                    {balance < seasonDepositTarget ? (
                      <> U dient nog <span className="font-semibold text-foreground">€{remainingAmount.toFixed(2)}</span> over te maken.</>
                    ) : (
                      <> Uw saldo is reeds boven €{seasonDepositTarget.toFixed(2)} — er is geen extra storting nodig.</>
                    )}
                  </>
                )}
              </p>
            </div>
            
            {hasPaymentDetails && (
              <div className="bg-background/80 rounded border border-primary/15 p-3 space-y-1.5 text-xs sm:text-sm">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground text-[11px] sm:text-xs shrink-0">Naam</span>
                  <span className="font-semibold text-foreground text-right">{accountHolder}</span>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground text-[11px] sm:text-xs shrink-0">Rekeningnummer</span>
                  <span className="font-mono font-semibold text-foreground text-right select-all whitespace-nowrap">{iban}</span>
                </div>
                {balance < seasonDepositTarget && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground text-[11px] sm:text-xs shrink-0">Bedrag</span>
                    <span className="font-semibold text-foreground text-right select-all whitespace-nowrap">€{remainingAmount.toFixed(2)}</span>
                  </div>
                )}
                {teamName && (
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-muted-foreground text-[11px] sm:text-xs shrink-0">Vermelding</span>
                    <span className="font-semibold text-foreground text-right select-all">{teamName}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
FinancialOverviewCard.displayName = 'FinancialOverviewCard';

// Admin Message Card Content (without Card wrapper, for use inside collapsible)
const AdminMessageCardContent: React.FC = memo(() => {
  const { user } = useAuth();
  const { data: messages, isLoading } = useQuery({
    queryKey: ['adminMessages', user?.role, user?.id],
    queryFn: async () => {
      const rows = await listApplicationSettingsForSession('admin_messages');
      return rows.slice(0, 20).map((row) => ({ setting_value: row.setting_value }));
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  // Client-side filtering based on targeting + date range
  const filteredMessages = useMemo(() => {
    if (!messages || !user) return [];
    const now = new Date();
    
    return messages.filter((msg: any) => {
      const sv = msg.setting_value;
      if (!sv) return false;
      
      // Date range check
      if (sv.start_date && new Date(sv.start_date) > now) return false;
      if (sv.end_date && new Date(sv.end_date) < now) return false;
      
      // Targeting check
      const targetUsers = Array.isArray(sv.target_users) ? sv.target_users : [];
      const targetRoles = Array.isArray(sv.target_roles) ? sv.target_roles : [];
      
      // If specific users are targeted, check if current user is in the list
      if (targetUsers.length > 0) {
        return targetUsers.includes(user.id);
      }
      
      // If roles are targeted, check if current user's role matches
      if (targetRoles.length > 0) {
        return targetRoles.includes(user.role?.toLowerCase());
      }
      
      // No targeting = show to everyone (backwards compat)
      return true;
    });
  }, [messages, user]);

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'success': return 'bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/30';
      case 'warning': return 'bg-[var(--color-700)]/10 border-[var(--color-700)]/30';
      case 'error': return 'bg-[hsl(var(--destructive))]/10 border-[hsl(var(--destructive))]/30';
      default: return 'bg-[var(--color-500)]/10 border-[var(--color-500)]/30';
    }
  };

  const getTypeAccent = (type: string) => {
    switch (type) {
      case 'success': return 'bg-[hsl(var(--success))]';
      case 'warning': return 'bg-[var(--color-700)]';
      case 'error': return 'bg-[hsl(var(--destructive))]';
      default: return 'bg-[var(--color-500)]';
    }
  };

  return (
    <div>
      {isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : filteredMessages.length > 0 ? (
        <div className="space-y-2">
          {filteredMessages.map((msg: any, i: number) => {
            const sv = msg.setting_value;
            const type = sv?.type || 'info';
            return (
              <div key={i} className={cn(
                "p-3 rounded-lg border relative overflow-hidden",
                getTypeStyle(type)
              )}>
                {/* Left accent bar */}
                <div className={cn("absolute left-0 top-0 bottom-0 w-1 rounded-l-lg", getTypeAccent(type))} />
                <div className="pl-3">
                  {sv?.title && (
                    <p className="text-sm font-semibold text-foreground mb-0.5">{sv.title}</p>
                  )}
                  <p className="text-sm text-foreground">
                    {sv?.message || 'Bericht'}
                  </p>
                  {sv?.start_date && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(sv.start_date).toLocaleDateString('nl-BE')}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic py-2">Geen berichten</p>
      )}
    </div>
  );
});
AdminMessageCardContent.displayName = 'AdminMessageCardContent';

// Referee Upcoming Matches Component
const DUTCH_MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maart",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Augustus",
  "September",
  "Oktober",
  "November",
  "December",
] as const;

/** Seizoen aug–jun. Vanaf augustus: nieuw seizoen (aug–sep dit jaar → jun volgend jaar). */
function getRefereeFormSeason(now: Date) {
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const seasonStartYear = currentMonth >= 8 ? currentYear : currentYear - 1;

  const months: { month: number; year: number; label: string }[] = [];
  for (let month = 8; month <= 12; month += 1) {
    months.push({
      month,
      year: seasonStartYear,
      label: `${DUTCH_MONTH_NAMES[month - 1]} ${seasonStartYear}`,
    });
  }
  for (let month = 1; month <= 6; month += 1) {
    months.push({
      month,
      year: seasonStartYear + 1,
      label: `${DUTCH_MONTH_NAMES[month - 1]} ${seasonStartYear + 1}`,
    });
  }

  const inSeason = months.some(
    (item) => item.month === currentMonth && item.year === currentYear,
  );

  return {
    months,
    selected: inSeason
      ? { month: currentMonth, year: currentYear }
      : { month: 9, year: seasonStartYear },
  };
}

const RefereeUpcomingMatches: React.FC<{
  refereeUsername: string;
  onSelectMatch: (match: MatchFormData) => void;
  embedded?: boolean;
  accordionValue?: string;
  onRequestOpen?: () => void;
}> = memo(({ refereeUsername, onSelectMatch, embedded = false, accordionValue, onRequestOpen }) => {
  const { months: availableMonths, selected: defaultSeasonMonth } = useMemo(
    () => getRefereeFormSeason(new Date()),
    [],
  );

  const [selectedMonth, setSelectedMonth] = useState<number>(defaultSeasonMonth.month);
  const [selectedYear, setSelectedYear] = useState<number>(defaultSeasonMonth.year);

  const { data: refereeMatches, isLoading: matchesLoading } = useRefereeMatches(
    refereeUsername,
    selectedMonth,
    selectedYear
  );

  // Convert referee match to MatchFormData
  const convertToMatchFormData = useCallback((match: any): MatchFormData => {
    const { date, time } = isoToLocalDateTime(match.match_date);
    return {
      matchId: match.match_id,
      uniqueNumber: match.unique_number || '',
      date,
      time,
      homeTeamId: match.home_team_id,
      homeTeamName: match.home_team_name || 'Onbekend',
      awayTeamId: match.away_team_id,
      awayTeamName: match.away_team_name || 'Onbekend',
      location: match.location || 'Te bepalen',
      matchday: match.speeldag || 'Te bepalen',
      isCompleted: !!(match.home_score !== null && match.away_score !== null && match.is_submitted),
      isLocked: !!(match.is_locked || shouldAutoLockMatch(date, time)),
      homeScore: match.home_score,
      awayScore: match.away_score,
      referee: match.referee,
      refereeNotes: match.referee_notes,
      homePlayers: match.home_players || [],
      awayPlayers: match.away_players || [],
    };
  }, []);

  // Determine match status
  const getMatchStatus = useCallback((match: any) => {
    const { date, time } = isoToLocalDateTime(match.match_date);
    if (match.is_submitted) {
      return { label: "Gespeeld", color: "bg-green-500", icon: CheckCircle };
    }
    const isAutoLocked = shouldAutoLockMatch(date, time);
    if (match.is_locked || isAutoLocked) {
      return { label: "Gesloten", color: "bg-red-400", icon: Lock };
    }
    return { label: "Open", color: "bg-muted", icon: Clock };
  }, []);

  const selectedMonthLabel =
    availableMonths.find((item) => item.month === selectedMonth && item.year === selectedYear)
      ?.label ?? `${DUTCH_MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  const monthFilterOptions = useMemo(
    () =>
      availableMonths.map((option) => ({
        value: `${option.month}-${option.year}`,
        label: option.label,
      })),
    [availableMonths],
  );

  const monthFilter = (
    <FilterSelect
      label="Maand"
      value={`${selectedMonth}-${selectedYear}`}
      onValueChange={(value) => {
        const [month, year] = value.split("-").map(Number);
        setSelectedMonth(month);
        setSelectedYear(year);
      }}
      options={monthFilterOptions}
      className="w-full sm:w-[200px]"
    />
  );

  const matchesContent = matchesLoading ? (
    <div className="space-y-3" aria-busy="true">
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
      <span className="sr-only">Wedstrijden laden…</span>
    </div>
  ) : refereeMatches && refereeMatches.length > 0 ? (
        (() => {
          // Split into pending (no scores) and completed (has scores)
          const pendingMatches = refereeMatches.filter((match) => 
            match.home_score === null || match.away_score === null
          );
          const completedMatches = [...refereeMatches.filter((match) => 
            match.home_score !== null && match.away_score !== null
          )].reverse(); // Most recent first

          return (
            <div className="space-y-4">
              {/* Pending / To fill in */}
              {pendingMatches.length > 0 ? (
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Te spelen / In te vullen ({pendingMatches.length})
                  </h3>
                  <div className="space-y-3">
                    {pendingMatches.map((match) => {
                      const status = getMatchStatus(match);
                      const StatusIcon = status.icon;
                      const { date, time } = isoToLocalDateTime(match.match_date);
                      
                      return (
                        <button
                          key={match.match_id}
                          onClick={() => onSelectMatch(convertToMatchFormData(match))}
                          className="border-none bg-transparent p-0 transition-all duration-200 text-left w-full group hover:shadow-none hover:border-none hover:bg-transparent cursor-pointer"
                        >
                          <MatchesCard
                            id={undefined}
                            home={match.home_team_name || 'Onbekend'}
                            away={match.away_team_name || 'Onbekend'}
                            homeScore={match.home_score}
                            awayScore={match.away_score}
                            date={match.match_date}
                            time={time}
                            location={match.location || 'Te bepalen'}
                            status={undefined}
                            badgeSlot={
                              <span className="ml-auto flex items-center gap-2">
                                <span 
                                  className={cn(
                                    `${status.color} text-white text-xs px-2 py-0.5 shadow-sm rounded flex items-center gap-1`,
                                    status.label === "Open" && "bg-warning text-black",
                                  )}
                                >
                                  <StatusIcon className="h-3 w-3 mr-1" />
                                  {status.label}
                                </span>
                              </span>
                            }
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <Card className={PUBLIC_CARD_CLASS}>
                  <CardContent className="py-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      Geen openstaande wedstrijden voor {selectedMonthLabel}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* Completed matches - collapsible */}
              {completedMatches.length > 0 && (
                <Collapsible>
                  <CollapsibleTrigger className={cn(SECTION_COLLAPSIBLE_NESTED_TRIGGER, "group")}>
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                    <History className="h-3.5 w-3.5" />
                    Afgelopen wedstrijden ({completedMatches.length})
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 pt-2">
                      {completedMatches.map((match) => {
                        const { time } = isoToLocalDateTime(match.match_date);
                        
                        return (
                          <button
                            key={match.match_id}
                            onClick={() => onSelectMatch(convertToMatchFormData(match))}
                            className="border-none bg-transparent p-0 transition-all duration-200 text-left w-full group hover:shadow-none hover:border-none hover:bg-transparent cursor-pointer opacity-80 hover:opacity-100"
                          >
                            <MatchesCard
                              id={undefined}
                              home={match.home_team_name || 'Onbekend'}
                              away={match.away_team_name || 'Onbekend'}
                              homeScore={match.home_score}
                              awayScore={match.away_score}
                              date={match.match_date}
                              time={time}
                              location={match.location || 'Te bepalen'}
                              status={undefined}
                              badgeSlot={
                                <span className="ml-auto flex items-center gap-2">
                                  <span className="bg-green-500 text-white text-xs px-2 py-0.5 shadow-sm rounded flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Gespeeld
                                  </span>
                                </span>
                              }
                            />
                          </button>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          );
        })()
      ) : (
        <Card className={PUBLIC_CARD_CLASS}>
          <CardContent className="py-6 text-center">
            <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">
                  Geen wedstrijden voor {selectedMonthLabel}
                </p>
          </CardContent>
        </Card>
      );

  if (embedded) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Vul wedstrijdformulieren in voor wedstrijden waar jij scheidsrechter bent.
          </p>
          {monthFilter}
        </div>
        {matchesContent}
      </div>
    );
  }

  return (
    <section aria-labelledby="referee-matches-heading" className="space-y-3 sm:space-y-4">
      <PublicSectionHeading id="referee-matches-heading" action={monthFilter}>
        <span className="inline-flex items-center gap-2">
          <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
          Komende wedstrijden
        </span>
      </PublicSectionHeading>
      {matchesContent}
    </section>
  );
});
RefereeUpcomingMatches.displayName = 'RefereeUpcomingMatches';

const ProfileRefereeMatchFormsCard: React.FC<{
  refereeUsername: string;
  onSelectMatch: (match: MatchFormData) => void;
  onRequestOpen?: () => void;
}> = memo(({ refereeUsername, onSelectMatch, onRequestOpen }) => {
  const location = useLocation();
  const isOpen = useProfileAccordionItem("referee-match-forms");

  useEffect(() => {
    if (location.hash === "#referee-formulieren" || location.hash === "#referee-match-forms") {
      onRequestOpen?.();
      const timer = window.setTimeout(() => {
        document
          .getElementById("profile-referee-formulieren")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return () => window.clearTimeout(timer);
    }
  }, [location.hash, onRequestOpen]);

  return (
    <SectionCollapsibleCard
      id="profile-referee-formulieren"
      itemClassName="scroll-mt-24"
      accordionValue="referee-match-forms"
      title="Wedstrijdformulieren"
      icon={ClipboardList}
    >
      {isOpen ? (
        <RefereeUpcomingMatches
          embedded
          refereeUsername={refereeUsername}
          onSelectMatch={onSelectMatch}
        />
      ) : null}
    </SectionCollapsibleCard>
  );
});
ProfileRefereeMatchFormsCard.displayName = 'ProfileRefereeMatchFormsCard';

// Main profile page component
const UserProfilePage: React.FC = () => {
  const { user: authUser } = useAuth();
  const { organizationSlug } = useOrganization();
  const { profileFinancial: showProfileFinancial } = getOrganizationFeatures(organizationSlug);
  const { profileData, isLoading, error } = useUserProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Modal state
  const [selectedMatchForm, setSelectedMatchForm] = useState<MatchFormData | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [profileSection, setProfileSection] = useState<string | undefined>();

  const openProfileSection = useCallback((value: string) => {
    setProfileSection(value);
  }, []);

  const isAdmin = authUser?.role === "admin";
  const isReferee = authUser?.role === "referee";
  const canRespondToPolls =
    authUser?.role === "player_manager" || authUser?.role === "referee";

  // Admins have no assigned team — profile RPC returns all teams for admin only
  const managerTeams = isAdmin ? [] : (profileData?.teams ?? []);
  const firstTeam = managerTeams[0];
  const { data: upcomingMatches, isLoading: matchesLoading } = useUpcomingMatches(
    firstTeam?.team_id || null,
    1
  );
  const nextMatch = upcomingMatches?.[0];
  
  // Handle match selection
  const handleSelectMatch = useCallback((match: MatchFormData) => {
    setSelectedMatchForm(match);
    setIsDialogOpen(true);
  }, []);
  
  // Handle dialog close
  const handleDialogClose = useCallback((shouldRefresh: boolean = false) => {
    setIsDialogOpen(false);
    setSelectedMatchForm(null);
    // Optionally refresh data if needed
    if (shouldRefresh) {
      // Could refresh upcoming matches here if needed
    }
  }, []);
  
  // Handle form complete
  const handleFormComplete = useCallback(() => {
    // Invalidate queries to refresh data after match is saved
    queryClient.invalidateQueries({ queryKey: ['upcomingMatches'] });
    queryClient.invalidateQueries({ queryKey: ['refereeMatches'] });
    queryClient.invalidateQueries({ queryKey: ['teamMatches'] });
    handleDialogClose(true);
  }, [handleDialogClose, queryClient]);
  
  const effectiveTeamId = firstTeam?.team_id || authUser?.teamId || 0;

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  // Only show error for real errors, not missing data
  // profileData should always exist now (fallback to auth user)
  if (error && !profileData) {
    return <ProfileError />;
  }

  // profileData should always be available now (has fallback)
  if (!profileData) {
    // This should not happen, but just in case
    return <ProfileSkeleton />;
  }

  const { user } = profileData;

  return (
    <PublicPage>
      <PageHeader title="Mijn Profiel"
        icon={User} />

      {/* Profiel accordion: acties eerst; scheids-planning onderaan (bevestigd op scheidsrechterspagina) */}
      <div className="space-y-4 sm:space-y-6">
        <MemoizedUserTeamInfoCard 
          user={user} 
          team={firstTeam || null}
          onTeamUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ['userProfile'] });
            queryClient.refetchQueries({ queryKey: ['userProfile'] });
          }}
        />

        <ProfileSectionsAccordion
          value={profileSection}
          onValueChange={setProfileSection}
        >
          {user.role === 'player_manager' && firstTeam && (
            <SectionCollapsibleCard
              title="Komende wedstrijd"
              icon={Calendar}
              accordionValue="next-match"
            >
              {matchesLoading ? (
                <div className="space-y-3" aria-busy="true">
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <span className="sr-only">Komende wedstrijd laden…</span>
                </div>
              ) : nextMatch ? (
                <NextMatchCard
                  match={nextMatch}
                  teamName={firstTeam.team_name}
                  onSelectMatch={handleSelectMatch}
                  embedded
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Geen komende wedstrijden gepland.
                </p>
              )}
            </SectionCollapsibleCard>
          )}

          {user.role === 'player_manager' && firstTeam && (
            <ProfileTeamPlayersCard
              teamId={firstTeam.team_id}
              teamName={firstTeam.team_name}
              onRequestOpen={() => openProfileSection('spelers')}
            />
          )}

          {user.role === 'player_manager' && firstTeam && (
            <ProfileTeamSuspensionsCard
              teamId={firstTeam.team_id}
              teamName={firstTeam.team_name}
              onRequestOpen={() => openProfileSection('schorsingen')}
            />
          )}

          {user.role === 'player_manager' && firstTeam && showProfileFinancial && (
            <SectionCollapsibleCard
              title="Financieel"
              icon={Wallet}
              accordionValue="financial"
            >
              <FinancialOverviewCard teamId={firstTeam.team_id} teamName={firstTeam.team_name} />
            </SectionCollapsibleCard>
          )}

          {isReferee && authUser?.username && (
            <ProfileRefereeMatchFormsCard
              refereeUsername={authUser.username}
              onSelectMatch={handleSelectMatch}
              onRequestOpen={() => openProfileSection('referee-match-forms')}
            />
          )}

          <SectionCollapsibleCard
            title="Berichten"
            icon={MessageSquare}
            accordionValue="messages"
          >
            <AdminMessageCardContent />
          </SectionCollapsibleCard>

          <ProfilePollRespondentCollapsible enabled={canRespondToPolls} />

          {isAdmin && <RefereeNotesCard accordionValue="referee-notes" />}

          {isAdmin && <ProfilePollAdminCollapsible accordionValue="admin-polls" />}

          {isReferee && (
            <ProfileRefereePlanningCard onRequestOpen={() => openProfileSection('referee-planning')} />
          )}
        </ProfileSectionsAccordion>

        {!isAdmin && managerTeams.length > 1 && (
          <section aria-labelledby="other-teams-heading" className="space-y-3 sm:space-y-4">
            <PublicSectionHeading
              id="other-teams-heading"
              action={
                <Badge variant="outline" className="text-xs">
                  {managerTeams.length - 1}
                </Badge>
              }
            >
              <span className="inline-flex items-center gap-2">
                <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                Overige teams
              </span>
            </PublicSectionHeading>
            
            <div className="space-y-2">
              {managerTeams.slice(1).map((team) => (
                <Card key={team.team_id} className={PUBLIC_CARD_CLASS}>
                  <CardContent className="!p-4 sm:!p-5">
                    <ProfileTeamDetails team={team} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
      
      {/* Match Form Modal */}
      {selectedMatchForm && (
        <WedstrijdformulierModal
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              handleDialogClose(false);
            }
          }}
          match={selectedMatchForm}
          isAdmin={isAdmin}
          isReferee={isReferee}
          teamId={effectiveTeamId}
          onComplete={handleFormComplete}
        />
      )}
    </PublicPage>
  );
};

export default memo(UserProfilePage);

