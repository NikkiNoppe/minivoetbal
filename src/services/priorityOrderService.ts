import { localDateTimeToISO } from "@/lib/dateUtils";
import {
  fetchPublicApplicationSettings,
  findPublicSetting,
} from "@/services/public/publicApplicationSettingsFetch";

export interface PriorityOrderItem {
  priority: number;
  venue_id: number;
  day_of_week: number;
  start_time: string;
  description: string;
}

export interface VenueTimeslotWithPriority {
  timeslot_id: number;
  venue_id: number;
  venue_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  priority: number;
  valid_from?: string;
  valid_until?: string;
  available_when_blocked_timeslot_id?: number;
}

// Fallback priority order if database is not available
const FALLBACK_PRIORITY_ORDER: PriorityOrderItem[] = [
  {
    priority: 1,
    venue_id: 1,
    day_of_week: 1,
    start_time: "20:00",
    description: "Dageraad Maandag 20:00"
  },
  {
    priority: 2,
    venue_id: 2,
    day_of_week: 1,
    start_time: "20:00",
    description: "Vlasschaard Maandag 20:00"
  },
  {
    priority: 3,
    venue_id: 1,
    day_of_week: 2,
    start_time: "19:30",
    description: "Dageraad Dinsdag 19:30"
  },
  {
    priority: 4,
    venue_id: 1,
    day_of_week: 1,
    start_time: "19:00",
    description: "Dageraad Maandag 19:00"
  },
  {
    priority: 5,
    venue_id: 2,
    day_of_week: 1,
    start_time: "19:00",
    description: "Vlasschaard Maandag 19:00"
  },
  {
    priority: 6,
    venue_id: 1,
    day_of_week: 2,
    start_time: "18:30",
    description: "Dageraad Dinsdag 18:30"
  },
  {
    priority: 7,
    venue_id: 2,
    day_of_week: 2,
    start_time: "18:30",
    description: "Vlasschaard Dinsdag 18:30"
  },
  {
    priority: 8,
    venue_id: 1,
    day_of_week: 1,
    start_time: "21:00",
    description: "Dageraad Maandag 21:00"
  },
  {
    priority: 9,
    venue_id: 2,
    day_of_week: 1,
    start_time: "18:00",
    description: "Vlasschaard Maandag 18:00 (reserve 21:00)"
  }
];

// Fallback timeslots if database is not available
const FALLBACK_TIMESLOTS: VenueTimeslotWithPriority[] = [
  {
    timeslot_id: 1,
    venue_id: 1,
    venue_name: "Harelbeke - Dageraad",
    day_of_week: 1,
    start_time: "20:00",
    end_time: "21:00",
    priority: 1
  },
  {
    timeslot_id: 2,
    venue_id: 2,
    venue_name: "Bavikhove - Vlasschaard",
    day_of_week: 1,
    start_time: "20:00",
    end_time: "21:00",
    priority: 2
  },
  {
    timeslot_id: 3,
    venue_id: 1,
    venue_name: "Harelbeke - Dageraad",
    day_of_week: 2,
    start_time: "19:30",
    end_time: "20:30",
    priority: 3
  },
  {
    timeslot_id: 4,
    venue_id: 1,
    venue_name: "Harelbeke - Dageraad",
    day_of_week: 1,
    start_time: "19:00",
    end_time: "20:00",
    priority: 4
  },
  {
    timeslot_id: 5,
    venue_id: 2,
    venue_name: "Bavikhove - Vlasschaard",
    day_of_week: 1,
    start_time: "19:00",
    end_time: "20:00",
    priority: 5
  },
  {
    timeslot_id: 6,
    venue_id: 1,
    venue_name: "Harelbeke - Dageraad",
    day_of_week: 2,
    start_time: "18:30",
    end_time: "19:30",
    priority: 6
  },
  {
    timeslot_id: 7,
    venue_id: 2,
    venue_name: "Bavikhove - Vlasschaard",
    day_of_week: 2,
    start_time: "18:30",
    end_time: "19:30",
    priority: 7
  },
  {
    timeslot_id: 8,
    venue_id: 1,
    venue_name: "Harelbeke - Dageraad",
    day_of_week: 1,
    start_time: "21:00",
    end_time: "22:00",
    priority: 8
  },
  {
    timeslot_id: 9,
    venue_id: 2,
    venue_name: "Bavikhove - Vlasschaard",
    day_of_week: 1,
    start_time: "18:00",
    end_time: "19:00",
    priority: 9,
    available_when_blocked_timeslot_id: 8
  }
];

