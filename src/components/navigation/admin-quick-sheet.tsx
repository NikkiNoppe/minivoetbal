import React, { memo } from "react";
import { useOrgAwareNavigate } from "@/hooks/useOrgAwareNavigate";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { 
  Trophy, Award, Target, Users, Shield, Ban, 
  User, Settings, BookOpen, MessageSquare, Zap, CalendarRange 
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ADMIN_ROUTES } from "@/config/routes";
import { cn } from "@/lib/utils";

interface AdminQuickSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ActionItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  teamManagerOnly?: boolean;
  refereeOnly?: boolean;
}

const matchdayActions: ActionItem[] = [
  { key: "match-forms-league", label: "Competitie Formulier", icon: <Trophy size={16} />, path: ADMIN_ROUTES["match-forms-league"] },
  { key: "match-forms-cup", label: "Beker Formulier", icon: <Award size={16} />, path: ADMIN_ROUTES["match-forms-cup"] },
  { key: "match-forms-playoffs", label: "Play-Off Formulier", icon: <Target size={16} />, path: ADMIN_ROUTES["match-forms-playoffs"], adminOnly: true },
];

const managementActions: ActionItem[] = [
  { key: "players", label: "Spelers", icon: <Users size={16} />, path: ADMIN_ROUTES.players },
  { key: "scheidsrechters", label: "Scheidsrechters", icon: <Shield size={16} />, path: ADMIN_ROUTES.scheidsrechters, refereeOnly: true },
  { key: "schorsingen", label: "Schorsingen", icon: <Ban size={16} />, path: ADMIN_ROUTES.schorsingen, adminOnly: true },
  { key: "teams", label: "Teams", icon: <Shield size={16} />, path: ADMIN_ROUTES.teams, adminOnly: true },
  { key: "users", label: "Gebruikers", icon: <User size={16} />, path: ADMIN_ROUTES.users, adminOnly: true },
];

const organisatieActions: ActionItem[] = [
  { key: "blog-management", label: "Blog", icon: <BookOpen size={16} />, path: ADMIN_ROUTES["blog-management"], adminOnly: true },
  { key: "notification", label: "Berichten", icon: <MessageSquare size={16} />, path: ADMIN_ROUTES["notification"], adminOnly: true },
  { key: "settings", label: "Instellingen", icon: <Settings size={16} />, path: ADMIN_ROUTES.settings, adminOnly: true },
];

const systemActions: ActionItem[] = [
  { key: "season-planning", label: "Seizoensplanning", icon: <CalendarRange size={16} />, path: ADMIN_ROUTES["season-planning"], adminOnly: true, superAdminOnly: true },
];

const AdminQuickSheet: React.FC<AdminQuickSheetProps> = ({ open, onOpenChange }) => {
  const navigate = useOrgAwareNavigate();
  const { user, isSuperAdmin } = useAuth();

  const normalizedRole = String(user?.role || "").toLowerCase();
  const isAdmin = normalizedRole === "admin";
  const isReferee = normalizedRole === "referee";
  const isTeamManager = normalizedRole === "player_manager";

  const filterActions = (actions: ActionItem[]) => {
    return actions.filter(action => {
      if (action.superAdminOnly && !isSuperAdmin) return false;
      if (action.adminOnly && !isAdmin) return false;
      if (action.refereeOnly && !(isAdmin || isReferee)) return false;
      if (action.key === "scheidsrechters" && isReferee && !isAdmin) return false;
      if (action.key === "players" && isTeamManager) return false;
      return true;
    });
  };

  const handleNavigate = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  const visibleMatchday = filterActions(matchdayActions);
  const visibleManagement = filterActions(managementActions);
  const visibleOrganisatie = filterActions(organisatieActions);
  const visibleSystem = filterActions(systemActions);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-xl max-h-[80vh] overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border">
          <SheetTitle className="text-lg font-semibold">Snelle Acties</SheetTitle>
          <SheetDescription className="sr-only">
            Snelle toegang tot beheer functies
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-6">
          {/* Matchday Actions - Most prominent */}
          {visibleMatchday.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Zap size={14} />
                <span>Matchday Acties</span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {visibleMatchday.map(action => (
                  <button
                    key={action.key}
                    onClick={() => handleNavigate(action.path)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg text-left",
                      "bg-primary/10 hover:bg-primary/20 transition-colors",
                      "text-foreground font-medium"
                    )}
                  >
                    <span className="text-primary">{action.icon}</span>
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Management Actions */}
          {visibleManagement.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Users size={14} />
                <span>Beheer</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {visibleManagement.map(action => (
                  <button
                    key={action.key}
                    onClick={() => handleNavigate(action.path)}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg text-left",
                      "bg-muted hover:bg-muted/80 transition-colors",
                      "text-foreground text-sm"
                    )}
                  >
                    <span className="text-muted-foreground">{action.icon}</span>
                    <span className="truncate">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Organisatie */}
          {visibleOrganisatie.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Settings size={14} />
                <span>Organisatie</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {visibleOrganisatie.map(action => (
                  <button
                    key={action.key}
                    onClick={() => handleNavigate(action.path)}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg text-left",
                      "bg-muted hover:bg-muted/80 transition-colors",
                      "text-foreground text-sm"
                    )}
                  >
                    <span className="text-muted-foreground">{action.icon}</span>
                    <span className="truncate">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* System Actions */}
          {visibleSystem.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Settings size={14} />
                <span>Systeem</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {visibleSystem.map(action => (
                  <button
                    key={action.key}
                    onClick={() => handleNavigate(action.path)}
                    className={cn(
                      "flex items-center gap-2 p-3 rounded-lg text-left",
                      "bg-muted hover:bg-muted/80 transition-colors",
                      "text-foreground text-sm"
                    )}
                  >
                    <span className="text-muted-foreground">{action.icon}</span>
                    <span className="truncate">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default memo(AdminQuickSheet);
