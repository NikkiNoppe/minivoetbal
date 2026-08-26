import React, { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { CalendarDays, RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SectionCollapsibleCard,
  useProfileAccordionItem,
} from "@/components/layout";
import { useRefereeDashboard } from "@/components/pages/public/scheidsrechters/hooks/useRefereeDashboard";
import { AvailabilityPollSection } from "@/components/pages/public/scheidsrechters/sections/AvailabilityPollSection";
import { AssignedMatchCard } from "@/components/pages/public/scheidsrechters/components/AssignedMatchCard";
import { cn } from "@/lib/utils";
import {
  buildSeasonMonthOptions,
  getSeasonStartYear,
  isMonthInSeason,
  monthKey,
  resolveDefaultSeasonMonth,
} from "@/lib/refereeSeasonMonths";

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
    username,
    userId,
  } = useRefereeDashboard();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => resolveDefaultSeasonMonth());

  const monthOptions = useMemo(() => buildSeasonMonthOptions(), []);

  useEffect(() => {
    if (isMonthInSeason(selectedMonth) && monthOptions.some((o) => o.value === selectedMonth)) {
      return;
    }
    const preferred = resolveDefaultSeasonMonth();
    if (monthOptions.some((o) => o.value === preferred)) {
      setSelectedMonth(preferred);
      return;
    }
    const seasonSept = monthKey(getSeasonStartYear(), 8);
    setSelectedMonth(seasonSept);
  }, [monthOptions, selectedMonth]);

  const filteredClusters = useMemo(
    () => clusters.filter((c) => c.poll_month === selectedMonth),
    [clusters, selectedMonth],
  );

  const now = Date.now();
  const monthAssignments = useMemo(
    () =>
      assignments.filter((a) => {
        if (!a.match_date) return false;
        const d = new Date(a.match_date);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        return key === selectedMonth;
      }),
    [assignments, selectedMonth],
  );

  const upcomingMonthAssignments = useMemo(
    () =>
      monthAssignments.filter((a) => {
        const matchDate = a.match_date ? new Date(a.match_date).getTime() : 0;
        return matchDate > now;
      }),
    [monthAssignments, now],
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
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger
              className="h-11 min-h-[44px] w-full"
              aria-label="Filter op maand"
            >
              <SelectValue placeholder="Kies maand" />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="capitalize">{option.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        layout="matrix"
        username={username}
        userId={userId}
        clusters={filteredClusters}
        myAvailability={myAvailability}
        onSubmitAvailability={submitAvailability}
        onBulkSubmitAvailability={submitBulkAvailability}
        onBulkSubmitByMonth={submitBulkAvailabilityByMonth}
        isLoading={isLoadingSchedule}
        isSubmitting={isSubmitting}
      />

      {!isLoadingAssignments && upcomingMonthAssignments.length > 0 && (
        <div className="space-y-3 border-t border-border/60 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Shield className="h-4 w-4 text-primary" aria-hidden />
            Toegewezen wedstrijden
            <span className="text-xs font-normal text-muted-foreground">
              ({upcomingMonthAssignments.length} deze maand)
            </span>
          </h3>
          <div className="grid gap-2">
            {upcomingMonthAssignments.map((assignment) => (
              <AssignedMatchCard key={assignment.id} assignment={assignment} />
            ))}
          </div>
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
