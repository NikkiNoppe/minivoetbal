import { MatchFormData } from "@/components/pages/admin/matches/types";

/**
 * Get location priority order (Harelbeke first, then Bavikhove)
 * @param location The location string
 * @returns Priority number (lower = first)
 */
export const getLocationOrder = (location: string): number => {
  const loc = location.toLowerCase();
  if (loc.includes('harelbeke') || loc.includes('dageraad')) return 1;
  if (loc.includes('bavikhove') || loc.includes('vlasschaard')) return 2;
  return 3;
};

/**
 * Generic function to sort matches by date, location (Harelbeke first), then time
 * @param matches Array of matches to sort
 * @returns Sorted matches array
 */
export const sortMatchesByDateAndTime = <T extends { date: string; time: string; location?: string }>(
  matches: T[]
): T[] => {
  return matches.sort((a, b) => {
    // 1. Sort by date
    const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateCompare !== 0) return dateCompare;

    // 2. Sort by location (Harelbeke first)
    if (a.location && b.location) {
      const locCompare = getLocationOrder(a.location) - getLocationOrder(b.location);
      if (locCompare !== 0) return locCompare;
    }

    // 3. Sort by time
    return a.time.localeCompare(b.time);
  });
};

/**
 * Sort cup matches by round, then by date and time
 * @param matches Array of cup matches to sort
 * @returns Sorted cup matches array
 */
export const sortCupMatches = (matches: MatchFormData[]): MatchFormData[] => {
  const getRoundOrder = (uniqueNumber: string): number => {
    if (uniqueNumber.startsWith("VR-")) return 0;
    if (uniqueNumber.startsWith("1/16-")) return 1;
    if (uniqueNumber.startsWith("1/8-")) return 2;
    if (uniqueNumber.startsWith("QF-")) return 3;
    if (uniqueNumber.startsWith("SF-")) return 4;
    if (uniqueNumber === "FINAL") return 5;
    return 99;
  };

  const getRoundSubOrder = (uniqueNumber: string): number => {
    const match = uniqueNumber.match(/-(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  };

  return matches.sort((a, b) => {
    const aRound = getRoundOrder(a.uniqueNumber);
    const bRound = getRoundOrder(b.uniqueNumber);
    
    if (aRound !== bRound) return aRound - bRound;
    
    const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateCompare !== 0) return dateCompare;

    // Location priority (Harelbeke first)
    if (a.location && b.location) {
      const locCompare = getLocationOrder(a.location) - getLocationOrder(b.location);
      if (locCompare !== 0) return locCompare;
    }

    if (a.time !== b.time) return a.time.localeCompare(b.time);
    
    return getRoundSubOrder(a.uniqueNumber) - getRoundSubOrder(b.uniqueNumber);
  });
};

/**
 * Sort league matches by matchday, then by date and time
 * @param matches Array of league matches to sort
 * @returns Sorted league matches array
 */
export const sortLeagueMatches = (matches: MatchFormData[]): MatchFormData[] => {
  const getMatchdayNumber = (matchday: string): number => {
    const num = matchday.match(/\d+/);
    return num ? parseInt(num[0]) : 0;
  };

  return matches.sort((a, b) => {
    const aMatchday = getMatchdayNumber(a.matchday);
    const bMatchday = getMatchdayNumber(b.matchday);
    if (aMatchday !== bMatchday) return aMatchday - bMatchday;

    const dateCompare = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dateCompare !== 0) return dateCompare;

    // Location priority (Harelbeke first)
    if (a.location && b.location) {
      const locCompare = getLocationOrder(a.location) - getLocationOrder(b.location);
      if (locCompare !== 0) return locCompare;
    }

    if (a.time !== b.time) return a.time.localeCompare(b.time);

    return a.uniqueNumber.localeCompare(b.uniqueNumber);
  });
};

/**
 * Check if it's Thursday (day 4) to automatically sort completed matches to bottom
 * @returns Whether completed matches should be moved to bottom
 */
const shouldSortCompletedToBottom = (): boolean => {
  const today = new Date();
  return today.getDay() === 4; // Thursday = 4
};

/**
 * Check if a match is completed (has valid scores)
 * @param match The match to check
 * @returns Whether the match is completed
 */
const isMatchCompleted = (match: MatchFormData): boolean => {
  return match.homeScore !== null && match.homeScore !== undefined && 
         match.awayScore !== null && match.awayScore !== undefined;
};

/**
 * Sort matches within groups (for display purposes)
 * @param groupedMatches Object with groups of matches
 * @param isCupMatchList Whether these are cup matches
 * @returns Object with sorted groups
 */
export const sortMatchesWithinGroups = (
  groupedMatches: Record<string, MatchFormData[]>,
  isCupMatchList: boolean
): Record<string, MatchFormData[]> => {
  const sortedGroups = { ...groupedMatches };
  const moveCompletedToBottom = shouldSortCompletedToBottom();
  
  Object.keys(sortedGroups).forEach(groupKey => {
    let matches = sortedGroups[groupKey];
    
    if (isCupMatchList) {
      // For cup matches, sort by date and time within each round
      matches = sortMatchesByDateAndTime(matches);
    } else {
      // For league matches, sort by date and time within each matchday
      matches = sortMatchesByDateAndTime(matches);
    }
    
    // On Thursdays, move completed matches to the bottom within each group
    if (moveCompletedToBottom) {
      const completedMatches = matches.filter(isMatchCompleted);
      const incompleteMatches = matches.filter(match => !isMatchCompleted(match));
      matches = [...incompleteMatches, ...completedMatches];
    }
    
    sortedGroups[groupKey] = matches;
  });
  
  return sortedGroups;
};

/**
 * Get cup round name from unique number
 * @param uniqueNumber The unique number of the match
 * @returns The round name
 */
export const getCupRoundName = (uniqueNumber: string): string => {
  if (uniqueNumber.startsWith("VR-")) return "Voorronde";
  if (uniqueNumber.startsWith("1/16-")) return "Zestiende Finales";
  if (uniqueNumber.startsWith("1/8-")) return "Achtste Finales";
  if (uniqueNumber.startsWith("QF-")) return "Kwart Finales";
  if (uniqueNumber.startsWith("SF-")) return "Halve Finales";
  if (uniqueNumber === "FINAL") return "Finale";
  return "Andere";
};

/**
 * Sort group keys (rounds or matchdays) in the correct order
 * @param groupKeys Array of group keys to sort
 * @param isCupMatchList Whether these are cup matches
 * @returns Sorted group keys
 */
export const sortGroupKeys = (groupKeys: string[], isCupMatchList: boolean): string[] => {
  if (isCupMatchList) {
    // Sort cup rounds in tournament order
    const roundOrder: Record<string, number> = {
      Voorronde: 0,
      "Zestiende Finales": 1,
      "Achtste Finales": 2,
      "Kwart Finales": 3,
      "Halve Finales": 4,
      Finale: 5,
      Andere: 99,
    };
    return groupKeys.sort((a, b) => (roundOrder[a] || 99) - (roundOrder[b] || 99));
  } else {
    // Sort matchdays numerically
    const getMatchdayNumber = (str: string) => {
      const num = str.match(/\d+/);
      return num ? parseInt(num[0]) : 0;
    };
    return groupKeys.sort((a, b) => getMatchdayNumber(a) - getMatchdayNumber(b));
  }
}; 