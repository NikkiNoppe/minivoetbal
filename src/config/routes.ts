/**
 * Route Configuration
 * 
 * Centralized route mappings for the application, organized by functional domain.
 * All routes are defined here and can be imported throughout the app.
 * 
 * DOMAINS:
 * 1. Matches & Scores - Competition, cup, playoffs, match forms
 * 2. Teams & Players - Team management, player management, referees
 * 3. Cards & Suspensions - Card overview, suspension management
 * 4. Financial Administration - Cost management, transactions
 * 5. System & Admin Management - Users, settings, blog, notifications
 * 
 * @example
 * ```tsx
 * import { PUBLIC_ROUTES, ADMIN_ROUTES, DOMAIN_ROUTES } from '@/config/routes';
 * 
 * // Navigate to a domain route
 * navigate(DOMAIN_ROUTES.matches.public.competition);
 * navigate(DOMAIN_ROUTES.matches.admin.matchForms);
 * ```
 */

// =============================================================================
// DOMAIN 1: MATCHES & SCORES
// =============================================================================
export const MATCHES_ROUTES = {
  public: {
    competition: '/competitie',
    cup: '/beker',
    playoff: '/playoff',
  },
  admin: {
    matchForms: '/admin/match-forms',
    matchFormsLeague: '/admin/match-forms/league',
    matchFormsCup: '/admin/match-forms/cup',
    matchFormsPlayoffs: '/admin/match-forms/playoffs',
    competition: '/admin/competition',
    cup: '/admin/cup',
    playoffs: '/admin/playoffs',
    seasonCalendar: '/admin/season-calendar',
    seasonPlanning: '/admin/season-planning',
  },
} as const;

// =============================================================================
// DOMAIN 2: TEAMS & PLAYERS
// =============================================================================
export const TEAMS_PLAYERS_ROUTES = {
  public: {
    teams: '/teams',
  },
  admin: {
    players: '/admin/players',
    teams: '/admin/teams',
    referees: '/admin/scheidsrechters',
  },
} as const;

// =============================================================================
// DOMAIN 3: CARDS & SUSPENSIONS
// =============================================================================
export const CARDS_SUSPENSIONS_ROUTES = {
  public: {
    cards: '/kaarten',
  },
  admin: {
    suspensions: '/admin/suspensions',
    teamSuspensions: '/admin/schorsingen',
  },
} as const;

// =============================================================================
// DOMAIN 4: FINANCIAL ADMINISTRATION
// =============================================================================
export const FINANCIAL_ROUTES = {
  admin: {
    financial: '/admin/financial',
  },
} as const;

// =============================================================================
// DOMAIN 5: SYSTEM & ADMIN MANAGEMENT
// =============================================================================
export const SYSTEM_ROUTES = {
  public: {
    info: '/algemeen',
    regulations: '/reglement',
    archive: '/archief',
  },
  admin: {
    users: '/admin/users',
    settings: '/admin/settings',
    platformBeheer: '/admin/platform-beheer',
    blog: '/admin/blog-management',
    notifications: '/admin/notification',
  },
} as const;

// =============================================================================
// COMBINED DOMAIN ROUTES (for easy access)
// =============================================================================
export const DOMAIN_ROUTES = {
  matches: MATCHES_ROUTES,
  teamsPlayers: TEAMS_PLAYERS_ROUTES,
  cardsSuspensions: CARDS_SUSPENSIONS_ROUTES,
  financial: FINANCIAL_ROUTES,
  system: SYSTEM_ROUTES,
} as const;

// =============================================================================
// LEGACY ROUTES (backwards compatibility)
// =============================================================================

// Publieke routes (legacy format)
export const PUBLIC_ROUTES = {
  algemeen: SYSTEM_ROUTES.public.info,
  competitie: MATCHES_ROUTES.public.competition,
  beker: MATCHES_ROUTES.public.cup,
  playoff: MATCHES_ROUTES.public.playoff,
  reglement: SYSTEM_ROUTES.public.regulations,
  kaarten: CARDS_SUSPENSIONS_ROUTES.public.cards,
  teams: TEAMS_PLAYERS_ROUTES.public.teams,
  archief: SYSTEM_ROUTES.public.archive,
} as const;

