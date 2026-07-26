import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Award,
  BookOpen,
  Building2,
  Calendar,
  CalendarRange,
  DollarSign,
  Home,
  MessageSquare,
  Settings,
  Shield,
  Target,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { ADMIN_ROUTES, PUBLIC_ROUTES } from "@/config/routes";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  visibilityKey?: string;
  adminOnly?: boolean;
  teamManagerOnly?: boolean;
  /** Alleen zichtbaar voor SuperAdmin (user id -1). */
  superAdminOnly?: boolean;
}

export const PUBLIC_NAV_ORDER = [
  "algemeen",
  "competitie",
  "playoff",
  "beker",
  "kaarten",
  "archief",
  "reglement",
] as const;

export const PUBLIC_NAV_ITEMS: NavItem[] = [
  { key: "algemeen", label: "Algemeen", icon: Home },
  { key: "reglement", label: "Reglement", icon: BookOpen },
  { key: "competitie", label: "Competitie", icon: Trophy },
  { key: "beker", label: "Beker", icon: Award },
  { key: "playoff", label: "Play-off", icon: Target },
  { key: "kaarten", label: "Kaarten", icon: Calendar },
  { key: "archief", label: "Archief", icon: Archive },
];

export const HEADER_WEDSTRIJDFORMULIEREN_ITEMS: NavItem[] = [
  { key: "match-forms-league", label: "Competitie", icon: Trophy, adminOnly: false },
  { key: "match-forms-cup", label: "Beker", icon: Award, adminOnly: false },
  { key: "match-forms-playoffs", label: "Play-off", icon: Target, adminOnly: false },
];

export const HEADER_BEHEER_ITEMS: NavItem[] = [
  { key: "players", label: "Spelers", icon: Users, adminOnly: false },
  { key: "teams", label: "Teams", icon: Shield, adminOnly: true },
  { key: "scheidsrechters", label: "Scheidsrechters", icon: Shield, adminOnly: false },
  { key: "users", label: "Gebruikers", icon: User, adminOnly: true },
  { key: "schorsingen", label: "Schorsingen", icon: Shield, adminOnly: true },
];

export const SIDEBAR_WEDSTRIJDFORMULIEREN_ITEMS: NavItem[] = [
  { key: "match-forms-league", label: "Competitie", icon: Trophy, adminOnly: false },
  { key: "match-forms-cup", label: "Beker", icon: Award, adminOnly: false },
  { key: "match-forms-playoffs", label: "Play-Off", icon: Target, adminOnly: false },
];

export const SIDEBAR_BEHEER_ITEMS: NavItem[] = [
  { key: "players", label: "Spelers", icon: Users, adminOnly: false },
  { key: "ploegen", label: "Teams", icon: Users, adminOnly: false },
  { key: "scheidsrechters", label: "Scheidsrechters", icon: Calendar, adminOnly: false },
  { key: "teams", label: "Teams (Admin)", icon: Shield, adminOnly: true },
  { key: "users", label: "Gebruikers", icon: User, adminOnly: true },
  { key: "schorsingen", label: "Schorsingen", icon: Shield, adminOnly: true },
];

export const SPEELFORMATEN_ITEMS: NavItem[] = [
  {
    key: "season-planning",
    label: "Seizoensplanning",
    icon: CalendarRange,
    /** Hub zichtbaar als minstens één speelformaat-tab aan staat — zie filterSpeelformatenItems. */
    visibilityKey: "format-competition",
    superAdminOnly: true,
  },
];

export const FINANCIEEL_ITEMS: NavItem[] = [
  { key: "financial", label: "Financieel", icon: DollarSign, adminOnly: true },
];

/** Org-admin: seizoen, regels, blog, berichten, tab-zichtbaarheid (niet platformbreed). */
export const HEADER_ORGANISATIE_ITEMS: NavItem[] = [
  { key: "blog-management", label: "Blog", icon: BookOpen, adminOnly: true },
  { key: "notification", label: "Berichten", icon: MessageSquare, adminOnly: true },
  { key: "settings", label: "Instellingen", icon: Settings, adminOnly: true },
];

/** SuperAdmin: multi-tenant platform. */
export const HEADER_PLATFORM_ITEMS: NavItem[] = [
  { key: "superadmin-beheer", label: "Platform beheer", icon: Building2, superAdminOnly: true },
];

/** @deprecated Gebruik HEADER_ORGANISATIE_ITEMS + HEADER_PLATFORM_ITEMS in nieuwe UI. */
export const HEADER_SYSTEEM_ITEMS: NavItem[] = [
  ...HEADER_PLATFORM_ITEMS,
  ...HEADER_ORGANISATIE_ITEMS,
];

export const SIDEBAR_SYSTEEM_ITEMS: NavItem[] = [
  { key: "settings", label: "Instellingen", icon: Settings, adminOnly: true },
];

