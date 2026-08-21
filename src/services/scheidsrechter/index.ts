// Scheidsrechter Services - Index Export
// ======================================

// Types
export * from './types';

// Main scheidsrechter service (existing)
export { scheidsrechterService } from './scheidsrechterService';

// Poll management service
export { pollService } from './pollService';

// Availability service
export { refereeAvailabilityService } from './refereeAvailabilityService';

// Assignment service
export { assignmentService } from './assignmentService';

// Auto-suggest service (Fase 5)
export {
  suggestRefereesForSession,
  fetchWorkloadStats,
  type SuggestionCandidate,
} from './autoSuggestService';

// Month schedule service — vervangt de poll-flow voor scheidsrechters
export {
  monthScheduleService,
  buildClusterKey,
  buildMyAvailabilityMap,
  isClusterFullyAssigned,
  type ScheduleCluster,
  type ScheduleMatch,
  type AvailabilityLookupRow,
} from './monthScheduleService';
