import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Shield } from 'lucide-react';
import { PageHeader } from '@/components/layout';
import { useRefereeDashboard } from './hooks/useRefereeDashboard';
import { AvailabilityPollSection } from './sections/AvailabilityPollSection';
import { AssignedMatchesSection } from './sections/AssignedMatchesSection';
import { RefereeStatsSection } from './sections/RefereeStatsSection';

export function RefereeDashboard() {
  const {
    clusters,
    myAvailability,
    assignments,
    isLoadingSchedule,
    isLoadingAssignments,
    username,
    submitAvailability,
    submitBulkAvailability,
    submitBulkAvailabilityByMonth,
    isSubmitting,
    refreshData,
  } = useRefereeDashboard();

  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshData();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="scheids-page space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          className="mb-0 min-w-0 flex-1"
          title="Scheidsrechter Dashboard"
          subtitle={`Welkom, ${username}`}
          icon={Shield}
        />

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="min-h-[44px] shrink-0 self-start"
          aria-label="Vernieuwen"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden />
          Vernieuwen
        </Button>
      </div>

      <RefereeStatsSection
        assignments={assignments}
        isLoading={isLoadingAssignments}
      />

      <div className="space-y-8">
        <AvailabilityPollSection
          clusters={clusters}
          myAvailability={myAvailability}
          onSubmitAvailability={submitAvailability}
          onBulkSubmitAvailability={submitBulkAvailability}
          onBulkSubmitByMonth={submitBulkAvailabilityByMonth}
          isLoading={isLoadingSchedule}
          isSubmitting={isSubmitting}
        />

        <AssignedMatchesSection
          assignments={assignments}
          isLoading={isLoadingAssignments}
        />
      </div>
    </div>
  );
}