export const priorityOrderService = {
  /**
   * Get priority order from fast access row in application_settings
   */
  async getFastPriorityOrder(): Promise<PriorityOrderItem[]> {
    try {
      // Try to get from localStorage first for speed
      const cached = localStorage.getItem('fastPriorityOrder');
      if (cached) {
        return JSON.parse(cached);
      }

      const rows = await fetchPublicApplicationSettings(['priority_order']);
      const row = findPublicSetting(rows, 'priority_order', 'fast_access');

      if (!row?.setting_value) {
        console.warn('⚠️ No fast priority order data found, falling back to season_data');
        return await this.getPriorityOrderFromSeasonData();
      }

      const priorityOrder = row.setting_value as PriorityOrderItem[];
      localStorage.setItem('fastPriorityOrder', JSON.stringify(priorityOrder));
      return priorityOrder;
    } catch (error) {
      console.error('❌ Error getting fast priority order:', error);
      return await this.getPriorityOrderFromSeasonData();
    }
  },

  /**
   * Get priority order from season_data
   */
  async getPriorityOrderFromSeasonData(): Promise<PriorityOrderItem[]> {
    try {
      const rows = await fetchPublicApplicationSettings(['season_data']);
      const row = findPublicSetting(rows, 'season_data', 'main_config');

      if (!row?.setting_value) {
        console.warn('⚠️ No season data found, using fallback priority order');
        return FALLBACK_PRIORITY_ORDER;
      }

      const settingValue = row.setting_value as Record<string, unknown>;
      const priorityOrder =
        (settingValue.priority_order as PriorityOrderItem[] | undefined) ||
        FALLBACK_PRIORITY_ORDER;
      
      // Cache the result
      localStorage.setItem('fastPriorityOrder', JSON.stringify(priorityOrder));
      return priorityOrder;
    } catch (error) {
      console.error('❌ Error fetching priority order from season data:', error);
      return FALLBACK_PRIORITY_ORDER;
    }
  },

  /**
   * Get prioritized timeslots with venue information
   */
  async getPrioritizedTimeslots(): Promise<VenueTimeslotWithPriority[]> {
    try {
      const rows = await fetchPublicApplicationSettings(['season_data']);
      const row = findPublicSetting(rows, 'season_data', 'main_config');

      if (!row?.setting_value) {
        console.warn('⚠️ No season data found, using fallback timeslots');
        return FALLBACK_TIMESLOTS;
      }

      const settingValue = row.setting_value as Record<string, unknown>;
      const venues = Array.isArray(settingValue.venues) ? settingValue.venues : [];
      const venue_timeslots = Array.isArray(settingValue.venue_timeslots)
        ? settingValue.venue_timeslots
        : [];

      if (venue_timeslots.length === 0) {
        console.warn('⚠️ No venue timeslots found in season data, using fallback');
        return FALLBACK_TIMESLOTS;
      }
      
      // Create timeslots with venue info and sort by priority
      const timeslots = venue_timeslots
        .map((slot: any) => {
          const venue = venues.find((v: any) => v.venue_id === slot.venue_id);
          return { 
            ...slot, 
            venue_name: (slot.venue_name || venue?.name || 'Unknown')
              .replace(/^Sporthal\s+/i, '')
              .replace('De Dageraad Harelbeke', 'De Dageraad')
              .replace('De Vlasschaard Bavikhove', 'De Vlasschaard')
              .trim(),
            priority: slot.priority || 999 // Default to low priority if not set
          };
        })
        .sort((a: any, b: any) => a.priority - b.priority);

      return timeslots;
    } catch (error) {
      console.error('❌ Error fetching prioritized timeslots:', error);
      return FALLBACK_TIMESLOTS;
    }
  },

  /**
   * Get match details for a specific match index and date
   */
  async getMatchDetails(matchIndex: number, totalMatches: number, dateStr?: string): Promise<{
    time: string;
    venue: string;
    timeslot: VenueTimeslotWithPriority | null;
  }> {
    const allTimeslots = await this.getPrioritizedTimeslots();
    
    // Use ALL 7 timeslots in priority order for maximum distribution
    let availableSlots = allTimeslots;
    
    if (availableSlots.length === 0) {
      console.warn('⚠️ No available slots found, using default');
      return { time: '19:00', venue: 'De Dageraad Harelbeke', timeslot: null };
    }

    // Cyclically distribute matches across ALL available priority slots (1-7)
    // This ensures both venues and all timeslots are properly utilized
    const selectedSlot = availableSlots[matchIndex % availableSlots.length];
    
    console.log(`🎯 Selected slot for match ${matchIndex + 1}/${totalMatches}: Priority ${selectedSlot.priority}, ${selectedSlot.venue_name} at ${selectedSlot.start_time} (${selectedSlot.day_of_week === 1 ? 'Monday' : 'Tuesday'})`);
    
    return {
      time: selectedSlot.start_time,
      venue: selectedSlot.venue_name,
      timeslot: selectedSlot
    };
  },

  /**
   * Format match date with time
   */
  async formatMatchDateTime(date: string, matchIndex: number, totalMatches: number): Promise<string> {
    const { time } = await this.getMatchDetails(matchIndex, totalMatches, date);
    return localDateTimeToISO(date, time);
  },

  /**
   * Show priority order for debugging
   */
  async showPriorityOrder(): Promise<void> {
    const priorityOrder = await this.getFastPriorityOrder();
    console.log('🎯 Prioriteitsvolgorde:');
    priorityOrder.forEach((slot) => {
      const dayName = slot.day_of_week === 1 ? 'Maandag' : 'Dinsdag';
      console.log(`${slot.priority}. ${slot.description} (${dayName} ${slot.start_time})`);
    });
  },

  /**
   * Clear cached priority order data
   */
  clearCache(): void {
    localStorage.removeItem('fastPriorityOrder');
  },

  /**
   * Refresh priority order data from database
   */
  async refreshPriorityOrder(): Promise<void> {
    this.clearCache();
    await this.getFastPriorityOrder();
  }
}; 