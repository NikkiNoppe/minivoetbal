import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, CheckCircle2, CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SectionIcon } from '@/components/layout';
import type { RefereeAssignment } from '@/services/scheidsrechter/types';

interface RefereeStatsSectionProps {
  assignments: RefereeAssignment[];
  isLoading: boolean;
  embedded?: boolean;
}

export function RefereeStatsSection({ assignments, isLoading, embedded = false }: RefereeStatsSectionProps) {
  const stats = useMemo(() => {
    const now = Date.now();
    const total = assignments.length;

    const today = new Date();
    const month = today.getUTCMonth();
    const year = today.getUTCFullYear();
    const thisMonth = assignments.filter((a) => {
      if (!a.match_date) return false;
      const d = new Date(a.match_date);
      return d.getUTCMonth() === month && d.getUTCFullYear() === year;
    }).length;

    const upcoming = assignments.filter((a) => {
      if (!a.match_date) return false;
      return new Date(a.match_date).getTime() > now;
    }).length;

    return { total, thisMonth, upcoming };
  }, [assignments]);

  if (isLoading && assignments.length === 0) return null;

  const items = [
    {
      icon: CalendarRange,
      label: 'Deze maand',
      value: stats.thisMonth,
      tone: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      icon: CheckCircle2,
      label: 'Komende',
      value: stats.upcoming,
      tone: 'text-success',
      bg: 'bg-success/10',
    },
    {
      icon: TrendingUp,
      label: 'Totaal toegewezen',
      value: stats.total,
      tone: 'text-foreground',
      bg: 'bg-muted',
    },
  ];

  return (
    <section className="space-y-3">
      {!embedded && (
        <h2 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-700)]">
          <SectionIcon icon={TrendingUp} />
          Mijn statistieken
        </h2>
      )}

      <div className={cn("grid gap-3", embedded ? "grid-cols-3" : "grid-cols-3")}>
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <Card key={it.label} className="shadow-[var(--shadow-elevation-1)]">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${it.bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-5 w-5 ${it.tone}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-2xl font-bold leading-tight">{it.value}</div>
                  <div className="text-xs text-muted-foreground truncate">{it.label}</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
