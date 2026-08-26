import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  buildSeasonMonthOptions,
  resolveDefaultSeasonMonth,
} from '@/lib/refereeSeasonMonths';
import AvailabilityMatrix from './AvailabilityMatrix';

interface AssignmentWorkspaceProps {
  /** Externe maand (YYYY-MM). */
  selectedMonth?: string;
  onSelectedMonthChange?: (m: string) => void;
}

/**
 * Toewijz-werkruimte met matrix en maand-selector.
 */
export const AssignmentWorkspace: React.FC<AssignmentWorkspaceProps> = ({
  selectedMonth: externalMonth,
  onSelectedMonthChange,
}) => {
  const [internalMonth, setInternalMonth] = useState(() => resolveDefaultSeasonMonth());
  const selectedMonth = externalMonth ?? internalMonth;
  const setSelectedMonth = (m: string) => {
    if (onSelectedMonthChange) onSelectedMonthChange(m);
    else setInternalMonth(m);
  };
  const [matrixToolbarContainer, setMatrixToolbarContainer] = useState<HTMLDivElement | null>(null);
  const monthOptions = buildSeasonMonthOptions();

  return (
    <div className="space-y-4">
      {/* Toolbar — mobiel: maand + auto-toewijzen onder elkaar, full-width */}
      <div className="sticky top-0 z-10 -mx-1 border-b border-border/50 bg-brand-100/95 px-1 pb-3 backdrop-blur-sm sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch lg:items-center">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="min-h-[44px] w-full sm:w-[200px] lg:w-[160px]" aria-label="Maand selecteren">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="capitalize">{opt.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-full sm:min-w-[12rem] sm:flex-1 lg:w-auto lg:flex-none" ref={setMatrixToolbarContainer} />
        </div>
      </div>

      <AvailabilityMatrix
        hideHeader
        selectedMonth={selectedMonth}
        onSelectedMonthChange={setSelectedMonth}
        toolbarContainer={matrixToolbarContainer}
      />
    </div>
  );
};

export default AssignmentWorkspace;
