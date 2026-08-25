import React from "react";
import { PageHeader } from "@/components/layout";
import { CalendarRange } from "lucide-react";
import SeasonCalendarPage from "./SeasonCalendarPage";

/**
 * Seizoensplanning-hub: opzet, kalender, preview en opslaan in één flow.
 * Aparte competitie-/beker-/play-off-tabs zijn vervangen door de unified preview.
 */
const SeasonPlanningHub: React.FC = () => {
  return (
    <div className="space-y-4 sm:space-y-6 animate-slide-up pb-6">
      <PageHeader
        title="Seizoensplanning"
        icon={CalendarRange}
      />
      <SeasonCalendarPage embedded />
    </div>
  );
};

export default React.memo(SeasonPlanningHub);