export const NAV_ROUTE_MAP: Record<string, string> = {
  algemeen: PUBLIC_ROUTES.algemeen,
  beker: PUBLIC_ROUTES.beker,
  competitie: PUBLIC_ROUTES.competitie,
  playoff: PUBLIC_ROUTES.playoff,
  reglement: PUBLIC_ROUTES.reglement,
  kaarten: PUBLIC_ROUTES.kaarten,
  archief: PUBLIC_ROUTES.archief,
  "match-forms": ADMIN_ROUTES["match-forms"],
  "match-forms-league": ADMIN_ROUTES["match-forms-league"],
  "match-forms-cup": ADMIN_ROUTES["match-forms-cup"],
  "match-forms-playoffs": ADMIN_ROUTES["match-forms-playoffs"],
  players: ADMIN_ROUTES.players,
  ploegen: ADMIN_ROUTES.teams,
  teams: ADMIN_ROUTES.teams,
  users: ADMIN_ROUTES.users,
  competition: ADMIN_ROUTES.competition,
  playoffs: ADMIN_ROUTES.playoffs,
  cup: ADMIN_ROUTES.cup,
  "season-calendar": ADMIN_ROUTES["season-calendar"],
  "season-planning": ADMIN_ROUTES["season-planning"],
  financial: ADMIN_ROUTES.financial,
  settings: ADMIN_ROUTES.settings,
  scheidsrechters: ADMIN_ROUTES.scheidsrechters,
  schorsingen: ADMIN_ROUTES.schorsingen,
  suspensions: ADMIN_ROUTES.suspensions,
  "blog-management": ADMIN_ROUTES["blog-management"],
  notification: ADMIN_ROUTES.notification,
  "superadmin-beheer": ADMIN_ROUTES["platform-beheer"],
};

export function normalizeRole(role: string): string {
  const r = String(role || "").toLowerCase();
  if (["team", "manager", "team_manager", "player-manager"].includes(r)) {
    return "player_manager";
  }
  return r;
}

export function getRoleLabel(
  normalizedRole: string,
  isAdmin: boolean,
  isSuperAdmin = false,
): string {
  if (isSuperAdmin) return "SuperAdmin";
  if (isAdmin) return "Administrator";
  if (normalizedRole === "referee") return "Scheidsrechter";
  if (normalizedRole === "player_manager") return "Team Manager";
  return "Gebruiker";
}

export type MobileSheetSectionVariant = "default" | "superadmin" | "public";

export interface MobileSheetSection {
  id: string;
  title: string;
  items: NavItem[];
  collapsible?: boolean;
  /** Standaard uitgeklapt in mobiel sheet (max. één werk-sectie). */
  defaultOpen?: boolean;
  variant?: MobileSheetSectionVariant;
  badge?: string;
}

export interface MobileSheetNavInput {
  isTabVisible: (key: string) => boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  normalizedRole: string;
  userRole?: string;
  isAuthenticated: boolean;
}

function relabelNavItem(item: NavItem, label: string): NavItem {
  return { ...item, label };
}

function buildMatchFormsSection(matchForms: NavItem[]): MobileSheetSection | null {
  if (matchForms.length === 0) return null;
  return {
    id: "match-forms",
    title: "Wedstrijdformulieren",
    items: matchForms,
    collapsible: matchForms.length > 1,
    defaultOpen: true,
  };
}

function appendMatchFormsSection(sections: MobileSheetSection[], matchForms: NavItem[]): void {
  const section = buildMatchFormsSection(matchForms);
  if (section) sections.push(section);
}

/**
 * Rol-specifieke secties voor het mobiele hamburgermenu (Header sheet).
 * Publieke "Informatie" wordt apart in Header gerenderd.
 */
