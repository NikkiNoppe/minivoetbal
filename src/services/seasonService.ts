import {
  insertApplicationSettingForSession,
} from '@/services/core/applicationSettingsSessionFetch';
import {
  fetchPublicApplicationSettings,
  findPublicSetting,
} from '@/services/public/publicApplicationSettingsFetch';
import {
  requireOrganizationId,
  resolveOrganizationIdForRead,
  seasonDataStorageKey,
} from '@/lib/organizationScope';

export interface SeasonData {
  season_start_date: string;
  season_end_date: string;
  competition_formats?: any[];
  /** Interactieve seizoensopzet (meerdere speelsystemen tegelijk). */
  season_setup?: import('@/lib/seasonSetup').SeasonSetup;
  venues?: any[];
  venue_timeslots?: any[];
  vacation_periods?: any[];
  slot_unavailability?: import('@/types/slotUnavailability').SlotUnavailability[];
  day_names?: string[];
}

export function createDefaultSeasonData(): SeasonData {
  return {
    season_start_date: '',
    season_end_date: '',
    competition_formats: [],
    season_setup: undefined,
    venues: [],
    venue_timeslots: [],
    vacation_periods: [],
    slot_unavailability: [],
    day_names: [
      'maandag',
      'dinsdag',
      'woensdag',
      'donderdag',
      'vrijdag',
      'zaterdag',
      'zondag',
    ],
  };
}

export const seasonService = {
  async getSeasonData(organizationId?: number): Promise<SeasonData> {
    const orgId = resolveOrganizationIdForRead(organizationId);

    try {
      const rows = await fetchPublicApplicationSettings(['season_data'], orgId);
      const row = findPublicSetting(rows, 'season_data', 'main_config');

      if (!row?.setting_value) {
        const defaults = createDefaultSeasonData();
        localStorage.setItem(seasonDataStorageKey(orgId), JSON.stringify(defaults));
        return defaults;
      }

      const seasonData = row.setting_value as unknown as SeasonData;
      localStorage.setItem(seasonDataStorageKey(orgId), JSON.stringify(seasonData));
      return seasonData;
    } catch (error) {
      console.error('❌ Error in getSeasonData:', error);
      throw error;
    }
  },

  async getAvailableDays(organizationId?: number): Promise<string[]> {
    const seasonData = await this.getSeasonData(organizationId);
    return seasonData.day_names || [];
  },

  async getAvailableTimeslots(
    organizationId?: number,
  ): Promise<Array<{ id: string; label: string }>> {
    const seasonData = await this.getSeasonData(organizationId);
    const timeslots = seasonData.venue_timeslots || [];
    const slotObjects = timeslots.map((ts: any) => {
      const label =
        ts.start_time && ts.end_time
          ? `${ts.start_time} - ${ts.end_time}`
          : ts.timeslot_id || ts.start_time || 'Onbekend';
      const id = ts.timeslot_id ? String(ts.timeslot_id) : label;
      return { id, label };
    });
    const uniqueMap = new Map<string, { id: string; label: string }>();
    slotObjects.forEach((obj) => {
      if (!uniqueMap.has(obj.id)) {
        uniqueMap.set(obj.id, obj);
      }
    });
    return Array.from(uniqueMap.values());
  },

  async getAvailableVenues(
    organizationId?: number,
  ): Promise<Array<{ venue_id: number; name: string; address: string }>> {
    const seasonData = await this.getSeasonData(organizationId);
    const venues = seasonData.venues || [];

    return venues.map((venue: any) => ({
      venue_id: venue.venue_id || venue.id || 0,
      name: venue.name || venue.venue_name || 'Onbekende locatie',
      address: venue.address || venue.venue_address || '',
    }));
  },

  clearSeasonDataCache(organizationId?: number): void {
    if (organizationId != null) {
      localStorage.removeItem(seasonDataStorageKey(organizationId));
      return;
    }
    Object.keys(localStorage)
      .filter((key) => key.startsWith('seasonData:'))
      .forEach((key) => localStorage.removeItem(key));
  },

  async saveSeasonData(
    data: SeasonData,
    organizationId?: number,
  ): Promise<{ success: boolean; message: string }> {
    const orgId = requireOrganizationId(organizationId);

    try {
      // Merge met bestaande config zodat partial updates (bv. alleen datums)
      // venues/timeslots/vakanties niet wissen.
      let existing: SeasonData = createDefaultSeasonData();
      try {
        existing = await this.getSeasonData(orgId);
      } catch {
        // geen bestaande rij — defaults
      }

      const merged: SeasonData = {
        ...createDefaultSeasonData(),
        ...existing,
        ...data,
        venues: data.venues ?? existing.venues ?? [],
        venue_timeslots: data.venue_timeslots ?? existing.venue_timeslots ?? [],
        vacation_periods: data.vacation_periods ?? existing.vacation_periods ?? [],
        slot_unavailability:
          data.slot_unavailability ?? existing.slot_unavailability ?? [],
        competition_formats:
          data.competition_formats ?? existing.competition_formats ?? [],
        season_setup: data.season_setup ?? existing.season_setup,
        day_names: data.day_names ?? existing.day_names ?? createDefaultSeasonData().day_names,
      };

      localStorage.setItem(seasonDataStorageKey(orgId), JSON.stringify(merged));

      await insertApplicationSettingForSession({
        setting_category: 'season_data',
        setting_name: 'main_config',
        setting_value: merged,
      });

      return {
        success: true,
        message: 'Seizoensdata succesvol opgeslagen',
      };
    } catch (error) {
      console.error('❌ Error saving season data:', error);
      return {
        success: false,
        message: `Fout bij opslaan: ${error instanceof Error ? error.message : 'Onbekende fout'}`,
      };
    }
  },

  validateSeasonData(data: SeasonData): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.season_start_date) {
      errors.push('Seizoen startdatum is verplicht');
    }

    if (!data.season_end_date) {
      errors.push('Seizoen einddatum is verplicht');
    }

    if (data.season_start_date && data.season_end_date) {
      const start = new Date(data.season_start_date);
      const end = new Date(data.season_end_date);

      if (start >= end) {
        errors.push('Seizoen startdatum moet voor einddatum liggen');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },
};
