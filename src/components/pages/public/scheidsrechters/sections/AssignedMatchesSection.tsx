import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Shield, Calendar } from 'lucide-react';
import { AssignedMatchCard, AssignedMatchCardSkeleton } from '../components/AssignedMatchCard';
import type { RefereeAssignment } from '@/services/scheidsrechter/types';

interface AssignedMatchesSectionProps {
  assignments: RefereeAssignment[];
  isLoading: boolean;
  embedded?: boolean;
}

export function AssignedMatchesSection({ assignments, isLoading, embedded = false }: AssignedMatchesSectionProps) {
  const now = Date.now();
  const upcomingAssignments = assignments.filter(a => {
    const matchDate = a.match_date ? new Date(a.match_date).getTime() : 0;
    return matchDate > now;
  });

  const headingClass = embedded
    ? "text-sm font-semibold flex items-center gap-2 text-foreground"
    : "text-lg font-semibold flex items-center gap-2 text-[var(--color-700)]";

  if (isLoading && assignments.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className={headingClass}>
          <Shield className="h-4 w-4 text-primary" />
          Toegewezen wedstrijden
        </h2>
        <div className="grid gap-3">
          {[1, 2, 3].map(i => (
            <AssignedMatchCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (assignments.length === 0) {
    return (
      <section className="space-y-4">
        <h2 className={headingClass}>
          <Shield className="h-4 w-4 text-primary" />
          Toegewezen wedstrijden
        </h2>

        <Card className="shadow-[var(--shadow-elevation-1)] border-dashed">
          <CardContent className="p-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-medium text-base">Nog geen wedstrijden toegewezen</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Vul je beschikbaarheid in zodat de coördinator je kan toewijzen
                  <br />
                  aan wedstrijden.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className={headingClass}>
          <Shield className="h-4 w-4 text-primary" />
          Toegewezen wedstrijden
          <span className="text-sm font-normal text-muted-foreground">
            ({upcomingAssignments.length} komend)
          </span>
        </h2>
      </div>

      <div className="grid gap-3">
        {upcomingAssignments.map(assignment => (
          <AssignedMatchCard key={assignment.id} assignment={assignment} />
        ))}
      </div>

      {assignments.length > upcomingAssignments.length && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          {assignments.length - upcomingAssignments.length} afgelopen wedstrijden niet getoond
        </p>
      )}
    </section>
  );
}