// Admin routes (legacy format)
export const ADMIN_ROUTES = {
  'match-forms': MATCHES_ROUTES.admin.matchForms,
  'match-forms-league': MATCHES_ROUTES.admin.matchFormsLeague,
  'match-forms-cup': MATCHES_ROUTES.admin.matchFormsCup,
  'match-forms-playoffs': MATCHES_ROUTES.admin.matchFormsPlayoffs,
  players: TEAMS_PLAYERS_ROUTES.admin.players,
  teams: TEAMS_PLAYERS_ROUTES.admin.teams,
  users: SYSTEM_ROUTES.admin.users,
  competition: MATCHES_ROUTES.admin.competition,
  playoffs: MATCHES_ROUTES.admin.playoffs,
  cup: MATCHES_ROUTES.admin.cup,
  'season-calendar': MATCHES_ROUTES.admin.seasonCalendar,
  'season-planning': MATCHES_ROUTES.admin.seasonPlanning,
  financial: FINANCIAL_ROUTES.admin.financial,
  settings: SYSTEM_ROUTES.admin.settings,
  'platform-beheer': SYSTEM_ROUTES.admin.platformBeheer,
  suspensions: CARDS_SUSPENSIONS_ROUTES.admin.suspensions,
  schorsingen: CARDS_SUSPENSIONS_ROUTES.admin.teamSuspensions,
  scheidsrechters: TEAMS_PLAYERS_ROUTES.admin.referees,
  'blog-management': SYSTEM_ROUTES.admin.blog,
  'notification': SYSTEM_ROUTES.admin.notifications,
  profile: '/profile',
} as const;

// SuperAdmin platform (tenant-keuze id=1 / id=2)
export const SUPERADMIN_ROUTES = {
  platform: '/superadmin',
  beheer: '/superadmin/beheer',
  harelbeke: '/superadmin/harelbeke',
  kuurne: '/superadmin/kuurne',
} as const;

// Route groupings for mobile navigation
export const MATCHDAY_ROUTES = {
  'match-forms-league': ADMIN_ROUTES['match-forms-league'],
  'match-forms-cup': ADMIN_ROUTES['match-forms-cup'],
  'match-forms-playoffs': ADMIN_ROUTES['match-forms-playoffs'],
} as const;

export const ADMIN_MANAGEMENT_ROUTES = {
  players: ADMIN_ROUTES.players,
  scheidsrechters: ADMIN_ROUTES.scheidsrechters,
  schorsingen: ADMIN_ROUTES.schorsingen,
  teams: ADMIN_ROUTES.teams,
  users: ADMIN_ROUTES.users,
} as const;

export const ADMIN_SYSTEM_ROUTES = {
  competition: ADMIN_ROUTES.competition,
  cup: ADMIN_ROUTES.cup,
  playoffs: ADMIN_ROUTES.playoffs,
  'season-calendar': ADMIN_ROUTES['season-calendar'],
  'season-planning': ADMIN_ROUTES['season-planning'],
  settings: ADMIN_ROUTES.settings,
  'platform-beheer': ADMIN_ROUTES['platform-beheer'],
  'blog-management': ADMIN_ROUTES['blog-management'],
  'notification': ADMIN_ROUTES['notification'],
} as const;

// Alle routes gecombineerd
export const ALL_ROUTES = {
  ...PUBLIC_ROUTES,
  ...ADMIN_ROUTES,
} as const;

// SuperAdmin-only routes (speelformaten + platform/systeem)
export const SUPERADMIN_ONLY_ROUTES = [
  ADMIN_ROUTES.competition,
  ADMIN_ROUTES.cup,
  ADMIN_ROUTES.playoffs,
  ADMIN_ROUTES['season-calendar'],
  ADMIN_ROUTES['season-planning'],
  ADMIN_ROUTES['platform-beheer'],
  ADMIN_ROUTES.notification,
] as const;

