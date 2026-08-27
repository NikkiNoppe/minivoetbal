import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  CalendarDays,
  AlertCircle,
  Check,
  X,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { SECTION_COLLAPSIBLE_NESTED_TRIGGER } from '@/components/layout';
import type { ScheduleCluster } from '@/services/scheidsrechter/monthScheduleService';
import {
  buildMatchPollGroupId,
  matchAvailabilityKey,
} from '@/services/scheidsrechter/monthScheduleService';
import type { AvailabilityInput } from '@/services/scheidsrechter/types';

type AvailChoice = 'unset' | 'yes' | 'no';
type BulkMode = 'all-yes' | 'all-no' | 'rest-yes' | 'rest-no';

interface AvailabilityPollCardProps {
  clusters: ScheduleCluster[];
  myAvailability: Map<string, boolean>;
  onSubmit: (clusterKey: string, isAvailable: boolean) => Promise<void>;
  onBulkSubmit?: (availabilities: AvailabilityInput[]) => Promise<boolean>;
  /** compact = profiel / mobiel met grote tikknoppen */
  layout?: 'checkbox' | 'quick';
}

function clusterHasResponse(
  cluster: ScheduleCluster,
  availability: Map<string, boolean>,
): boolean {
  if (availability.has(cluster.cluster_key)) return true;
  return cluster.matches.some(
    (m) =>
      availability.has(matchAvailabilityKey(m.match_id)) ||
      availability.has(buildMatchPollGroupId(cluster.poll_month, m.match_id)),
  );
}

function clusterIsAvailable(
  cluster: ScheduleCluster,
  availability: Map<string, boolean>,
): boolean {
  if (availability.has(cluster.cluster_key)) {
    return availability.get(cluster.cluster_key) === true;
  }
  return cluster.matches.some((m) => {
    const matchKey = matchAvailabilityKey(m.match_id);
    const monthKey = buildMatchPollGroupId(cluster.poll_month, m.match_id);
    if (availability.has(matchKey)) return availability.get(matchKey) === true;
    if (availability.has(monthKey)) return availability.get(monthKey) === true;
    return false;
  });
}

function getChoice(cluster: ScheduleCluster, availability: Map<string, boolean>): AvailChoice {
  if (!clusterHasResponse(cluster, availability)) return 'unset';
  return clusterIsAvailable(cluster, availability) ? 'yes' : 'no';
}

