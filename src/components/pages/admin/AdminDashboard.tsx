
import React, { useMemo, lazy, Suspense, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { AdminTabSkeleton } from "@/components/common/RoutePageSkeleton";
import { useAuth } from "@/hooks/useAuth";
import PlayerPage from "@/components/pages/admin/players/PlayerPage.tsx";
import FinancialPage from "@/components/pages/admin/financial/FinancialPage";
import UserPage from "@/components/pages/admin/users/UserPage";
import TeamsPage from "@/components/pages/admin/teams/TeamsPage";
import MatchesPage from "@/components/pages/admin/matches/MatchesPage";
import NotAvailable from "@/components/common/NotAvailable";
import AlgemeenPage from "@/components/pages/public/information/AlgemeenPage";
import { useTabVisibility } from "@/context/TabVisibilityContext";

import AdminPlayoffMatchesPage from "@/components/pages/admin/matches/AdminPlayoffMatchesPage";
import ScheidsrechtersPage from "@/components/pages/admin/scheidsrechter/ScheidsrechtersPage";
import BlogPage from "@/components/pages/admin/blog/BlogPage";
import NotificationPage from "@/components/pages/admin/notifications/NotificationPage";
import SchorsingenPage from "@/components/pages/admin/schorsingen/SchorsingenPage";
import { ADMIN_ROUTES } from "@/config/routes";
import { Navigate } from "react-router-dom";
import { useSuspensionsData } from "@/domains/cards-suspensions";
import {
  formatSuspensionMatchLines,
} from "@/domains/cards-suspensions";
import { Ban } from "lucide-react";

const SettingsPanel = lazy(
  () => import("@/components/pages/admin/settings/components/SettingsPanel"),
);
const SeasonPlanningHub = lazy(
  () => import("@/components/pages/admin/season-calendar/SeasonPlanningHub"),
);
const SeasonPlanningRedirect = lazy(
  () => import("@/components/pages/admin/season-calendar/SeasonPlanningRedirect"),
);
const SuperAdminOrgHubPage = lazy(() =>
  import("@/components/pages/superadmin/SuperAdminOrgHubPage").then((m) => ({
    default: m.SuperAdminOrgHubPage,
  })),
);

type TabName = "match-forms" | "match-forms-league" | "match-forms-cup" | "match-forms-playoffs" | "players" | "teams" | "users" | "competition" | "playoffs" | "financial" | "settings" | "platform-beheer" | "cup" | "season-calendar" | "season-planning" | "suspensions" | "schorsingen" | "polls" | "scheidsrechters" | "blog-management" | "notification";

interface AdminDashboardProps {
  activeTab: TabName;
  setActiveTab: (tab: TabName) => void;
}

/** Mount tab content only when active — avoids fetching every admin page at once. */
const LazyTabContent = ({
  value,
  activeTab,
  children,
}: {
  value: TabName;
  activeTab: TabName;
  children: ReactNode;
}) => (
  <TabsContent value={value} className="mt-0">
    {activeTab === value ? (
      <Suspense
        fallback={<AdminTabSkeleton />}
      >
        {children}
      </Suspense>
    ) : null}
  </TabsContent>
);

const TeamManagerSuspensionNotice: React.FC = () => {
  const { user } = useAuth();
  const { suspensions, isLoading } = useSuspensionsData();

  const activeTeamSuspensions = useMemo(() => {
    if (!user?.teamId || !suspensions) return [];
    return suspensions
      .filter((suspension) => suspension.teamId === user.teamId && suspension.status === 'active')
      .sort((a, b) => {
        const dateA = a.suspendedForMatch?.date || a.endDate || a.cardDate || '';
        const dateB = b.suspendedForMatch?.date || b.endDate || b.cardDate || '';
        return dateA.localeCompare(dateB);
      });
  }, [suspensions, user?.teamId]);

  if (isLoading || activeTeamSuspensions.length === 0) return null;

  return (
    <Alert className="mb-4 border-destructive/30 bg-destructive/10">
      <Ban className="h-4 w-4 text-destructive" />
      <AlertTitle className="text-destructive">
        Speler geschorst voor komende wedstrijd
      </AlertTitle>
      <AlertDescription className="space-y-3">
        {activeTeamSuspensions.map((suspension) => {
          const matchLines = formatSuspensionMatchLines(suspension);
          return (
          <div key={suspension.id} className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <p>
                <span className="font-medium text-foreground">{suspension.playerName}</span>
                <span className="text-muted-foreground"> · {suspension.reason}</span>
              </p>
              {matchLines.length > 0 ? (
                <div className="space-y-0.5 text-sm text-muted-foreground">
                  {matchLines.map((line, index) => (
                    <p key={`${suspension.id}-match-${index}`}>
                      Geschorst voor {line}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Komende wedstrijd(en) nog niet ingepland
                </p>
              )}
              {suspension.notes && (
                <p className="text-sm text-foreground/90 border-l-2 border-primary/30 pl-2">
                  <span className="font-medium">Bericht: </span>
                  {suspension.notes}
                </p>
              )}
            </div>
            <Badge variant="destructive" className="w-fit shrink-0">
              Niet speelgerechtigd
            </Badge>
          </div>
          );
        })}
      </AlertDescription>
    </Alert>
  );
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ activeTab, setActiveTab }) => {
  const { user, isSuperAdmin } = useAuth();
  const isAdmin = user?.role === "admin";
  const isTeamManager = user?.role === "player_manager";
  const { isTabVisible } = useTabVisibility();

  const canSeeLeagueForms = isTabVisible("match-forms-league");
  const canSeeCupForms = isTabVisible("match-forms-cup");
  const canSeePlayoffForms = isTabVisible("match-forms-playoffs");
  const canSeeAnyForms = canSeeLeagueForms || canSeeCupForms || canSeePlayoffForms;
  
  // For team managers, use their teamId; for admins/referees use 0
  const matchFormsTeamId = isTeamManager ? (user?.teamId || 0) : 0;
  const matchFormsTeamName = isTeamManager ? "Team" : "Admin";

  return (
    <div className="w-full admin-dashboard">
      {/* Tab Content */}
      <div className="container-adaptive px-4 sm:px-6 lg:px-8 py-8 w-full">
        {isTeamManager && <TeamManagerSuspensionNotice />}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabName)} className="w-full">
          <div className="animate-fade-in">
            <LazyTabContent value="match-forms" activeTab={activeTab}>
              {canSeeAnyForms ? (
                <MatchesPage teamId={matchFormsTeamId} teamName={matchFormsTeamName} />
              ) : (
                user?.role === 'referee' ? <AlgemeenPage /> : <NotAvailable />
              )}
            </LazyTabContent>
            
            <LazyTabContent value="match-forms-league" activeTab={activeTab}>
              {canSeeLeagueForms ? (
                <MatchesPage teamId={matchFormsTeamId} teamName={matchFormsTeamName} initialTab="league" />
              ) : (
                user?.role === 'referee' ? <AlgemeenPage /> : <NotAvailable />
              )}
            </LazyTabContent>
            
            <LazyTabContent value="match-forms-cup" activeTab={activeTab}>
              {canSeeCupForms ? (
                <MatchesPage teamId={matchFormsTeamId} teamName={matchFormsTeamName} initialTab="cup" />
              ) : (
                user?.role === 'referee' ? <AlgemeenPage /> : <NotAvailable />
              )}
            </LazyTabContent>
            
            <LazyTabContent value="match-forms-playoffs" activeTab={activeTab}>
              {canSeePlayoffForms ? (
                <AdminPlayoffMatchesPage />
              ) : (
                user?.role === 'referee' ? <AlgemeenPage /> : <NotAvailable />
              )}
            </LazyTabContent>
            
            <LazyTabContent value="players" activeTab={activeTab}>
              {isTeamManager ? (
                <Navigate to={`${ADMIN_ROUTES.profile}#spelers`} replace />
              ) : (
                <PlayerPage />
              )}
            </LazyTabContent>
            
            {isTabVisible("teams") && (
              <LazyTabContent value="teams" activeTab={activeTab}>
                <TeamsPage />
              </LazyTabContent>
            )}

            {isTeamManager && (
              <LazyTabContent value="schorsingen" activeTab={activeTab}>
                <Navigate to={`${ADMIN_ROUTES.profile}#schorsingen`} replace />
              </LazyTabContent>
            )}
            
            {isAdmin && (
              <>
                <LazyTabContent value="suspensions" activeTab={activeTab}>
                  <SchorsingenPage />
                </LazyTabContent>
                
                <LazyTabContent value="schorsingen" activeTab={activeTab}>
                  <SchorsingenPage />
                </LazyTabContent>
                
                <LazyTabContent value="users" activeTab={activeTab}>
                  <UserPage />
                </LazyTabContent>
                
                <LazyTabContent value="financial" activeTab={activeTab}>
                  <FinancialPage />
                </LazyTabContent>
                
                <LazyTabContent value="polls" activeTab={activeTab}>
                  <ScheidsrechtersPage />
                </LazyTabContent>

                <LazyTabContent value="settings" activeTab={activeTab}>
                  <SettingsPanel />
                </LazyTabContent>

                {isTabVisible("blog-management") && (
                  <LazyTabContent value="blog-management" activeTab={activeTab}>
                    <BlogPage />
                  </LazyTabContent>
                )}

                {isTabVisible("notification") && (
                  <LazyTabContent value="notification" activeTab={activeTab}>
                    <NotificationPage />
                  </LazyTabContent>
                )}
              </>
            )}

            {isSuperAdmin && (
              <>
                <LazyTabContent value="season-planning" activeTab={activeTab}>
                  <SeasonPlanningHub />
                </LazyTabContent>

                <LazyTabContent value="competition" activeTab={activeTab}>
                  <SeasonPlanningRedirect />
                </LazyTabContent>

                <LazyTabContent value="cup" activeTab={activeTab}>
                  <SeasonPlanningRedirect />
                </LazyTabContent>

                <LazyTabContent value="playoffs" activeTab={activeTab}>
                  <SeasonPlanningRedirect />
                </LazyTabContent>

                <LazyTabContent value="season-calendar" activeTab={activeTab}>
                  <SeasonPlanningRedirect />
                </LazyTabContent>

                <LazyTabContent value="platform-beheer" activeTab={activeTab}>
                  <SuperAdminOrgHubPage embedded />
                </LazyTabContent>
              </>
            )}

            {/* Scheidsrechters tab - removed as it's now handled via main navigation */}
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default AdminDashboard;
