/** Seizoensopzet — welke speelsystemen + parameters (meerdere tegelijk mogelijk). */

import type { CompetitionDivision } from "@/services/competitionDataService";

export type SeasonSetupSystems = {
  competition: boolean;
  cup: boolean;
  playoffs: boolean;
};

export type CompetitionByePin = {
  teamId: number;
  /** Speeldagnummer binnen één competitieronde (1..n bij oneven poule). */
  roundMatchday: number;
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
  /**
   * Vaste competitie-bye: ploeg rust op opgegeven speeldag (alleen bij oneven poule).
   */
  byePins?: CompetitionByePin[];
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
  /**
   * Ploegen die verplicht in de voorronde spelen (bv. nieuwe ploegen).
   * Lengte = 2 × aantal voorronde-wedstrijden; rest krijgt bye.
   */
  voorrondeTeamIds?: number[];
};

export type SeasonSetupPlayoffs = {
  /** Afgeleid van het echte teamantal (oneven → extra in de top). */
  topTeams: number;
  bottomTeams: number;
  rounds: 1 | 2;
};

/** Fase die je handmatig aan een week in de weekstrook kunt geven. */
export type SeasonSetupWeekPhase = "competition" | "cup" | "playoff" | "free";

export type SeasonSetup = {
  systems: SeasonSetupSystems;
  competition: SeasonSetupCompetition;
  cup: SeasonSetupCup;
  playoffs: SeasonSetupPlayoffs;
  /**
   * ISO-maandagen die uitzonderlijk speelbaar blijven ondanks vacation_periods.
   * Vakantie blijft in Instellingen staan; packing mag deze weken wél gebruiken.
   */
  playableVacationWeeks?: string[];
  /**
   * Volgorde van de blokken in de kalender.
   * balanced = planner kiest · competition-first = competitie vooraan (bv. tot nieuwjaar),
   * beker en play-offs daarna.
   */
  phaseStrategy?: "balanced" | "competition-first";
  /**
   * Handmatige fase per week (ISO-maandag → competition | cup | playoff).
   * Deze weken staan vast; de planner vult de rest automatisch aan.
   */
  weekAssignments?: Record<string, SeasonSetupWeekPhase>;
  updatedAt?: string;
};

/** Vaste id voor het format dat vanuit Seizoensopzet naar competition_formats gesyncet wordt. */
export const SEASON_SETUP_FORMAT_ID = 900_001;

export const SEASON_SETUP_FORMAT_NAME = "Seizoensopzet";