export function AvailabilityPollCard({
  clusters,
  myAvailability,
  onSubmit,
  onBulkSubmit,
  layout = 'quick',
}: AvailabilityPollCardProps) {
  const [localAvailability, setLocalAvailability] = useState<Map<string, boolean>>(myAvailability);
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocalAvailability(myAvailability);
  }, [myAvailability]);

  const stats = useMemo(() => {
    const responded = clusters.filter((c) => clusterHasResponse(c, localAvailability)).length;
    const available = clusters.filter((c) => clusterIsAvailable(c, localAvailability)).length;
    const unset = clusters.length - responded;
    return { responded, available, unset, total: clusters.length };
  }, [clusters, localAvailability]);

  const { unanswered, answered } = useMemo(() => {
    const open: ScheduleCluster[] = [];
    const done: ScheduleCluster[] = [];
    for (const cluster of clusters) {
      if (clusterHasResponse(cluster, localAvailability)) done.push(cluster);
      else open.push(cluster);
    }
    return { unanswered: open, answered: done };
  }, [clusters, localAvailability]);

  const handleChoice = useCallback(
    async (clusterKey: string, choice: 'yes' | 'no') => {
      setError(null);
      const isAvailable = choice === 'yes';

      setLocalAvailability((prev) => new Map(prev).set(clusterKey, isAvailable));
      setPendingUpdates((prev) => new Set(prev).add(clusterKey));

      try {
        await onSubmit(clusterKey, isAvailable);
      } catch {
        setLocalAvailability((prev) => {
          const next = new Map(prev);
          next.delete(clusterKey);
          return next;
        });
        setError('Kon beschikbaarheid niet opslaan');
      } finally {
        setPendingUpdates((prev) => {
          const next = new Set(prev);
          next.delete(clusterKey);
          return next;
        });
      }
    },
    [onSubmit],
  );

  const handleBulk = async (mode: BulkMode) => {
    if (!onBulkSubmit || clusters.length === 0) return;
    const isAvailable = mode.endsWith('yes');
    const onlyRest = mode.startsWith('rest');
    const targets = onlyRest
      ? clusters.filter((c) => !clusterHasResponse(c, localAvailability))
      : clusters;
    if (targets.length === 0) return;

    setError(null);
    setBulkPending(true);

    const optimistic = new Map(localAvailability);
    const payload: AvailabilityInput[] = [];
    for (const c of targets) {
      optimistic.set(c.cluster_key, isAvailable);
      for (const match of c.matches) {
        const matchKey = matchAvailabilityKey(match.match_id);
        const monthKey = buildMatchPollGroupId(c.poll_month, match.match_id);
        optimistic.set(matchKey, isAvailable);
        optimistic.set(monthKey, isAvailable);
        payload.push({
          match_id: match.match_id,
          poll_group_id: monthKey,
          is_available: isAvailable,
        });
      }
    }
    setLocalAvailability(optimistic);

    try {
      const ok = await onBulkSubmit(payload);
      if (!ok) {
        setLocalAvailability(myAvailability);
        setError('Kon bulk-update niet opslaan');
      }
    } catch {
      setLocalAvailability(myAvailability);
      setError('Kon bulk-update niet opslaan');
    } finally {
      setBulkPending(false);
    }
  };

  if (clusters.length === 0) {
    return (
      <Card className="border-dashed border-border/80 shadow-sm">
        <CardContent className="p-6 text-center sm:p-8">
          <CalendarDays className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-60" />
          <p className="text-sm text-muted-foreground">Geen speeldagen in deze maand</p>
        </CardContent>
      </Card>
    );
  }

  const progressPct = stats.total > 0 ? Math.round((stats.responded / stats.total) * 100) : 0;

  const renderCluster = (cluster: ScheduleCluster) => {
    const choice = getChoice(cluster, localAvailability);
    const isPending = pendingUpdates.has(cluster.cluster_key);
    const dayDate = new Date(`${cluster.match_date}T00:00:00Z`);

    if (layout === 'checkbox') {
      return (
        <CheckboxClusterRow
          key={cluster.cluster_key}
          cluster={cluster}
          dayDate={dayDate}
          isAvailable={choice === 'yes'}
          isPending={isPending}
          onToggle={(checked) => void handleChoice(cluster.cluster_key, checked ? 'yes' : 'no')}
        />
      );
    }

    return (
      <QuickClusterRow
        key={cluster.cluster_key}
        cluster={cluster}
        dayDate={dayDate}
        choice={choice}
        isPending={isPending}
        onChoice={(next) => void handleChoice(cluster.cluster_key, next)}
      />
    );
  };

  return (
    <div className="space-y-3">
      {layout === 'quick' && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">
              {stats.responded}/{stats.total} ingevuld
            </span>
            <span className="text-muted-foreground">{stats.available} beschikbaar</span>
          </div>
          <Progress value={progressPct} className="h-2" aria-label={`Voortgang ${progressPct}%`} />
          {onBulkSubmit && stats.unset > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px] w-full"
                disabled={bulkPending}
                onClick={() => void handleBulk('rest-yes')}
              >
                {bulkPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Check className="mr-1.5 h-4 w-4 text-success" aria-hidden />
                )}
                Rest ja
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px] w-full"
                disabled={bulkPending}
                onClick={() => void handleBulk('rest-no')}
              >
                {bulkPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <X className="mr-1.5 h-4 w-4 text-destructive" aria-hidden />
                )}
                Rest nee
              </Button>
            </div>
          )}
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        {unanswered.length > 0 && unanswered.map(renderCluster)}
        {answered.length > 0 && unanswered.length > 0 ? (
          <Collapsible>
            <CollapsibleTrigger className={cn(SECTION_COLLAPSIBLE_NESTED_TRIGGER, 'group')}>
              <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
              Al ingevuld ({answered.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2 pt-1">{answered.map(renderCluster)}</div>
            </CollapsibleContent>
          </Collapsible>
        ) : (
          answered.map(renderCluster)
        )}
      </div>
    </div>
  );
}

