export type {
  SeasonSetup,
  SeasonSetupCompetition,
  SeasonSetupCup,
  SeasonSetupPlayoffs,
  SeasonSetupSystems,
} from "./types";
export {
  SEASON_SETUP_FORMAT_ID,
  SEASON_SETUP_FORMAT_NAME,
} from "./types";
export {
  addDivisionToSetup,
  buildSeasonSetupFormat,
  createDefaultSeasonSetup,
  ensureAtLeastOneSystem,
  mergeSeasonSetupIntoFormats,
  normalizeSeasonSetup,
  removeDivisionFromSetup,
  syncDivisionCountsFromAssignments,
} from "./normalize";
export {
  describeCompetitionMatchdayMath,
  describeCupRounds,
  estimateCompetitionMatches,
  estimateCompetitionMatchdays,
  estimatePlayoffMatchdays,
  estimatePlayoffMatches,

  estimateRoundRobinMatches,
  matchdaysPerRound,
  resolveCupTeamCount,
  seasonSetupToDemand,
  summarizeSeasonSetup,
} from "./estimates";
export {
  analyzePreviewTeamConflicts,
  conflictLookup,
  previewConflictCellKey,
  type PreviewConflictKind,
  type PreviewTeamConflict,
} from "./previewScheduleConflicts";
export {
  assignTeamsToDivisions,
  buildEmptyFreePreviewRows,
  buildClosedCalendarPreviewRows,
  buildUnifiedSeasonPreview,
  cupBusyTeamsByMondayFromPlan,
  cupOccupiedSlotsByMondayFromPlan,
  cupDatesByMondayFromPlan,
  cupUnassignedByMondayFromPlan,
  type UnifiedPreviewPhase,
  type UnifiedPreviewRow,
  type UnifiedPreviewSection,
  type UnifiedSeasonPreview,
} from "./buildUnifiedPreview";
export { commitUnifiedSeasonPreview } from "./commitUnifiedSeasonPreview";
export {
  clearSeasonPreviewSession,
  getSeasonPreviewSession,
  runSeasonPreviewGeneration,
  subscribeSeasonPreviewSession,
  type SeasonPreviewProgress,
  type SeasonPreviewSessionState,
} from "./seasonPreviewSession";
export type {
  UnifiedCommitMatchPlan,
  UnifiedPlayoffCommitIntent,
  UnifiedSeasonCommitPayload,
  UnifiedSeasonCommitResult,
} from "./commitTypes";
