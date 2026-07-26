/** Commit-payloads voor unified seizoenspreview → database. */

export type UnifiedCommitMatchPlan = {
  unique_number: string;
  speeldag: string;
  home_team_id: number | null;
  away_team_id: number | null;
  match_date: string;
  match_time: string;
  venue: string;
};

export type UnifiedPlayoffCommitIntent = {
  topPositions: number[];
  bottomPositions: number[];
  rounds: number;
  startDate: string;
  endDate: string;
};

export type UnifiedSeasonCommitPayload = {
  /** Actieve organisatie bij genereren (Kuurne = 2, Harelbeke = 1). */
  organizationId: number;
  competitionPlan: UnifiedCommitMatchPlan[] | null;
  cupPlan: UnifiedCommitMatchPlan[] | null;
  playoffIntent: UnifiedPlayoffCommitIntent | null;
};

export type UnifiedSeasonCommitResult = {
  success: boolean;
  message: string;
  results: {
    cup?: { success: boolean; message: string; count: number };
    competition?: { success: boolean; message: string; count: number };
    playoff?: { success: boolean; message: string; count: number };
  };
};
