export type {
  EffectiveSlot,
  OccupancyMatchLike,
  OccupancyPhase,
  ReserveCupWeeksResult,
  SeasonDemand,
  SeasonPhase,
  SeasonPlan,
  SeasonWeekPlan,
  SlotDetailLike,
  SlotStatus,
  WeekSlotGrid,
} from "./types";

export {
  applyOccupancyToWeekGrid,
  buildConfigWeekGrid,
  buildSeasonSlotGrids,
  capacityForWeek,
  configCapacityForWeek,
  findSlotIndexForMatch,
  summarizeEffectiveCapacity,
} from "./slotGrid";

export {
  buildSeasonPlan,
  estimateSeasonPlanning,
  listSeasonPlayableWeeks,
  reserveCupWeeks,
  resolveEffectiveSlotsPerWeek,
  type BuildSeasonCalendarInput,
} from "./planner";

export { buildSlotDetailsFromSeasonData } from "./buildSlotDetails";
export { pruneOrphanVacationSlotBlocks } from "./pruneOrphanVacationSlotBlocks";
export {
  evaluateCupWeekSelection,
  type CupWeekSelectability,
  type CupWeekSelectionStatus,
  type CupWeekSelectionSummary,
} from "./cupWeekSelection";