// Route guards configuratie
export const ROUTE_GUARDS = {
  // Routes die auth vereisen
  requiresAuth: [
    ...Object.values(ADMIN_ROUTES),
    PUBLIC_ROUTES.kaarten,
  ],
  // Routes die admin rol vereisen
  // Note: teams is removed from here - access is now controlled by tab visibility settings
  requiresAdmin: [
    ADMIN_ROUTES.users,
    ADMIN_ROUTES.competition,
    ADMIN_ROUTES.playoffs,
    ADMIN_ROUTES.cup,
    ADMIN_ROUTES['season-calendar'],
    ADMIN_ROUTES['season-planning'],
    ADMIN_ROUTES.financial,
    ADMIN_ROUTES.settings,
    ADMIN_ROUTES['platform-beheer'],
    ADMIN_ROUTES.suspensions,
    ADMIN_ROUTES['blog-management'],
    ADMIN_ROUTES['notification'],
  ],
} as const;

// Helper functies
export type TabName = keyof typeof ALL_ROUTES;

/**
 * Get tab name from URL path
 */
export function getTabFromPath(path: string): TabName | null {
  // Check exact match first
  for (const [tab, route] of Object.entries(ALL_ROUTES)) {
    if (route === path) {
      return tab as TabName;
    }
  }
  
  // Check admin routes with subpaths (e.g., /admin/match-forms/league)
  if (path.startsWith('/admin/match-forms/')) {
    const subpath = path.replace('/admin/match-forms/', '');
    if (subpath === 'league') return 'match-forms-league';
    if (subpath === 'cup') return 'match-forms-cup';
    if (subpath === 'playoffs') return 'match-forms-playoffs';
  }
  
  // Check profile route
  if (path === '/profile') return 'profile';
  
  // Default fallback
  if (path === '/') return 'algemeen';
  
  return null;
}

/**
 * Get URL path from tab name
 */
export function getPathFromTab(tab: string): string {
  return ALL_ROUTES[tab as TabName] || PUBLIC_ROUTES.algemeen;
}

/**
 * Check if route requires authentication
 */
export function requiresAuth(path: string): boolean {
  return ROUTE_GUARDS.requiresAuth.includes(path as any);
}

/**
 * Check if route requires admin role
 */
export function requiresAdmin(path: string): boolean {
  return ROUTE_GUARDS.requiresAdmin.includes(path as any);
}

/**
 * Speelformaten (competitie/beker/play-off) + instellingen/systeem — enkel SuperAdmin.
 */
export function requiresSuperAdmin(path: string): boolean {
  return SUPERADMIN_ONLY_ROUTES.includes(path as (typeof SUPERADMIN_ONLY_ROUTES)[number]);
}

/** Fallback na geweigerde SuperAdmin-route (ingelogde admin). */
export const DEFAULT_ADMIN_REDIRECT = ADMIN_ROUTES['match-forms-league'];

// Route metadata interface
export interface RouteMeta {
  title: string;
  description: string;
  requiresAuth: boolean;
  requiresAdmin: boolean;
}