export function getMobileSheetSections(input: MobileSheetNavInput): MobileSheetSection[] {
  const filterOpts = {
    isTabVisible: input.isTabVisible,
    isAdmin: input.isAdmin,
    isSuperAdmin: input.isSuperAdmin,
    normalizedRole: input.normalizedRole,
    userRole: input.userRole,
    variant: "header" as const,
  };

  const matchForms = input.isAuthenticated
    ? filterWedstrijdformulierenItems(HEADER_WEDSTRIJDFORMULIEREN_ITEMS, filterOpts)
    : [];
  const beheerAll = input.isAuthenticated
    ? filterBeheerItems(HEADER_BEHEER_ITEMS, filterOpts)
    : [];
  const financieel = input.isAuthenticated
    ? filterAdminOnlyItems(FINANCIEEL_ITEMS, filterOpts)
    : [];
  const organisatie = input.isAuthenticated
    ? filterAdminOnlyItems(HEADER_ORGANISATIE_ITEMS, filterOpts)
    : [];
  const platform = input.isAuthenticated
    ? filterAdminOnlyItems(HEADER_PLATFORM_ITEMS, filterOpts)
    : [];
  const speelschema = filterSpeelformatenItems(input.isSuperAdmin, input.isTabVisible);

  const isTeamManager = input.normalizedRole === "player_manager";
  const isReferee = input.normalizedRole === "referee";
  const isOrgAdmin = input.isAdmin || input.isSuperAdmin;

  const sections: MobileSheetSection[] = [];

  if (isTeamManager) {
    appendMatchFormsSection(sections, matchForms);
    return sections;
  }

  if (isReferee) {
    appendMatchFormsSection(sections, matchForms);
    return sections;
  }

  if (!isOrgAdmin) {
    return sections;
  }

  appendMatchFormsSection(sections, matchForms);

  const allowedBeheerKeys = new Set(["players", "teams", "users", "schorsingen", "scheidsrechters"]);
  const beheerItems = beheerAll
    .filter((item) => allowedBeheerKeys.has(item.key))
    .map((item) =>
      item.key === "scheidsrechters" ? relabelNavItem(item, "Scheidsrechter") : item,
    );

  for (const item of financieel) {
    if (!beheerItems.some((existing) => existing.key === item.key)) {
      beheerItems.push(item);
    }
  }

  if (beheerItems.length > 0) {
    sections.push({
      id: "beheer",
      title: "Beheer",
      items: beheerItems,
      collapsible: beheerItems.length > 1,
      defaultOpen: false,
    });
  }

  if (organisatie.length > 0) {
    sections.push({
      id: "organisatie",
      title: "Organisatie",
      items: organisatie,
      collapsible: true,
      defaultOpen: false,
    });
  }

  if (input.isSuperAdmin && speelschema.length > 0) {
    sections.push({
      id: "speelschema",
      title: "Speelschema",
      items: speelschema,
      collapsible: true,
      defaultOpen: false,
      variant: "superadmin",
      badge: "SuperAdmin",
    });
  }

  if (input.isSuperAdmin && platform.length > 0) {
    sections.push({
      id: "platform",
      title: "Platform",
      items: platform,
      collapsible: true,
      defaultOpen: false,
      variant: "superadmin",
      badge: "SuperAdmin",
    });
  }

  return sections;
}

export function getOrderedPublicNavItems(
  isTabVisible: (key: string) => boolean,
  _isSuperAdmin = false,
): NavItem[] {
  const items = PUBLIC_NAV_ORDER.map((key) => PUBLIC_NAV_ITEMS.find((i) => i.key === key))
    .filter((item): item is NavItem => Boolean(item));
  return items.filter((item) => isTabVisible(item.key));
}

interface FilterNavItemsOptions {
  isTabVisible: (key: string) => boolean;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  normalizedRole: string;
  userRole?: string;
  variant: "header" | "sidebar";
}

export function filterWedstrijdformulierenItems(
  items: NavItem[],
  {
    isTabVisible,
    isAdmin,
    isSuperAdmin = false,
  }: Pick<FilterNavItemsOptions, "isTabVisible" | "isAdmin" | "isSuperAdmin">,
): NavItem[] {
  return items.filter((item) => {
    if (!isTabVisible(item.key)) return false;
    if (item.adminOnly && !isAdmin && !isSuperAdmin) return false;
    return true;
  });
}

export function filterBeheerItems(
  items: NavItem[],
  { isTabVisible, isAdmin, isSuperAdmin = false, normalizedRole, userRole, variant }: FilterNavItemsOptions
): NavItem[] {
  return items.filter((item) => {
    if (!isTabVisible(item.key)) return false;
    if (item.adminOnly && !isAdmin && !isSuperAdmin) return false;
    if (item.teamManagerOnly && normalizedRole !== "player_manager") return false;
    if (item.key === "players" && normalizedRole === "player_manager") return false;
    if (item.key === "schorsingen" && normalizedRole === "player_manager") return false;

    if (variant === "sidebar") {
      if (item.key === "players" && userRole === "referee") return false;
      if (item.key === "scheidsrechters" && !(isAdmin || isSuperAdmin || userRole === "referee")) return false;
      return true;
    }

    if (item.key === "scheidsrechters" && !(isAdmin || isSuperAdmin || normalizedRole === "referee")) {
      return false;
    }
    return true;
  });
}

export function filterAdminOnlyItems(
  items: NavItem[],
  {
    isTabVisible,
    isAdmin,
    isSuperAdmin = false,
  }: Pick<FilterNavItemsOptions, "isTabVisible" | "isAdmin" | "isSuperAdmin">,
): NavItem[] {
  return items.filter((item) => {
    if (item.superAdminOnly) return isSuperAdmin;
    if (!isTabVisible(item.key)) return false;
    if (item.adminOnly && !isAdmin && !isSuperAdmin) return false;
    return true;
  });
}

export function filterSpeelformatenItems(
  isSuperAdmin: boolean,
  isTabVisible: (key: string) => boolean,
): NavItem[] {
  if (!isSuperAdmin) {
    return [];
  }

  const anyFormatVisible =
    isTabVisible("format-competition") ||
    isTabVisible("format-cup") ||
    isTabVisible("format-playoffs");

  if (!anyFormatVisible) {
    return [];
  }

  return SPEELFORMATEN_ITEMS;
}