function QuickClusterRow({
  cluster,
  dayDate,
  choice,
  isPending,
  onChoice,
}: {
  cluster: ScheduleCluster;
  dayDate: Date;
  choice: AvailChoice;
  isPending: boolean;
  onChoice: (choice: 'yes' | 'no') => void;
}) {
  const dateLabel = format(dayDate, 'EEE d MMM', { locale: nl });
  const fullDateLabel = format(dayDate, 'EEEE d MMMM', { locale: nl });

  return (
    <article
      className={cn(
        'rounded-lg border px-3 py-2 transition-colors',
        choice === 'yes' && 'border-success/40 bg-success/5',
        choice === 'no' && 'border-destructive/30 bg-destructive/5',
        choice === 'unset' && 'border-border/80 bg-card',
        isPending && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold capitalize text-foreground leading-tight">
            {dateLabel}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {cluster.time_slot} · {cluster.location} · {cluster.matches.length} wedstrijd
            {cluster.matches.length === 1 ? '' : 'en'}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5" role="group" aria-label={`Beschikbaarheid ${fullDateLabel}`}>
          <button
            type="button"
            disabled={isPending}
            aria-pressed={choice === 'yes'}
            aria-label={`Beschikbaar op ${format(dayDate, 'd MMMM', { locale: nl })}`}
            onClick={() => onChoice('yes')}
            className={cn(
              'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              choice === 'yes'
                ? 'border-success bg-success text-white shadow-sm'
                : 'border-success/40 bg-success/10 text-foreground hover:bg-success/20',
              isPending && 'cursor-wait',
            )}
          >
            {isPending && choice === 'yes' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>Ja</span>
          </button>
          <button
            type="button"
            disabled={isPending}
            aria-pressed={choice === 'no'}
            aria-label={`Niet beschikbaar op ${format(dayDate, 'd MMMM', { locale: nl })}`}
            onClick={() => onChoice('no')}
            className={cn(
              'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              choice === 'no'
                ? 'border-destructive/80 bg-destructive text-white shadow-sm'
                : 'border-destructive/30 bg-destructive/5 text-foreground hover:bg-destructive/10',
              isPending && 'cursor-wait',
            )}
          >
            {isPending && choice === 'no' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <X className="h-4 w-4 shrink-0" aria-hidden />
            )}
            <span>Nee</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function CheckboxClusterRow({
  cluster,
  dayDate,
  isAvailable,
  isPending,
  onToggle,
}: {
  cluster: ScheduleCluster;
  dayDate: Date;
  isAvailable: boolean;
  isPending: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border p-3 transition-colors',
        isAvailable ? 'border-primary/30 bg-primary/5' : 'border-border bg-card',
        isPending && 'opacity-70',
      )}
    >
      <input
        type="checkbox"
        id={`avail-${cluster.cluster_key}`}
        checked={isAvailable}
        onChange={(e) => onToggle(e.target.checked)}
        disabled={isPending}
        className="mt-1 h-4 w-4"
        aria-label={`Beschikbaar op ${format(dayDate, 'd MMMM', { locale: nl })}`}
      />
      <label htmlFor={`avail-${cluster.cluster_key}`} className="min-w-0 flex-1 cursor-pointer">
        <span className="text-sm font-medium capitalize">
          {format(dayDate, 'EEEE d MMMM', { locale: nl })}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {cluster.location} · {cluster.time_slot}
        </span>
      </label>
    </div>
  );
}
