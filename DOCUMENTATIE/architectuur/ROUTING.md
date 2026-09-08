# URL Routing Documentatie

## Overzicht

De applicatie gebruikt volledige URL-based routing met React Router. Elke pagina heeft een eigen URL, wat zorgt voor:
- **Deep linking**: Direct naar een specifieke pagina navigeren via URL
- **Bookmarkbaarheid**: Pagina's kunnen gebookmarkt worden
- **SEO-vriendelijk**: Elke pagina heeft een unieke URL en dynamische meta tags
- **Browser navigatie**: Back/forward buttons werken correct
- **Shareable links**: URL's kunnen gedeeld worden met correcte social sharing tags

## Route Structuur

### Publieke Routes

Alle publieke routes zijn toegankelijk zonder authenticatie:

| Route | URL | Beschrijving |
|-------|-----|--------------|
| Algemeen | `/algemeen` | Algemene informatie pagina |
| Competitie | `/competitie` | Competitie overzicht, standen en uitslagen |
| Beker | `/beker` | Beker competitie overzicht en uitslagen |
| Playoff | `/playoff` | Playoff competitie overzicht en uitslagen |
| Reglement | `/reglement` | Reglement en spelregels |
| Kaarten | `/kaarten` | Overzicht van kaarten en schorsingen |
| Teams | `/teams` | Overzicht van alle teams |
| Scheidsrechters | `/scheidsrechters` | Overzicht van scheidsrechters |

### Admin Routes

Alle admin routes vereisen authenticatie en zijn onder `/admin/`:

| Route | URL | Auth | Admin |
|-------|-----|------|-------|
| Wedstrijdformulieren | `/admin/match-forms` | ✅ | ❌ |
| Competitie Forms | `/admin/match-forms/league` | ✅ | ❌ |
| Beker Forms | `/admin/match-forms/cup` | ✅ | ❌ |
| Playoff Forms | `/admin/match-forms/playoffs` | ✅ | ❌ |
| Spelers | `/admin/players` | ✅ | ❌ |
| Teams Beheer | `/admin/teams` | ✅ | ✅ |
| Gebruikers | `/admin/users` | ✅ | ✅ |
| Competitie Beheer | `/admin/competition` | ✅ | ✅ |
| Playoff Beheer | `/admin/playoffs` | ✅ | ✅ |
| Beker Beheer | `/admin/cup` | ✅ | ✅ |
| Financieel | `/admin/financial` | ✅ | ✅ |
| Instellingen | `/admin/settings` | ✅ | ✅ |
| Schorsingen | `/admin/suspensions` | ✅ | ✅ |
| Schorsingen (alt) | `/admin/schorsingen` | ✅ | ✅ |
| Scheidsrechters Beheer | `/admin/scheidsrechters` | ✅ | ❌ |
| Blog Beheer | `/admin/blog-management` | ✅ | ✅ |
| Notificaties Beheer | `/admin/notification-management` | ✅ | ✅ |

## Hoe Routing Werkt

### URL als Single Source of Truth

De applicatie gebruikt de URL als de enige bron van waarheid voor navigatie:
- **Geen state management** meer nodig voor navigatie
- **Directe URL navigatie** werkt altijd
- **Browser back/forward** werkt correct
- **Tab synchronisatie** gebeurt automatisch via URL

### Route Configuratie

Alle routes zijn gecentraliseerd in `src/config/routes.ts`:

```typescript
// Publieke routes
export const PUBLIC_ROUTES = {
  algemeen: '/algemeen',
  competitie: '/competitie',
  // ...
} as const;

// Admin routes
export const ADMIN_ROUTES = {
  'match-forms': '/admin/match-forms',
  players: '/admin/players',
  // ...
} as const;
```

### Route Mapping

**Tab naam → URL:**
```typescript
import { getPathFromTab } from '@/config/routes';
const path = getPathFromTab('competitie'); // Returns '/competitie'
```

**URL → Tab naam:**
```typescript
import { getTabFromPath } from '@/config/routes';
const tab = getTabFromPath('/competitie'); // Returns 'competitie'
```

## Route Guards (Beveiliging)

### ProtectedRoute Component

De `ProtectedRoute` component beveiligt routes die authenticatie of admin rol vereisen:

```typescript
import { ProtectedRoute } from '@/components/common/ProtectedRoute';

// Route vereist authenticatie
<Route path={ADMIN_ROUTES.players} element={
  <ProtectedRoute>
    <Index />
  </ProtectedRoute>
} />

// Route vereist admin rol
<Route path={ADMIN_ROUTES.users} element={
  <ProtectedRoute requireAdmin>
    <Index />
  </ProtectedRoute>
} />
```

### Hoe Route Guards Werken

1. **Auth Check**: Controleren of gebruiker is ingelogd
2. **Admin Check**: Controleren of gebruiker admin rol heeft
3. **Redirect**: Redirect naar `/algemeen` als toegang wordt geweigerd
4. **Location State**: Bewaart originele locatie voor terugkeer na login

