import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CalendarDays, Check, ChevronDown, Clock, Loader2, X } from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { SectionIcon } from '@/components/layout';
import { AvailabilityPollCard } from '../components/AvailabilityPollCard';
import { RefereeAvailabilityMatrix } from '../components/RefereeAvailabilityMatrix';
import type { ScheduleCluster } from '@/services/scheidsrechter/monthScheduleService';
import {
  buildMatchPollGroupId,
  matchAvailabilityKey,
} from '@/services/scheidsrechter/monthScheduleService';
import type { AvailabilityInput } from '@/services/scheidsrechter/types';
import { cn } from '@/lib/utils';

interface AvailabilityPollSectionProps {
  clusters: ScheduleCluster[];
  myAvailability: Map<string, boolean>;
  onSubmitAvailability: (
    matchId: number,
    pollMonth: string,
    isAvailable: boolean | null,
  ) => Promise<void>;
  onBulkSubmitAvailability?: (pollMonth: string, availabilities: AvailabilityInput[]) => Promise<boolean>;
  onBulkSubmitByMonth?: (byMonth: Record<string, AvailabilityInput[]>) => Promise<boolean>;
  isLoading: boolean;
  isSubmitting?: boolean;
  /** Verberg sectiekop — bv. in profiel-accordion */
  embedded?: boolean;
  layout?: 'checkbox' | 'quick' | 'matrix';
  /** Alleen voor matrix-layout */
  username?: string;
  userId?: number;
}

function groupByMonth(clusters: ScheduleCluster[]) {
  const byMonth = new Map<string, ScheduleCluster[]>();
  clusters.forEach((c) => {
    const arr = byMonth.get(c.poll_month) || [];
    arr.push(c);
    byMonth.set(c.poll_month, arr);
  });
  return byMonth;
}

function hasMatchAvailability(
  availability: Map<string, boolean>,
  pollMonth: string,
  matchId: number,
  clusterKey: string,
): boolean {
  return (
    availability.has(matchAvailabilityKey(matchId)) ||
    availability.has(buildMatchPollGroupId(pollMonth, matchId)) ||
    availability.has(clusterKey)
  );
}

function unansweredByMonth(
  clusters: ScheduleCluster[],
  availability: Map<string, boolean>,
  isAvailable: boolean,
): Record<string, AvailabilityInput[]> {
  const byMonth: Record<string, AvailabilityInput[]> = {};
  for (const cluster of clusters) {
    for (const match of cluster.matches) {
      if (
        hasMatchAvailability(
          availability,
          cluster.poll_month,
          match.match_id,
          cluster.cluster_key,
        )
      ) {
        continue;
      }
      const month = cluster.poll_month;
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push({
        match_id: match.match_id,
        poll_group_id: buildMatchPollGroupId(month, match.match_id),
        is_available: isAvailable,
      });
    }
  }
  return byMonth;
}

/**
 * Toont alle aankomende wedstrijd-clusters waarop de scheidsrechter
 * beschikbaarheid kan aangeven. Geclusterd per (datum + locatie) en
 * gegroepeerd per maand.
 */
