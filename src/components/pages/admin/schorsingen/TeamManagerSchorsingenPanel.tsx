import React, { memo, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Shield,
  Trophy,
  Users,
  RefreshCw,
} from "lucide-react";
import { useSuspensionsData } from "@/domains/cards-suspensions";
import {
  PageHeader,
  PROFILE_INSET_PANEL,
  PROFILE_INSET_SECTION,
  PROFILE_INSET_SECTION_MUTED,
  PROFILE_SECTION_LABEL,
  SECTION_COLLAPSIBLE_NESTED_TRIGGER,
} from "@/components/layout";
import { PlayerCardsTable, SuspensionsTable } from "./components";
import { cn } from "@/lib/utils";

export interface TeamManagerSchorsingenPanelProps {
  teamId: number;
  teamName?: string;
  /** Platte profiel-layout — geen geneste cards/collapsibles */
  embedded?: boolean;
}

function ProfileSectionHeader({
  id,
  label,
  trailing,
}: {
  id?: string;
  label: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 id={id} className={PROFILE_SECTION_LABEL}>
        {label}
      </h3>
      {trailing}
    </div>
  );
}

function EligibleStatusStrip({ teamName }: { teamName: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border px-3 py-2.5",
        "border-green-200/70 bg-green-50/90 dark:border-green-900/50 dark:bg-green-950/25",
      )}
      role="status"
    >
      <CheckCircle2
        className="mt-0.5 h-4 w-4 shrink-0 text-green-600 dark:text-green-400"
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">Iedereen speelgerechtigd</p>
        <p className="text-xs text-muted-foreground leading-snug">
          Geen actieve schorsingen voor {teamName}.
        </p>
      </div>
    </div>
  );
}

function ActiveSuspensionsSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Schorsingen laden">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-md border border-border/50 bg-card px-3 py-2.5 space-y-1.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      ))}
    </div>
  );
}