### Location State

Bij redirect wordt de originele locatie bewaard:
- Gebruiker navigeert naar `/admin/match-forms` zonder login
- Redirect naar `/algemeen` met `state.from = '/admin/match-forms'`
- Na login: automatisch terug naar `/admin/match-forms`

## Navigatie

### Navigeren in Code

**Gebruik `navigate()` functie:**
```typescript
import { useNavigate } from 'react-router-dom';
import { PUBLIC_ROUTES, ADMIN_ROUTES } from '@/config/routes';

const navigate = useNavigate();

// Navigeer naar publieke route
navigate(PUBLIC_ROUTES.algemeen);

// Navigeer naar admin route
navigate(ADMIN_ROUTES['match-forms']);

// Navigeer via tab naam
import { getPathFromTab } from '@/config/routes';
const path = getPathFromTab('competitie');
navigate(path);
```

**Gebruik `getPathFromTab()` helper:**
```typescript
import { getPathFromTab } from '@/config/routes';

// Van tab naam naar URL
const path = getPathFromTab('competitie'); // '/competitie'
navigate(path);
```

### Huidige Route Bepalen

**Gebruik `useLocation()` hook:**
```typescript
import { useLocation } from 'react-router-dom';
import { getTabFromPath } from '@/config/routes';

const location = useLocation();
const tab = getTabFromPath(location.pathname); // 'competitie'
```

## Route Metadata (SEO)

### Dynamische Meta Tags

De applicatie update automatisch meta tags per route:
- **Document Title**: `{Route Title} - Harelbeekse Minivoetbal`
- **Meta Description**: Route-specifieke beschrijving
- **Open Graph Tags**: Voor social sharing (og:title, og:description, og:url)
- **Twitter Tags**: Voor Twitter sharing (twitter:title, twitter:description)

### Route Metadata Configuratie

Metadata is geconfigureerd in `src/config/routes.ts`:

```typescript
export const ROUTE_META: Record<string, RouteMeta> = {
  [PUBLIC_ROUTES.algemeen]: {
    title: 'Algemeen',
    description: 'Algemene informatie over de Harelbeekse Minivoetbal competitie',
    requiresAuth: false,
    requiresAdmin: false,
  },
  // ...
};
```

### Automatische Updates

De `useRouteMeta()` hook in `Layout.tsx` update automatisch:
- Document title bij route change
- Meta description bij route change
- Open Graph tags bij route change
- Twitter tags bij route change

## Lazy Loading & Code Splitting

### Hoe het Werkt

Alle route componenten zijn lazy loaded:
- **Kleinere initial bundle**: Alleen benodigde code wordt geladen
- **Code splitting**: Elke route heeft eigen chunk
- **Loading states**: Duidelijke feedback tijdens lazy loading

### Implementatie

```typescript
import { lazy, Suspense } from "react";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

// Lazy load componenten
const Index = lazy(() => import("./pages/Index"));

// Wrap in Suspense
<Route path={PUBLIC_ROUTES.algemeen} element={
  <Suspense fallback={<LoadingSpinner />}>
    <Index />
  </Suspense>
} />
```

## Tab Visibility Integratie

### Hoe het Werkt

Tab visibility checks werken samen met URL routing:
- **Verborgen tabs**: Zijn niet toegankelijk via URL
- **Automatische redirect**: Naar eerste zichtbare tab
- **Tab visibility**: Wordt gecontroleerd in `Layout.tsx`

### Implementatie

```typescript
// In Layout.tsx
useEffect(() => {
  if (publicTabs.includes(activeTab) && !isTabVisible(activeTab)) {
    // Tab is niet zichtbaar, redirect naar eerste zichtbare tab
    const visibleTab = publicTabs.find(tab => isTabVisible(tab));
    if (visibleTab) {
      navigate(getPathFromTab(visibleTab));
    }
  }
}, [activeTab, publicTabs, isTabVisible, navigate]);
```

## 404 Handling

### Hoe het Werkt

Ongeldige URLs tonen de 404 pagina (`NotFound.tsx`):
- **Catch-all route**: `path="*"` vangt alle ongeldige URLs
- **Redirect optie**: Link naar `/algemeen` voor terugkeer
- **Nederlandse teksten**: Consistent met applicatie

### Implementatie

```typescript
// In App.tsx
<Route path="*" element={
  <Suspense fallback={<LoadingSpinner />}>
    <NotFound />
  </Suspense>
} />
```

## Best Practices

### Nieuwe Routes Toevoegen

1. **Voeg route toe aan `src/config/routes.ts`:**
   ```typescript
   export const ADMIN_ROUTES = {
     // ... bestaande routes
     'nieuwe-route': '/admin/nieuwe-route',
   };
   ```