export function AvailabilityPollSection({
  clusters,
  myAvailability,
  onSubmitAvailability,
  onBulkSubmitAvailability,
  onBulkSubmitByMonth,
  isLoading,
  isSubmitting = false,
  embedded = false,
  layout = 'quick',
  username = 'Scheidsrechter',
  userId = 0,
}: AvailabilityPollSectionProps) {
  const [bulkPending, setBulkPending] = useState(false);

  const byMonth = useMemo(() => groupByMonth(clusters), [clusters]);
  const totalMoments = useMemo(
    () => clusters.reduce((sum, c) => sum + c.matches.length, 0),
    [clusters],
  );
  const respondedCount = useMemo(
    () =>
      clusters.reduce(
        (sum, c) =>
          sum +
          c.matches.filter((m) =>
            hasMatchAvailability(myAvailability, c.poll_month, m.match_id, c.cluster_key),
          ).length,
        0,
      ),
    [clusters, myAvailability],
  );
  const openCount = totalMoments - respondedCount;
  const canBulkRest = Boolean(onBulkSubmitByMonth) && openCount > 0;
  const busy = bulkPending || isSubmitting;
  const isMatrix = layout === 'matrix';

  const handleFillRemaining = async (isAvailable: boolean) => {
    if (!onBulkSubmitByMonth || openCount === 0) return;
    setBulkPending(true);
    try {
      await onBulkSubmitByMonth(unansweredByMonth(clusters, myAvailability, isAvailable));
    } finally {
      setBulkPending(false);
    }
  };

  if (isLoading) {
    return (
      <section className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
        <span className="sr-only">Beschikbaarheid laden…</span>
      </section>
    );
  }

  if (clusters.length === 0) {
    return (
      <section className="space-y-3">
        {!embedded && (
          <h2 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-700)]">
            <SectionIcon icon={CalendarDays} />
            Beschikbaarheid doorgeven
          </h2>
        )}
        <Card className="border-dashed border-border/80 shadow-sm">
          <CardContent className="p-6 text-center sm:p-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Clock className="h-7 w-7 text-muted-foreground" aria-hidden />
            </div>
            <h3 className="mt-3 text-base font-medium text-foreground">
              {embedded ? "Geen speeldagen in deze maand" : "Geen open speeldagen"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {embedded
                ? "Voor deze maand staan er nog geen toekomstige wedstrijden in het schema. Kies een andere maand of vernieuw als er net speeldagen zijn toegevoegd."
                : "Er staan momenteel geen toekomstige wedstrijden in het schema. Zodra de competitieleiding speeldagen publiceert, kun je hier je beschikbaarheid aangeven."}
            </p>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (isMatrix) {
    return (
      <section className="space-y-3">
        {!embedded ? (
          <h2 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-700)]">
            <SectionIcon icon={CalendarDays} />
            Beschikbaarheid doorgeven
          </h2>
        ) : null}
        <RefereeAvailabilityMatrix
          clusters={clusters}
          myAvailability={myAvailability}
          username={username}
          userId={userId}
          onSubmit={onSubmitAvailability}
          isSubmitting={isSubmitting}
        />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        {!embedded ? (
          <h2 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-700)]">
            <SectionIcon icon={CalendarDays} />
            Beschikbaarheid doorgeven
          </h2>
        ) : (
          <h3 className="text-sm font-semibold text-foreground">Beschikbaarheid doorgeven</h3>
        )}
        <p className="text-sm text-muted-foreground">
          Tik <strong className="font-medium text-foreground">Ja</strong> of{' '}
          <strong className="font-medium text-foreground">Nee</strong> per speeldag, of vul de
          rest in één keer in. Keuzes worden meteen opgeslagen.
        </p>

        {canBulkRest && (
          <div
            className="rounded-xl border border-primary/20 bg-primary/5 p-3 sm:p-4 space-y-3"
            role="group"
            aria-label="Openstaande speeldagen invullen"
          >
            <p className="text-sm font-medium text-foreground">
              Nog {openCount} speeldag{openCount === 1 ? '' : 'en'} zonder antwoord
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                className="min-h-[44px] w-full"
                disabled={busy}
                onClick={() => void handleFillRemaining(true)}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="mr-2 h-4 w-4" aria-hidden />
                )}
                Rest beschikbaar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-[44px] w-full"
                disabled={busy}
                onClick={() => void handleFillRemaining(false)}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <X className="mr-2 h-4 w-4" aria-hidden />
                )}
                Rest niet
              </Button>
            </div>
          </div>
        )}
      </div>

      {Array.from(byMonth.entries()).map(([month, monthClusters]) => {
        const monthLabel = format(new Date(`${month}-01T00:00:00Z`), 'MMMM yyyy', { locale: nl });
        const monthMoments = monthClusters.flatMap((c) =>
          c.matches.map((m) => ({ cluster: c, match: m })),
        );
        const monthOpen = monthMoments.filter(
          ({ cluster, match }) =>
            !hasMatchAvailability(
              myAvailability,
              cluster.poll_month,
              match.match_id,
              cluster.cluster_key,
            ),
        ).length;
        const monthFilled = monthMoments.length - monthOpen;
        const monthComplete = monthOpen === 0;

        return (
          <Collapsible key={month} defaultOpen={!monthComplete} className="space-y-2">
            <CollapsibleTrigger
              className={cn(
                'group flex w-full items-center justify-between gap-2 rounded-lg px-1 py-2 min-h-[44px]',
                'text-sm font-semibold capitalize text-foreground',
                'hover:bg-muted/50 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                  aria-hidden
                />
                {monthLabel}
              </span>
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                {monthComplete
                  ? `${monthFilled}/${monthMoments.length} ingevuld`
                  : `${monthOpen} open`}
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <AvailabilityPollCard
                layout={layout}
                clusters={monthClusters}
                myAvailability={myAvailability}
                onSubmit={async (clusterKey, isAvailable) => {
                  const cluster = monthClusters.find((c) => c.cluster_key === clusterKey);
                  if (!cluster) return;
                  for (const match of cluster.matches) {
                    await onSubmitAvailability(match.match_id, month, isAvailable);
                  }
                }}
                onBulkSubmit={
                  onBulkSubmitAvailability
                    ? (availabilities) => onBulkSubmitAvailability(month, availabilities)
                    : undefined
                }
              />
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </section>
  );
}
