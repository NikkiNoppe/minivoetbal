import React, { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { CalendarDays, RefreshCw, Shield, CheckCircle2, CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SectionCollapsibleCard,
  useProfileAccordionItem,
} from "@/components/layout";
import { useRefereeDashboard } from "@/components/pages/public/scheidsrechters/hooks/useRefereeDashboard";
import { AvailabilityPollSection } from "@/components/pages/public/scheidsrechters/sections/AvailabilityPollSection";
import { AssignedMatchCard } from "@/components/pages/public/scheidsrechters/components/AssignedMatchCard";
import { cn } from "@/lib/utils";

interface ProfileRefereePlanningCardProps {
  accordionValue?: string;
  onRequestOpen?: () => void;
}

function ProfileRefereePlanningContent() {
  const {
    clusters,
    myAvailability,
    assignments,
    isLoadingSchedule,
    isLoadingAssignments,
    submitAvailability,
    submitBulkAvailability,
    submitBulkAvailabilityByMonth,
    isSubmitting,
    refreshData,
  } = useRefereeDashboard();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const now = Date.now();
  const upcomingAssignments = useMemo(
    () =>
      assignments.filter((a) => {
        const matchDate = a.match_date ? new Date(a.match_date).getTime() : 0;
        return matchDate > now;
      }),
    [assignments, now],
  );

  const stats = useMemo(() => {
    const month = new Date().getUTCMonth();
    const year = new Date().getUTCFullYear();
    const thisMonth = assignments.filter((a) => {
      if (!a.match_date) return false;
      const d = new Date(a.match_date);
      return d.getUTCMonth() === month && d.getUTCFullYear() === year;
    }).length;
    return {
      thisMonth,
      upcoming: upcomingAssignments.length,
      total: assignments.length,
    };
  }, [assignments, upcomingAssignments.length]);

  const pendingAvailability = useMemo(
    () => clusters.filter((c) => !myAvailability.has(c.cluster_key)).length,
    [clusters, myAvailability],
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } finally {
      setIsRefreshing(false);
    }
  };

  const loading = isLoadingSchedule || isLoadingAssignments;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="min-h-[32px] px-2.5 text-xs">
            <CalendarRange className="mr-1 h-3.5 w-3.5" aria-hidden />
            {stats.thisMonth} deze maand
          </Badge>
          <Badge variant="outline" className="min-h-[32px] px-2.5 text-xs">
            <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-success" aria-hidden />
            {stats.upcoming} komend
          </Badge>
          {pendingAvailability > 0 && !loading && (
            <Badge className="min-h-[32px] bg-warning text-warning-foreground px-2.5 text-xs">
              {pendingAvailability} open
            </Badge>
          )}
        </div>
        <Button
          type="button"
          variant="unstyled"
          className="btn btn--icon shrink-0"
          onClick={() => void handleRefresh()}
          disabled={isRefreshing || loading}
          aria-label="Planning vernieuwen"
        >
          <RefreshCw
            className={cn("h-4 w-4", isRefreshing && "animate-spin")}
            aria-hidden
          />
        </Button>
      </div>

      <AvailabilityPollSection
        embedded
        layout="quick"
        clusters={clusters}
        myAvailability={myAvailability}
        onSubmitAvailability={submitAvailability}
        onBulkSubmitAvailability={submitBulkAvailability}
        onBulkSubmitByMonth={submitBulkAvailabilityByMonth}
        isLoading={isLoadingSchedule}
        isSubmitting={isSubmitting}
      />

      {!isLoadingAssignments && (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Shield className="h-4 w-4 text-primary" aria-hidden />
            Toegewezen wedstrijden
            {upcomingAssignments.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({upcomingAssignments.length} komend)
              </span>
            )}
          </h3>

          {upcomingAssignments.length > 0 ? (
            <div className="grid gap-2">
              {upcomingAssignments.map((assignment) => (
                <AssignedMatchCard key={assignment.id} assignment={assignment} />
              ))}
            </div>
          ) : stats.total > 0 ? (
            <p className="text-sm text-muted-foreground">
              Geen komende toewijzingen. Vul je beschikbaarheid in zodat de coördinator je kan
              inplannen.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nog geen wedstrijden toegewezen. Geef eerst je beschikbaarheid door.
            </p>
          )}

          {assignments.length > upcomingAssignments.length && (
            <p className="text-center text-xs text-muted-foreground">
              {assignments.length - upcomingAssignments.length} afgelopen wedstrijd
              {assignments.length - upcomingAssignments.length === 1 ? "" : "en"} — zie
              Wedstrijdformulieren
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function ProfileRefereePlanningCard({
  accordionValue = "referee-planning",
  onRequestOpen,
}: ProfileRefereePlanningCardProps) {
  const location = useLocation();
  const isOpen = useProfileAccordionItem(accordionValue);

  useEffect(() => {
    if (location.hash === "#referee-planning" || location.hash === "#planning") {
      onRequestOpen?.();
      const timer = window.setTimeout(() => {
        document
          .getElementById("profile-referee-planning")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return () => window.clearTimeout(timer);
    }
  }, [location.hash, onRequestOpen]);

  return (
    <SectionCollapsibleCard
      id="profile-referee-planning"
      itemClassName="scroll-mt-24"
      accordionValue={accordionValue}
      title="Mijn planning"
      icon={CalendarDays}
    >
      {isOpen ? <ProfileRefereePlanningContent /> : null}
    </SectionCollapsibleCard>
  );
}
