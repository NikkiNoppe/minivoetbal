import { fetchScheidsScheduleForMonth } from "@/services/scheidsrechter/scheidsSessionFetch";
import { buildSeasonMonthOptions } from "@/lib/refereeSeasonMonths";

export interface ScheduleMatch {
  match_id: number;
  match_date: string;
  location: string | null;
  home_team_name: string;
  away_team_name: string;
  assigned_referee_id: number | null;
}

export interface ScheduleCluster {
  cluster_key: string;
  poll_month: string;
  match_date: string;
  location: string;
  time_slot: string;
  matches: ScheduleMatch[];
}

const pad = (n: number) => String(n).padStart(2, '0');

const toDateKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

const toMonthKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};

const toTimeKey = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
};

export const buildClusterKey = (matchDateIso: string, location: string | null): string => {
  const date = toDateKey(matchDateIso);
  const loc = (location || 'onbekend').trim().toLowerCase().replace(/\s+/g, '-');
  return `${date}__${loc}`;
};

export interface AvailabilityLookupRow {
  user_id: number;
  match_id: number | null;
  poll_group_id: string | null;
  is_available: boolean;
}

export function isClusterFullyAssigned(cluster: ScheduleCluster): boolean {
  return (
    cluster.matches.length > 0 &&
    cluster.matches.every((match) => match.assigned_referee_id != null)
  );
}

/**
 * Koppelt poll-antwoorden aan speeldagen. De scheidsrechterspagina slaat
 * beschikbaarheid op per match (`2026-10_2312`) of zonder poll_group_id;
 * het profiel gebruikt `datum__locatie`. Toewijzingen tellen als bevestigd.
 */
export function buildMyAvailabilityMap(
  clusters: ScheduleCluster[],
  rows: AvailabilityLookupRow[],
  userId: number,
): Map<string, boolean> {
  const map = new Map<string, boolean>();

  for (const row of rows) {
    if (row.user_id !== userId) continue;
    if (row.poll_group_id) map.set(row.poll_group_id, row.is_available);
    if (row.match_id != null) map.set(`match:${row.match_id}`, row.is_available);
  }

  for (const cluster of clusters) {
    if (map.has(cluster.cluster_key)) continue;

    let fromMatch: boolean | undefined;
    for (const match of cluster.matches) {
      const monthKey = `${cluster.poll_month}_${match.match_id}`;
      if (map.has(monthKey)) {
        fromMatch = map.get(monthKey);
        if (fromMatch) break;
      }
      const matchKey = `match:${match.match_id}`;
      if (map.has(matchKey)) {
        fromMatch = map.get(matchKey);
        if (fromMatch) break;
      }
    }
    if (fromMatch !== undefined) {
      map.set(cluster.cluster_key, fromMatch);
      continue;
    }

    const assignedToMe = cluster.matches.some((match) => match.assigned_referee_id === userId);
    if (assignedToMe) {
      map.set(cluster.cluster_key, true);
      continue;
    }

    if (isClusterFullyAssigned(cluster)) {
      map.set(cluster.cluster_key, false);
    }
  }

  return map;
}

function clusterMatchesForMonth(month: string, rows: Awaited<ReturnType<typeof fetchScheidsScheduleForMonth>>): ScheduleCluster[] {
  const grouped = new Map<string, ScheduleCluster>();

  rows.forEach((m) => {
    const key = buildClusterKey(m.match_date, m.location);
    const match: ScheduleMatch = {
      match_id: m.match_id,
      match_date: m.match_date,
      location: m.location,
      home_team_name: m.home_team_name || '?',
      away_team_name: m.away_team_name || '?',
      assigned_referee_id: m.assigned_referee_id ?? null,
    };

    if (!grouped.has(key)) {
      grouped.set(key, {
        cluster_key: key,
        poll_month: toMonthKey(m.match_date),
        match_date: toDateKey(m.match_date),
        location: m.location || 'onbekend',
        time_slot: toTimeKey(m.match_date),
        matches: [],
      });
    }

    const cluster = grouped.get(key)!;
    cluster.matches.push(match);
    if (toTimeKey(m.match_date) < cluster.time_slot) {
      cluster.time_slot = toTimeKey(m.match_date);
    }
  });

  return Array.from(grouped.values()).sort((a, b) => {
    const dateCmp = a.match_date.localeCompare(b.match_date);
    if (dateCmp !== 0) return dateCmp;
    return a.location.localeCompare(b.location);
  });
}

export const monthScheduleService = {
  async getClustersForMonth(month: string): Promise<ScheduleCluster[]> {
    if (!/^\d{4}-\d{2}$/.test(month)) return [];
    const rows = await fetchScheidsScheduleForMonth(month);
    return clusterMatchesForMonth(month, rows);
  },

  async getUpcomingClusters(_monthsAhead?: number): Promise<ScheduleCluster[]> {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    // Hele seizoen (sep→jun), vanaf huidige maand — blijft meelopen met gepubliceerde speeldagen
    const months = buildSeasonMonthOptions(now)
      .map((o) => o.value)
      .filter((m) => m >= currentMonth);

    if (months.length === 0) return [];

    const allClusters = await Promise.all(
      months.map((m) => this.getClustersForMonth(m)),
    );

    const todayKey = toDateKey(now.toISOString());

    return allClusters
      .flat()
      .filter((cluster) => cluster.match_date >= todayKey)
      .sort((a, b) => {
        const dateCmp = a.match_date.localeCompare(b.match_date);
        if (dateCmp !== 0) return dateCmp;
        return a.location.localeCompare(b.location);
      });
  },
};