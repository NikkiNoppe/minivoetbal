/** Seizoensopzet — welke speelsystemen + parameters (meerdere tegelijk mogelijk). */

import type { CompetitionDivision } from "@/services/competitionDataService";

export type SeasonSetupSystems = {
  competition: boolean;
  cup: boolean;
  playoffs: boolean;
};

export type SeasonSetupCompetition = {
  /** Aantal competitierondes (thuis/uit = 2 typisch). */
  regularRounds: number;
  hasDivisions: boolean;
  divisions: CompetitionDivision[];
  /**
   * Geschat aantal teams (zonder reeksen), of totaal als reeksen uit staan.
   * Met reeksen: `divisionTeamCounts` / echte toewijzing heeft voorrang.
   */
  estimatedTeamCount: number;
  /** Teams per reeks (zelfde volgorde als divisions) — voor kalender-schatting. */
  divisionTeamCounts: number[];
  /**
   * Team → reeks-id. Wordt bewaard in season_setup zodat je niet opnieuw hoeft toe te wijzen.
   */
  teamDivisions?: Record<number, number>;
};

export type SeasonSetupCup = {
  /** Alle actieve teams meenemen (count volgt uit DB bij laden). */
  useAllTeams: boolean;
  teamCount: number;
  /**
   * auto = planner kiest bekerweken · manual = preferredWeeks sturen wanneer beker mag.
   */
  weekMode?: "auto" | "manual";
  /** ISO-maandagen (YYYY-MM-DD) die als bekerweek mogen/moeten. */
  preferredWeeks?: string[];
};

export type SeasonSetupPlayoffs = {
  topTeams: 6 | 7 | 8;
  bottomTeams: 6 | 7 | 8;
  rounds: 1 | 2;
};

export type SeasonSetup = {
  systems: SeasonSetupSystems;
  competition: SeasonSetupCompetition;
  cup: SeasonSetupCup;
  playoffs: SeasonSetupPlayoffs;
  updatedAt?: string;
};

/** Vaste id voor het format dat vanuit Seizoensopzet naar competition_formats gesyncet wordt. */
export const SEASON_SETUP_FORMAT_ID = 900_001;

export const SEASON_SETUP_FORMAT_NAME = "Seizoensopzet";
