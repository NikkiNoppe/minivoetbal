/** Alle ploegen in play-offs; oneven totaal → extra ploeg in de top. */
export function splitPlayoffGroups(teamCount: number): {
  topTeams: number;
  bottomTeams: number;
} {
  const n = Math.max(4, Math.floor(Number(teamCount)) || 4);
  const bottomTeams = Math.floor(n / 2);
  const topTeams = n - bottomTeams;
  return { topTeams, bottomTeams };
}
