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

/** Zelfde sleutel als admin-matrix: `YYYY-MM_<matchId>`. */
export const buildMatchPollGroupId = (pollMonth: string, matchId: number): string =>
  `${pollMonth}_${matchId}`;

export const matchAvailabilityKey = (matchId: number): string => `match:${matchId}`;

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
 * Koppelt poll-antwoorden aan speelmomenten (per match).
 * Ondersteunt: `maand_matchId` (admin + nieuw profiel), `match_id`,
 * en legacy `datum__locatie` (oud profiel). Geen data wissen — alleen lezen.
 */
export function buildMyAvailabilityMap(
  clusters: ScheduleCluster[],
  rows: AvailabilityLookupRow[],
  userId: number,
): Map<string, boolean> {
  const raw = new Map<string, boolean>();

  for (const row of rows) {
    if (row.user_id !== userId) continue;
    if (row.poll_group_id) raw.set(row.poll_group_id, row.is_available);
    if (row.match_id != null) raw.set(matchAvailabilityKey(row.match_id), row.is_available);
  }

  const map = new Map<string, boolean>();

  for (const cluster of clusters) {
    let clusterValue: boolean | undefined;
    let clusterFullyKnown = cluster.matches.length > 0;
    const hasPerMatchRows = cluster.matches.some((m) => {
      const monthKey = buildMatchPollGroupId(cluster.poll_month, m.match_id);
      return raw.has(monthKey) || raw.has(matchAvailabilityKey(m.match_id));
    });

    for (const match of cluster.matches) {
      const monthKey = buildMatchPollGroupId(cluster.poll_month, match.match_id);
      const matchKey = matchAvailabilityKey(match.match_id);

      let value: boolean | undefined;
      if (raw.has(monthKey)) value = raw.get(monthKey);
      else if (raw.has(matchKey)) value = raw.get(matchKey);
      else if (raw.has(cluster.cluster_key)) value = raw.get(cluster.cluster_key);
      else if (match.assigned_referee_id === userId) value = true;

      if (value === undefined) {
        clusterFullyKnown = false;
        continue;
      }

      map.set(matchKey, value);
      map.set(monthKey, value);
      if (clusterValue === undefined) clusterValue = value;
      else if (clusterValue !== value) clusterFullyKnown = false;
    }

    if (!hasPerMatchRows && raw.has(cluster.cluster_key)) {
      map.set(cluster.cluster_key, raw.get(cluster.cluster_key)!);
    } else if (clusterFullyKnown && clusterValue !== undefined) {
      map.set(cluster.cluster_key, clusterValue);
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