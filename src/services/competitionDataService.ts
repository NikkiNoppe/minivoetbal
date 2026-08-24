import { seasonService } from './seasonService';

export interface CompetitionDivision {
  id: number;
  name: string;
  sort_order: number;
}

export interface CompetitionFormat {
  id: number;
  name: string;
  description: string;
  has_playoffs: boolean;
  regular_rounds: number;
  /** Wanneer true: teams worden per reeks (klasse) ingedeeld. */
  has_divisions?: boolean;
  divisions?: CompetitionDivision[];
}

export const DEFAULT_DIVISION_NAMES = [
  'Eerste klasse',
  'Tweede klasse',
  'Derde klasse',
] as const;

export function createDivision(name: string, sortOrder: number): CompetitionDivision {
  return {
    id: Date.now() + sortOrder,
    name,
    sort_order: sortOrder,
  };
}

export function createDefaultDivisions(): CompetitionDivision[] {
  return DEFAULT_DIVISION_NAMES.map((name, index) => createDivision(name, index + 1));
}

export function normalizeCompetitionFormat(format: CompetitionFormat): CompetitionFormat {
  const hasDivisions = Boolean(format.has_divisions);
  const divisions = (format.divisions ?? [])
    .filter((division) => division.name.trim().length > 0)
    .map((division, index) => ({
      ...division,
      sort_order: index + 1,
    }));

  return {
    ...format,
    has_divisions: hasDivisions,
    divisions: hasDivisions ? divisions : [],
  };
}

export function normalizeCompetitionFormats(formats: CompetitionFormat[]): CompetitionFormat[] {
  return formats.map(normalizeCompetitionFormat);
}

export interface Venue {
  venue_id: number;
  name: string;
  address: string;
}

export interface VenueTimeslot {
  timeslot_id: number;
  venue_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  priority?: number;
  venue_name?: string;
  /** Optioneel: eerste kalenderdag waarop dit slot telt (YYYY-MM-DD). */
  valid_from?: string;
  /** Optioneel: laatste kalenderdag waarop dit slot telt (YYYY-MM-DD). */
  valid_until?: string;
  /**
   * Reserve-slot: telt alleen als dit andere timeslot_id die week geblokkeerd is
   * (bv. Vlasschaard 18:00 als Dageraad 21:00 door Zweetvoetmannen bezet is).
   */
  available_when_blocked_timeslot_id?: number;
}

export interface VacationPeriod {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

export type { SlotUnavailability } from '@/types/slotUnavailability';

export const competitionDataService = {
  async getCompetitionFormats(organizationId?: number): Promise<CompetitionFormat[]> {
    const data = await seasonService.getSeasonData(organizationId);
    return normalizeCompetitionFormats(data.competition_formats || []);
  },

  async getVenues(organizationId?: number): Promise<Venue[]> {
    const data = await seasonService.getSeasonData(organizationId);
    return data.venues || [];
  },

  async getVenueTimeslots(organizationId?: number): Promise<VenueTimeslot[]> {
    const data = await seasonService.getSeasonData(organizationId);
    return data.venue_timeslots || [];
  },

  async getVacationPeriods(organizationId?: number): Promise<VacationPeriod[]> {
    const data = await seasonService.getSeasonData(organizationId);
    return data.vacation_periods || [];
  },

  async getSlotUnavailability(
    organizationId?: number,
  ): Promise<import('@/types/slotUnavailability').SlotUnavailability[]> {
    const data = await seasonService.getSeasonData(organizationId);
    return data.slot_unavailability || [];
  },

  async getActiveSlotUnavailability(
    organizationId?: number,
  ): Promise<import('@/types/slotUnavailability').SlotUnavailability[]> {
    const blocks = await this.getSlotUnavailability(organizationId);
    return blocks.filter((b) => b.is_active);
  },

  async getDayNames(organizationId?: number): Promise<string[]> {
    const data = await seasonService.getSeasonData(organizationId);
    return data.day_names || [];
  },

  async getVenueById(venueId: number, organizationId?: number): Promise<Venue | undefined> {
    const venues = await this.getVenues(organizationId);
    return venues.find((venue) => venue.venue_id === venueId);
  },

  async getTimeslotsForVenue(venueId: number, organizationId?: number): Promise<VenueTimeslot[]> {
    const timeslots = await this.getVenueTimeslots(organizationId);
    return timeslots.filter((timeslot) => timeslot.venue_id === venueId);
  },

  async getActiveVacationPeriods(organizationId?: number): Promise<VacationPeriod[]> {
    const periods = await this.getVacationPeriods(organizationId);
    return periods.filter((period) => period.is_active);
  },
};
