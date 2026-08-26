import { supabase } from "@/integrations/supabase/client";
import { getRpcSessionArgs } from "@/lib/authSession";
import {
  fetchRefereeAvailabilityForSession,
  fetchRefereesForSession,
  fetchScheidsAvailabilityStats,
} from "@/services/scheidsrechter/scheidsSessionFetch";
import type {
  AvailabilityInput,
  RefereeWithAvailability
} from "./types";

export const refereeAvailabilityService = {
  async submitAvailability(
    refereeId: number,
    pollMonth: string,
    availabilities: AvailabilityInput[]
  ): Promise<{ success: boolean; error?: string }> {
    try {
      for (const avail of availabilities) {
        const matchId = avail.match_id || null;
        const pollGroupId = avail.poll_group_id || `${pollMonth}_${matchId || 'general'}`;

        const { error } = await supabase.rpc('upsert_referee_availability_for_session', {
          ...getRpcSessionArgs(),
          p_match_id: matchId,
          p_poll_group_id: pollGroupId,
          p_poll_month: pollMonth,
          p_is_available: avail.is_available,
        });

        if (error) {
          console.error('Error submitting availability:', error);
          return { success: false, error: 'Kon beschikbaarheid niet opslaan' };
        }
      }
      return { success: true };
    } catch (error) {
      console.error('Error in submitAvailability:', error);
      return { success: false, error: 'Onverwachte fout' };
    }
  },

  async getAvailabilityForPoll(pollMonth: string): Promise<RefereeWithAvailability[]> {
    try {
      const [referees, availability] = await Promise.all([
        fetchRefereesForSession(),
        fetchRefereeAvailabilityForSession(pollMonth),
      ]);

      return referees.map((referee) => {
        const refAvailability = availability
          .filter((a) => a.user_id === referee.user_id)
          .map((a) => ({
            match_id: a.match_id || undefined,
            poll_group_id: a.poll_group_id,
            is_available: a.is_available,
          }));

        return {
          user_id: referee.user_id,
          username: referee.username,
          availability: refAvailability,
        };
      });
    } catch (error) {
      console.error('Error in getAvailabilityForPoll:', error);
      return [];
    }
  },

  async getRefereeAvailability(
    _refereeId: number,
    pollMonth: string
  ): Promise<AvailabilityInput[]> {
    try {
      const availability = await fetchRefereeAvailabilityForSession(pollMonth);
      return availability.map((a) => ({
        match_id: a.match_id || undefined,
        poll_group_id: a.poll_group_id,
        is_available: a.is_available,
      }));
    } catch (error) {
      console.error('Error in getRefereeAvailability:', error);
      return [];
    }
  },

  async updateAvailability(
    refereeId: number,
    matchId: number | null,
    pollGroupId: string,
    pollMonth: string,
    isAvailable: boolean | null,
    _notes?: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('upsert_referee_availability_for_session', {
        ...getRpcSessionArgs(),
        p_match_id: matchId,
        p_poll_group_id: pollGroupId,
        p_poll_month: pollMonth,
        p_is_available: isAvailable,
      });

      if (error) {
        console.error('Error updating availability:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error in updateAvailability:', error);
      return false;
    }
  },

  async getAvailabilityForMatches(
    _refereeId: number,
    matchIds: number[]
  ): Promise<Map<number, boolean>> {
    try {
      if (matchIds.length === 0) return new Map();

      const now = new Date();
      const pollMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const availability = await fetchRefereeAvailabilityForSession(pollMonth);

      const availabilityMap = new Map<number, boolean>();
      availability.forEach((item) => {
        if (item.match_id && matchIds.includes(item.match_id)) {
          availabilityMap.set(item.match_id, item.is_available);
        }
      });

      return availabilityMap;
    } catch (error) {
      console.error('Error in getAvailabilityForMatches:', error);
      return new Map();
    }
  },

  async clearAvailability(_refereeId: number, pollMonth: string): Promise<boolean> {
    try {
      const availability = await fetchRefereeAvailabilityForSession(pollMonth);
      for (const row of availability) {
        await supabase.rpc('upsert_referee_availability_for_session', {
          ...getRpcSessionArgs(),
          p_match_id: row.match_id,
          p_poll_group_id: row.poll_group_id,
          p_poll_month: pollMonth,
          p_is_available: null as unknown as boolean,
        });
      }
      return true;
    } catch (error) {
      console.error('Error in clearAvailability:', error);
      return false;
    }
  },

  async getAvailabilityStats(pollMonth: string): Promise<{
    total_referees: number;
    responded_count: number;
    available_by_date: Record<string, number>;
  }> {
    try {
      return await fetchScheidsAvailabilityStats(pollMonth);
    } catch (error) {
      console.error('Error in getAvailabilityStats:', error);
      return {
        total_referees: 0,
        responded_count: 0,
        available_by_date: {},
      };
    }
  },
};
