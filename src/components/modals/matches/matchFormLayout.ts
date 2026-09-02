/** Rol en sectievolgorde voor wedstrijdformulier — zie design-system/pages/wedstrijdformulier.md */

export type MatchFormRole = "team_manager" | "referee" | "admin";

export type MatchFormMobileTab = "spelers" | "score" | "overig";

export type MatchFormDesktopSection =
  | "score"
  | "gegevens"
  | "spelers"
  | "wedstrijd";

const MOBILE_TAB_LABELS: Record<MatchFormMobileTab, string> = {
  spelers: "Spelers",
  score: "Score",
  overig: "Overig",
};

export function getMatchFormRole(isAdmin: boolean, isReferee: boolean): MatchFormRole {
  if (isAdmin) return "admin";
  if (isReferee) return "referee";
  return "team_manager";
}

/** Mobiele tabs per rol (P4) */
export function getMatchFormMobileTabs(role: MatchFormRole): MatchFormMobileTab[] {
  if (role === "team_manager") {
    return ["spelers", "score"];
  }
  return ["score", "spelers", "overig"];
}

/** Zorg dat actieve tab geldig is voor de huidige rol (o.a. na dev-rolwissel). */
export function coerceMatchFormMobileTab(
  role: MatchFormRole,
  tab: MatchFormMobileTab,
): MatchFormMobileTab {
  const tabs = getMatchFormMobileTabs(role);
  if (tabs.includes(tab)) return tab;
  return getDefaultMatchFormMobileTab(role);
}

export function getMatchFormMobileTabLabel(tab: MatchFormMobileTab): string {
  return MOBILE_TAB_LABELS[tab];
}

/** Standaard actieve tab bij openen op mobiel */
export function getDefaultMatchFormMobileTab(role: MatchFormRole): MatchFormMobileTab {
  if (role === "team_manager") return "spelers";
  return "score";
}

/** Welke mobiele tab hoort bij een desktop-sectie */
export function getSectionMobileTab(
  section: MatchFormDesktopSection,
  role: MatchFormRole,
): MatchFormMobileTab | null {
  switch (section) {
    case "score":
      return "score";
    case "spelers":
      return "spelers";
    case "gegevens":
      return "score";
    case "wedstrijd":
      return role === "team_manager" ? null : "overig";
    default:
      return null;
  }
}

/** Flex order voor desktop sectievolgorde */
export function getSectionDesktopOrder(
  section: MatchFormDesktopSection,
  role: MatchFormRole,
): number {
  const order = getDesktopSectionOrder(role);
  const index = order.indexOf(section);
  return index >= 0 ? index + 1 : 99;
}

const DESKTOP_FLEX_ORDER_CLASS: Record<number, string> = {
  1: "md:order-1",
  2: "md:order-2",
  3: "md:order-3",
  4: "md:order-4",
};

/** Tailwind flex-order class voor desktop sectievolgorde (statische strings i.v.m. purge). */
export function getSectionDesktopOrderClass(
  section: MatchFormDesktopSection,
  role: MatchFormRole,
): string {
  const order = getSectionDesktopOrder(section, role);
  return DESKTOP_FLEX_ORDER_CLASS[order] ?? "md:order-last";
}

/** Desktop sectievolgorde per rol */
export function getDesktopSectionOrder(role: MatchFormRole): MatchFormDesktopSection[] {
  switch (role) {
    case "team_manager":
      return ["spelers", "score", "gegevens"];
    case "referee":
      return ["score", "gegevens", "spelers", "wedstrijd"];
    case "admin":
      return ["score", "gegevens", "spelers", "wedstrijd"];
  }
}

/** Welke collapsibles standaard open bij openen modal */
export function getDefaultSectionOpenState(
  role: MatchFormRole,
  teamId: number,
  homeTeamId: number,
  awayTeamId: number,
) {
  const ownIsHome = homeTeamId === teamId;
  const ownIsAway = awayTeamId === teamId;

  if (role === "team_manager") {
    return {
      homeTeamOpen: ownIsHome,
      awayTeamOpen: ownIsAway,
      isKaartenOpen: false,
      isGegevensOpen: false,
      isNotitiesOpen: false,
      isFinancieelOpen: false,
    };
  }

  if (role === "referee") {
    return {
      homeTeamOpen: true,
      awayTeamOpen: true,
      isKaartenOpen: true,
      isGegevensOpen: true,
      isNotitiesOpen: false,
      isFinancieelOpen: false,
    };
  }

  return {
    homeTeamOpen: true,
    awayTeamOpen: true,
    isKaartenOpen: false,
    isGegevensOpen: false,
    isNotitiesOpen: false,
    isFinancieelOpen: false,
  };
}