2. **Voeg metadata toe (optioneel):**
   ```typescript
   export const ROUTE_META: Record<string, RouteMeta> = {
     // ... bestaande metadata
     [ADMIN_ROUTES['nieuwe-route']]: {
       title: 'Nieuwe Route',
       description: 'Beschrijving van nieuwe route',
       requiresAuth: true,
       requiresAdmin: true,
     },
   };
   ```

3. **Voeg route toe aan `src/App.tsx`:**
   ```typescript
   <Route path={ADMIN_ROUTES['nieuwe-route']} element={
     <ProtectedRoute requireAdmin>
       <Suspense fallback={<LoadingSpinner />}>
         <Index />
       </Suspense>
     </ProtectedRoute>
   } />
   ```

4. **Update navigatie (optioneel):**
   - Voeg toe aan `Header.tsx` routeMap (als publiek)
   - Voeg toe aan `AdminSidebar.tsx` routeMap (als admin)

### Route Guards Gebruiken

**Standaard ProtectedRoute** (alleen auth vereist):
```typescript
<ProtectedRoute>
  <Index />
</ProtectedRoute>
```

**ProtectedRoute met Admin** (admin rol vereist):
```typescript
<ProtectedRoute requireAdmin>
  <Index />
</ProtectedRoute>
```

### Navigatie in Componenten

**Gebruik altijd route configuratie:**
```typescript
// ✅ Goed
import { PUBLIC_ROUTES } from '@/config/routes';
navigate(PUBLIC_ROUTES.algemeen);

// ❌ Vermijd hardcoded URLs
navigate('/algemeen');
```

## Bestand Structuur

### Route Configuratie
- **`src/config/routes.ts`**: Alle route mappings en metadata
- **`src/components/common/ProtectedRoute.tsx`**: Route guards
- **`src/components/common/LoadingSpinner.tsx`**: Loading state component

### Route Implementatie
- **`src/App.tsx`**: Alle route definities
- **`src/components/Layout.tsx`**: Layout component met route logic
- **`src/hooks/useRouteMeta.ts`**: Hook voor meta tag updates

### Navigatie Componenten
- **`src/components/pages/header/Header.tsx`**: Publieke navigatie
- **`src/components/pages/admin/AdminSidebar.tsx`**: Admin navigatie

## Troubleshooting

### Route werkt niet

**Checklist:**
1. ✅ Route bestaat in `src/config/routes.ts`
2. ✅ Route is toegevoegd aan `src/App.tsx`
3. ✅ Route guard is correct (auth/admin)
4. ✅ Browser console voor errors
5. ✅ Network tab voor failed requests

### Redirect werkt niet

**Mogelijke oorzaken:**
- Location state niet bewaard → Check `ProtectedRoute.tsx`
- Login redirect niet geïmplementeerd → Check `Layout.tsx` handleLoginSuccess
- Tab visibility redirect → Check `Layout.tsx` useEffect

### Tab niet zichtbaar via URL

**Mogelijke oorzaken:**
- Tab visibility settings → Check database `application_settings`
- Tab naam verkeerd → Check `TabVisibilityContext` voor visibility logic
- Redirect logic → Check `Layout.tsx` voor tab visibility redirect

### Meta tags niet correct

**Mogelijke oorzaken:**
- useRouteMeta hook niet aangeroepen → Check `Layout.tsx`
- Route metadata niet geconfigureerd → Check `routes.ts` ROUTE_META
- Meta tags niet in DOM → Check browser DevTools Elements tab

### Lazy loading niet werkt

**Mogelijke oorzaken:**
- Lazy import incorrect → Check `App.tsx` voor `lazy()` imports
- Suspense boundary ontbreekt → Check `App.tsx` voor Suspense wrappers
- LoadingSpinner niet geïmporteerd → Check `App.tsx` imports

## Belangrijke Bestanden

### Configuratie
- `src/config/routes.ts` - Route mappings, metadata, helper functies

### Implementatie
- `src/App.tsx` - Route definities met lazy loading
- `src/components/Layout.tsx` - Layout met route logic
- `src/components/common/ProtectedRoute.tsx` - Route guards
- `src/hooks/useRouteMeta.ts` - Meta tag updates

### Navigatie
- `src/components/pages/header/Header.tsx` - Publieke navigatie
- `src/components/pages/admin/AdminSidebar.tsx` - Admin navigatie

## Samenvatting

De routing implementatie biedt:
- ✅ **URL-based navigation**: Elke pagina heeft eigen URL
- ✅ **Route guards**: Automatische beveiliging van admin routes
- ✅ **Location state**: Terugkeer naar originele locatie na login
- ✅ **Lazy loading**: Performance optimalisatie met code splitting
- ✅ **Route metadata**: SEO-vriendelijke meta tags per route
- ✅ **Tab visibility**: Integratie met tab visibility settings
- ✅ **404 handling**: Duidelijke error pagina voor ongeldige URLs
- ✅ **Type safety**: TypeScript types voor alle routes

De routing is **production-ready** en volgt React Router best practices.