export const TeamManagerSchorsingenPanel = memo(function TeamManagerSchorsingenPanel({
  teamId,
  teamName: teamNameProp,
  embedded = false,
}: TeamManagerSchorsingenPanelProps) {
  const [pastOpen, setPastOpen] = useState(false);

  const {
    suspensions,
    playerCards,
    isLoading,
    playerCardsError,
    suspensionsError,
    refetchPlayerCards,
    refetchSuspensions,
  } = useSuspensionsData();

  const teamSuspensions = useMemo(() => {
    if (!suspensions) return [];
    return suspensions
      .filter((s) => s.teamId === teamId)
      .sort((a, b) => {
        const dateA = a.suspendedForMatch?.date || a.cardDate || a.endDate || "";
        const dateB = b.suspendedForMatch?.date || b.cardDate || b.endDate || "";
        return dateA.localeCompare(dateB);
      });
  }, [suspensions, teamId]);

  const activeSuspensions = useMemo(
    () => teamSuspensions.filter((s) => s.status === "active"),
    [teamSuspensions],
  );

  const pastSuspensions = useMemo(
    () => teamSuspensions.filter((s) => s.status !== "active"),
    [teamSuspensions],
  );

  const teamPlayerCards = useMemo(() => {
    if (!playerCards) return [];
    return playerCards.filter(
      (c) => c.teamId === teamId && (c.yellowCards > 0 || c.redCards > 0),
    );
  }, [playerCards, teamId]);

  const displayTeamName =
    teamNameProp ||
    teamSuspensions[0]?.teamName ||
    teamPlayerCards[0]?.teamName ||
    "jouw team";

  const handleRefresh = () => {
    void refetchPlayerCards();
    void refetchSuspensions();
  };

  if (playerCardsError || suspensionsError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center">
          Schorsingsgegevens konden niet worden geladen.
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="min-h-[44px] w-full sm:w-auto"
          >
            Opnieuw proberen
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (embedded) {
    return (
      <div className={PROFILE_INSET_PANEL}>
        <section
          aria-labelledby="profile-active-suspensions-heading"
          className={PROFILE_INSET_SECTION}
        >
          <ProfileSectionHeader
            id="profile-active-suspensions-heading"
            label="Actieve schorsingen"
            trailing={
              activeSuspensions.length > 0 ? (
                <Badge variant="destructive" className="text-[10px] px-1.5 h-5">
                  {activeSuspensions.length}
                </Badge>
              ) : null
            }
          />

          {isLoading ? (
            <ActiveSuspensionsSkeleton />
          ) : activeSuspensions.length > 0 ? (
            <div className="overflow-hidden rounded-md border border-destructive/30 bg-destructive/5">
              <SuspensionsTable
                suspensions={activeSuspensions}
                showTeam={false}
                showActions={false}
                isLoading={false}
                variant="profile"
              />
            </div>
          ) : (
            <EligibleStatusStrip teamName={displayTeamName} />
          )}

          {pastSuspensions.length > 0 && (
            <Collapsible open={pastOpen} onOpenChange={setPastOpen} className="mt-3">
              <CollapsibleTrigger
                className={cn(SECTION_COLLAPSIBLE_NESTED_TRIGGER, "group w-full rounded-md")}
              >
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 transition-transform",
                    pastOpen && "rotate-90",
                  )}
                  aria-hidden
                />
                <span>Afgelopen ({pastSuspensions.length})</span>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="overflow-hidden rounded-md border border-border/50 bg-card">
                  <SuspensionsTable
                    suspensions={pastSuspensions}
                    showTeam={false}
                    showActions={false}
                    isLoading={false}
                    variant="profile"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
        </section>

        {(teamPlayerCards.length > 0 || isLoading) && (
          <section
            aria-labelledby="profile-team-cards-heading"
            className={PROFILE_INSET_SECTION_MUTED}
          >
            <ProfileSectionHeader
              id="profile-team-cards-heading"
              label="Kaarten per speler"
              trailing={
                !isLoading && teamPlayerCards.length > 0 ? (
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {teamPlayerCards.length}
                  </span>
                ) : null
              }
            />
            <p className="sr-only">Tik op een speler voor wedstrijddata en schorsingsdetails.</p>
            <PlayerCardsTable
              playerCards={teamPlayerCards}
              suspensions={teamSuspensions}
              showTeam={false}
              isLoading={isLoading}
              compact
              variant="profile"
            />
          </section>
        )}
      </div>
    );
  }

  const cardClass = "border border-border";
  const refreshButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      className="min-h-[44px] w-full sm:w-auto"
      disabled={isLoading}
    >
      <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} aria-hidden />
      Vernieuwen
    </Button>
  );

  return (
    <>
      <PageHeader
        title={`Schorsingen & Kaarten – ${displayTeamName}`}
        subtitle="Overzicht van schorsingen en kaarten voor jouw team"
        icon={Shield}
        rightAction={refreshButton}
      />
      <div className="space-y-6">
        <section role="region" aria-labelledby="team-suspensions-heading">
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle
                id="team-suspensions-heading"
                className="flex items-center gap-2"
              >
                <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
                Schorsingen
              </CardTitle>
              <CardDescription>
                Actieve en afgeronde schorsingen voor spelers van {displayTeamName}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 bg-transparent">
              {teamSuspensions.length === 0 && !isLoading ? (
                <div className="text-center py-12 px-4">
                  <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Shield className="h-8 w-8 text-green-600 dark:text-green-400" aria-hidden />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">Geen schorsingen</h3>
                  <p className="text-sm text-muted-foreground">
                    Alle spelers van {displayTeamName} kunnen deelnemen.
                  </p>
                </div>
              ) : (
                <SuspensionsTable
                  suspensions={teamSuspensions}
                  showTeam={false}
                  showActions={false}
                  isLoading={isLoading}
                />
              )}
            </CardContent>
          </Card>
        </section>

        <section role="region" aria-labelledby="team-cards-heading">
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle id="team-cards-heading" className="flex items-center gap-2">
                <Trophy className="h-5 w-5" aria-hidden />
                Kaarten overzicht
              </CardTitle>
              <CardDescription>
                Gele en rode kaarten voor spelers van {displayTeamName}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 bg-transparent">
              {teamPlayerCards.length === 0 && !isLoading ? (
                <div className="text-center py-12 px-4">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" aria-hidden />
                  </div>
                  <h3 className="text-lg font-semibold mb-2 text-foreground">Geen kaarten</h3>
                  <p className="text-sm text-muted-foreground">
                    Er zijn nog geen kaarten geregistreerd voor {displayTeamName}.
                  </p>
                </div>
              ) : (
                <PlayerCardsTable
                  playerCards={teamPlayerCards}
                  suspensions={teamSuspensions}
                  showTeam={false}
                  isLoading={isLoading}
                  compact
                />
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  );
});