// Route metadata configuratie
export const ROUTE_META: Record<string, RouteMeta> = {
  // Publieke routes
  [PUBLIC_ROUTES.algemeen]: {
    title: 'Minivoetbal Harelbeke',
    description:
      'Nieuws en info over de Harelbeekse Minivoetbal Competitie. De grootste minivoetbalcompetitie van Harelbeke sinds 1979, met teams uit Harelbeke en Bavikhove.',
    requiresAuth: false,
    requiresAdmin: false,
  },
  [PUBLIC_ROUTES.competitie]: {
    title: 'Competitie',
    description:
      'Actueel klassement, speelschema en uitslagen van de Harelbeekse Minivoetbal Competitie. Volg alle competitiewedstrijden per speeldag.',
    requiresAuth: false,
    requiresAdmin: false,
  },
  [PUBLIC_ROUTES.beker]: {
    title: 'Beker',
    description:
      'Bekertoernooi van de Harelbeekse Minivoetbal Competitie: speelschema, uitslagen en bracket van achtste finales tot de finale.',
    requiresAuth: false,
    requiresAdmin: false,
  },
  [PUBLIC_ROUTES.playoff]: {
    title: 'Playoff',
    description:
      'Play-off rangschikking en uitslagen van de Harelbeekse Minivoetbal Competitie. Bekijk wie degradeert en promoveert aan het einde van het seizoen.',
    requiresAuth: false,
    requiresAdmin: false,
  },
  [PUBLIC_ROUTES.reglement]: {
    title: 'Reglement',
    description:
      'Volledig reglement en spelregels van de Harelbeekse Minivoetbal Competitie: inschrijving, wedstrijdregels, schorsingen en financiële bepalingen.',
    requiresAuth: false,
    requiresAdmin: false,
  },
  [PUBLIC_ROUTES.kaarten]: {
    title: 'Kaarten',
    description:
      'Overzicht van gele en rode kaarten en lopende schorsingen in de Harelbeekse Minivoetbal Competitie. Alleen zichtbaar voor ingelogde gebruikers.',
    requiresAuth: true,
    requiresAdmin: false,
  },
  [PUBLIC_ROUTES.archief]: {
    title: 'Archief',
    description:
      'Historisch archief met eindklassementen, play-off resultaten en bekerwinnaars van vorige seizoenen van de Harelbeekse Minivoetbal Competitie.',
    requiresAuth: false,
    requiresAdmin: false,
  },
  
  // Admin routes
  [ADMIN_ROUTES['match-forms']]: {
    title: 'Wedstrijdformulieren',
    description: 'Beheer wedstrijdformulieren',
    requiresAuth: true,
    requiresAdmin: false,
  },
  [ADMIN_ROUTES['match-forms-league']]: {
    title: 'Competitie Wedstrijdformulieren',
    description: 'Beheer competitie wedstrijdformulieren',
    requiresAuth: true,
    requiresAdmin: false,
  },
  [ADMIN_ROUTES['match-forms-cup']]: {
    title: 'Beker Wedstrijdformulieren',
    description: 'Beheer beker wedstrijdformulieren',
    requiresAuth: true,
    requiresAdmin: false,
  },
  [ADMIN_ROUTES['match-forms-playoffs']]: {
    title: 'Playoff Wedstrijdformulieren',
    description: 'Beheer playoff wedstrijdformulieren',
    requiresAuth: true,
    requiresAdmin: false,
  },
  [ADMIN_ROUTES.players]: {
    title: 'Spelers',
    description: 'Beheer spelers',
    requiresAuth: true,
    requiresAdmin: false,
  },
  [ADMIN_ROUTES.teams]: {
    title: 'Teams Beheer',
    description: 'Beheer teams en teaminstellingen',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES.users]: {
    title: 'Gebruikers',
    description: 'Beheer gebruikers en rollen',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES.competition]: {
    title: 'Competitie Beheer',
    description: 'Doorverwijzing naar Seizoensplanning',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES.playoffs]: {
    title: 'Playoff Beheer',
    description: 'Doorverwijzing naar Seizoensplanning',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES.cup]: {
    title: 'Beker Beheer',
    description: 'Doorverwijzing naar Seizoensplanning',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES['season-calendar']]: {
    title: 'Seizoenskalender',
    description: 'Doorverwijzing naar Seizoensplanning',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES['season-planning']]: {
    title: 'Seizoensplanning',
    description: 'Opzet, kalender en preview — competitie, beker en play-offs in één flow',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES.financial]: {
    title: 'Financieel',
    description: 'Beheer financiële transacties en kosten',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES.settings]: {
    title: 'Instellingen',
    description: 'Competitie-, seizoen- en wedstrijdformulier-instellingen per organisatie',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES['platform-beheer']]: {
    title: 'Platform beheer',
    description: 'Tenants, branding, tab-zichtbaarheid en kleuren (superadmin)',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES.suspensions]: {
    title: 'Schorsingen',
    description: 'Beheer schorsingen',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES.schorsingen]: {
    title: 'Schorsingen',
    description: 'Beheer schorsingen',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES.scheidsrechters]: {
    title: 'Scheidsrechters Beheer',
    description: 'Beheer scheidsrechters',
    requiresAuth: true,
    requiresAdmin: false,
  },
  [ADMIN_ROUTES['blog-management']]: {
    title: 'Blog Beheer',
    description: 'Beheer blog berichten',
    requiresAuth: true,
    requiresAdmin: true,
  },
  [ADMIN_ROUTES['notification']]: {
    title: 'Berichten Beheer',
    description: 'Beheer berichten',
    requiresAuth: true,
    requiresAdmin: true,
  },
};

/**
 * Get metadata for a route
 */
export function getRouteMeta(path: string): RouteMeta | null {
  return ROUTE_META[path] || null;
}

