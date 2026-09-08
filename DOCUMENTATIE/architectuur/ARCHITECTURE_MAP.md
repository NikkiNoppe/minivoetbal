# 🏗️ Architectuur Overzicht - Harelbeekse Minivoetbal

> Laatste update: 22 mei 2026

Dit document biedt een volledig overzicht van de architectuur van de Harelbeekse Minivoetbal webapp.

---

## 📊 Statistieken

| Categorie | Aantal |
|-----------|--------|
| Publieke Pagina's | 7 |
| Admin Pagina's | 16 |
| Modals | 25 |
| Context Providers | 6 |
| Shared UI Components | 40+ |
| Edge Functions | 15 |

---

## 🗺️ App Structuur Diagram

```mermaid
graph TB
    subgraph "Entry Point"
        Main["main.tsx"]
        App["App.tsx"]
    end
    
    subgraph "Providers"
        EB["ErrorBoundary"]
        TP["ThemeProvider"]
        QCP["QueryClientProvider"]
        AP["AuthProvider"]
        MP["ModalProvider"]
        PLLP["PlayerListLockProvider"]
        TVP["TabVisibilityProvider"]
        TTP["TooltipProvider"]
    end
    
    subgraph "Router"
        BR["BrowserRouter"]
        Routes["Routes"]
    end
    
    subgraph "Pages"
        Public["Public Pages"]
        Admin["Admin Pages"]
        NF["NotFound"]
        RP["ResetPassword"]
    end
    
    Main --> App
    App --> EB --> TP --> QCP --> AP --> MP --> PLLP --> TVP --> TTP --> BR
    BR --> Routes
    Routes --> Public
    Routes --> Admin
    Routes --> NF
    Routes --> RP
```

---

## 📄 Pagina's Overzicht

### Publieke Pagina's

| Route | Component | Beschrijving |
|-------|-----------|--------------|
| `/algemeen` | `AlgemeenPage` | Algemene informatie & nieuws |
| `/competitie` | `CompetitiePage` | Competitie stand & programma |
| `/beker` | `PublicBekerPage` | Beker competitie overzicht |
| `/play-off` | `PlayOffPage` | Play-off bracket & resultaten |
| `/teams` | `TeamsList` | Lijst van alle teams |
| `/players` | `PlayerPage` | Spelers beheer (team manager) |
| `/kaarten` | `KaartenPage` | Kaarten overzicht |
| `/reglement` | `ReglementPage` | Competitie reglement |

### Admin Pagina's

| Route | Component | Beschrijving |
|-------|-----------|--------------|
| `/admin/match-forms` | `MatchesPage` | Wedstrijdformulieren beheer |
| `/admin/players` | `PlayerPage` | Spelers administratie |
| `/admin/teams` | `TeamsPage` | Teams beheer |
| `/admin/competition` | `CompetitionPage` | Competitie instellingen |
| `/admin/beker` | `BekerPage` | Beker beheer |
| `/admin/play-off` | `AdminPlayoffPage` | Play-off beheer |
| `/admin/financial` | `FinancialPage` | Financieel overzicht |
| `/admin/suspensions` | `AdminSuspensionsPage` | Schorsingen beheer |
| `/admin/scheidsrechters` | `ScheidsrechtersPage` | Scheidsrechters beheer |
| `/admin/notifications` | `NotificationPage` | Notificaties beheer |
| `/admin/blog` | `BlogPage` | Blog/nieuws beheer |
| `/admin/users` | `UserPage` | Gebruikers beheer |
| `/admin/settings` | `SettingsPage` | Systeem instellingen |
| `/admin/schorsingen` | `SchorsingenPage` | Schorsingen regels |

---

## 🧩 Component Hierarchie per Pagina

### Publieke Pagina's

```mermaid
graph TD
    subgraph "CompetitiePage"
        CP[CompetitiePage]
        CP --> RST[ResponsiveStandingsTable]
        CP --> RSS[ResponsiveScheduleTable]
        CP --> MFP[MatchFilterPanel]
    end
    
    subgraph "AlgemeenPage"
        AP[AlgemeenPage]
        AP --> H[Header]
        AP --> NC[NewsCards]
        AP --> UM[UpcomingMatches]
        AP --> F[Footer]
    end
    
    subgraph "PlayOffPage"
        POP[PlayOffPage]
        POP --> PB[PlayoffBracket]
        POP --> MC[MatchCard]
    end
```

### Admin Pagina's

```mermaid
graph TD
    subgraph "MatchesPage"
        MP[MatchesPage]
        MP --> MFL[MatchesFormList]
        MP --> MFM[MatchesFormModal]
        MP --> MCF[MatchesCompactForm]
        MFM --> MPST[MatchesPlayerSelectionTable]
        MFM --> MDS[MatchesDataSection]
        MFM --> MRCS[MatchesRefereeCardsSection]
    end
    
    subgraph "TeamsPage"
        TP[TeamsPage]
        TP --> TD[TeamDashboard]
        TP --> TF[TeamForm]
        TP --> PSF[PlayerSelectionForm]
        TD --> TM[TeamModal]
    end
    
    subgraph "FinancialPage"
        FP[FinancialPage]
        FP --> FTDM[FinancialTeamDetailModal]
        FP --> FCSM[FinancialCostSettingsModal]
        FP --> FMRM[FinancialMonthlyReportsModal]
        FP --> TEM[TransactionEditModal]
    end
```

---

## 🪟 Modal Systeem

### Modal Types

| Type | Base Component | Gebruik |
|------|----------------|---------|
| `AppModal` | `Dialog` | Formulieren, details, selecties |
| `AppAlertModal` | `AlertDialog` | Bevestigingen, waarschuwingen |

### Alle Modals

```mermaid
graph LR
    subgraph "AppModal Instances"
        LM[LoginModal]
        FPM[ForgotPasswordModal]
        MFM[MatchesFormModal]
        PM[PlayerModal]
        TM[TeamModal]
        UM[UserModal]
        NFM[NotificationFormModal]
        FTDM[FinancialTeamDetailModal]
        FCSM[FinancialCostSettingsModal]
        FESM[FinancialEnhancedSettingsModal]
        FMRM[FinancialMonthlyReportsModal]
        TEM[TransactionEditModal]
        MPSM[MatchesPenaltyShootoutModal]
        FATM[FinancialAffectedTransactionsModal]
    end
    
    subgraph "AppAlertModal Instances"
        CDM[ConfirmDeleteDialog]
        UDCD[UserDeleteConfirmDialog]
        PDRP[PlayerDataRefreshPopup]
        AAM[AdminAlertModals]
    end
```

### Modal Details Tabel

| Modal | Caller Component | Size | Variant |
|-------|------------------|------|---------|
| `LoginModal` | `Header` | `md` | `AppModal` |
| `ForgotPasswordModal` | `LoginModal` | `sm` | `AppModal` |
| `MatchesFormModal` | `MatchesFormList` | `xl` | `AppModal` |
| `PlayerModal` | `PlayerPage` | `md` | `AppModal` |
| `TeamModal` | `TeamsList` | `lg` | `AppModal` |
| `UserModal` | `UserPage` | `md` | `AppModal` |
| `NotificationFormModal` | `NotificationPage` | `lg` | `AppModal` |
| `FinancialTeamDetailModal` | `FinancialPage` | `xl` | `AppModal` |
| `FinancialCostSettingsModal` | `FinancialPage` | `lg` | `AppModal` |
| `FinancialEnhancedSettingsModal` | `FinancialPage` | `xl` | `AppModal` |
| `FinancialMonthlyReportsModal` | `FinancialPage` | `lg` | `AppModal` |
| `TransactionEditModal` | `FinancialTeamDetailModal` | `md` | `AppModal` |
| `MatchesPenaltyShootoutModal` | `MatchesFormModal` | `md` | `AppModal` |
| `FinancialAffectedTransactionsModal` | `FinancialCostSettingsModal` | `lg` | `AppModal` |
| `ConfirmDeleteDialog` | `TeamsList` | `sm` | `AppAlertModal` |
| `UserDeleteConfirmDialog` | `UserPage` | `sm` | `AppAlertModal` |
| `PlayerDataRefreshPopup` | `MatchesFormModal` | `sm` | `AppAlertModal` |

---

## 🧭 Navigatie Flow

```mermaid
graph TB
    subgraph "Header Navigation"
        Logo[Logo] --> Home["/algemeen"]
        HM[Hamburger Menu] --> MobileNav
    end
    
    subgraph "Mobile Navigation"
        MobileNav --> PublicLinks
        MobileNav --> AuthLinks
    end
    
    subgraph "Public Links"
        PublicLinks --> Algemeen["/algemeen"]
        PublicLinks --> Competitie["/competitie"]
        PublicLinks --> Beker["/beker"]
        PublicLinks --> PlayOff["/play-off"]
        PublicLinks --> Teams["/teams"]
    end
    
    subgraph "Auth Flow"
        AuthLinks --> |"Not Logged In"| Login[LoginModal]
        AuthLinks --> |"Logged In"| UserMenu
        UserMenu --> Players["/players"]
        UserMenu --> |"Admin Only"| AdminPanel
        UserMenu --> Logout
    end
    
    subgraph "Admin Panel"
        AdminPanel --> AdminSidebar
        AdminSidebar --> MatchForms["/admin/match-forms"]
        AdminSidebar --> AdminPlayers["/admin/players"]
        AdminSidebar --> AdminTeams["/admin/teams"]
        AdminSidebar --> Financial["/admin/financial"]
        AdminSidebar --> Settings["/admin/settings"]
    end
```

---

## 🔄 Context & State Management

### Provider Hierarchie

```mermaid
graph TD
    App[App.tsx]
    App --> EB[ErrorBoundary]
    EB --> TP[ThemeProvider]
    TP --> QCP[QueryClientProvider]
    QCP --> AP[AuthProvider]
    AP --> MP[ModalProvider]
    MP --> PLLP[PlayerListLockProvider]
    PLLP --> TVP[TabVisibilityProvider]
    TVP --> TTP[TooltipProvider]
    TTP --> Router[BrowserRouter]
```

### Context Details

| Context | Bestand | Hook | Doel |
|---------|---------|------|------|
| `AuthProvider` | `AuthProvider.tsx` | `useAuth` | Authenticatie & user state |
| `ModalProvider` | `ModalContext.tsx` | `useModal` | Centrale modal state |
| `PlayerListLockProvider` | `PlayerListLockContext.tsx` | `usePlayerListLock` | Spelerlijst lock status |
| `TabVisibilityProvider` | `TabVisibilityContext.tsx` | `useTabVisibility` | Tab zichtbaarheid settings |
| `ThemeProvider` | `use-theme.tsx` | `useTheme` | Dark/light mode |

---

## 🎨 Shared UI Components

### Basis Components

| Component | Bestand | Beschrijving |
|-----------|---------|--------------|
| `Button` | `button.tsx` | Knop met varianten |
| `Input` | `input.tsx` | Tekst invoerveld |
| `Select` | `select.tsx` | Dropdown selectie |
| `Checkbox` | `checkbox.tsx` | Checkbox input |
| `Switch` | `switch.tsx` | Toggle switch |
| `Label` | `label.tsx` | Form label |
| `Textarea` | `textarea.tsx` | Multi-line tekst |

### Layout Components

| Component | Bestand | Beschrijving |
|-----------|---------|--------------|
| `Card` | `card.tsx` | Card container |
| `Dialog` | `dialog.tsx` | Modal dialog base |
| `Sheet` | `sheet.tsx` | Slide-in panel |
| `Tabs` | `tabs.tsx` | Tab navigatie |
| `Accordion` | `accordion.tsx` | Inklapbare secties |
| `Separator` | `separator.tsx` | Visuele scheiding |
| `ScrollArea` | `scroll-area.tsx` | Scrollbare container |

### Feedback Components

| Component | Bestand | Beschrijving |
|-----------|---------|--------------|
| `Toast` | `toast.tsx` | Notificatie toast |
| `Sonner` | `sonner.tsx` | Toast provider |
| `Alert` | `alert.tsx` | Alert berichten |
| `Progress` | `progress.tsx` | Voortgangsbalk |
| `Skeleton` | `skeleton.tsx` | Loading placeholder |

### Data Display

| Component | Bestand | Beschrijving |
|-----------|---------|--------------|
| `Table` | `table.tsx` | Data tabel |
| `Badge` | `badge.tsx` | Status badge |
| `Tooltip` | `tooltip.tsx` | Hover tooltip |

### Custom Components

| Component | Bestand | Beschrijving |
|-----------|---------|--------------|
| `AppModal` | `app-modal.tsx` | Standaard modal wrapper |
| `AppAlertModal` | `app-alert-modal.tsx` | Bevestiging modal |
| `LoadingSpinner` | `LoadingSpinner.tsx` | Laad indicator |
| `PageHeader` | `page-header.tsx` | Pagina header |
| `FilterInput` | `filter-input.tsx` | Filter invoer |
| `SearchInput` | `search-input.tsx` | Zoek invoer |

---

## ⚡ Edge Functions

| Functie | Bestand | Beschrijving | JWT |
|---------|---------|--------------|-----|
| `send-password-reset` | `send-password-reset/index.ts` | Wachtwoord reset emails | uit |
| `send-welcome-email` | `send-welcome-email/index.ts` | Welkom emails | uit |
| `delete-user` | `delete-user/index.ts` | Gebruiker verwijderen | uit |
| `generate-competition-schedule` | `generate-competition-schedule/index.ts` | Competitie schema genereren | uit |
| `generate-monthly-polls` | `generate-monthly-polls/index.ts` | Maandelijkse polls | uit |
| `sync-card-penalties` | `sync-card-penalties/index.ts` | Kaartboetes sync | uit |
| `sync-match-costs` | `sync-match-costs/index.ts` | Wedstrijdkosten sync (enkel) | uit |
| `sync-all-match-costs` | `sync-all-match-costs/index.ts` | Wedstrijdkosten batch sync | uit |
| `update-season-data` | `update-season-data/index.ts` | Seizoensdata update | uit |
| `send-forfait-notification` | `send-forfait-notification/index.ts` | Forfait e-mail via Resend | uit |
| `send-transactional-email` | `send-transactional-email/index.ts` | Transactionele e-mails | aan |
| `preview-transactional-email` | `preview-transactional-email/index.ts` | E-mail preview | uit |
| `handle-email-unsubscribe` | `handle-email-unsubscribe/index.ts` | Uitschrijflink afhandeling | uit |
| `handle-email-suppression` | `handle-email-suppression/index.ts` | Bounce/suppression afhandeling | uit |
| `notify-auto-suspension` | `notify-auto-suspension/index.ts` | Auto-schorsing notificatie | uit |

---

## 🗄️ Database Tabellen

```mermaid
erDiagram
    users ||--o{ team_users : "manages"
    teams ||--o{ team_users : "has"
    teams ||--o{ players : "has"
    teams ||--o{ matches : "home_team"
    teams ||--o{ matches : "away_team"
    teams ||--o{ team_costs : "has"
    matches ||--o{ team_costs : "generates"
    costs ||--o{ team_costs : "defines"
    users ||--o{ password_reset_tokens : "has"
    users ||--o{ referee_availability : "has"
    matches ||--o{ referee_availability : "has"
    teams ||--|| competition_standings : "has"

    users {
        int user_id PK
        string username
        string email
        string password
        enum role
    }
    
    teams {
        int team_id PK
        string team_name
        string contact_person
        string contact_email
        string contact_phone
        json preferred_play_moments
    }
    
    players {
        int player_id PK
        int team_id FK
        string first_name
        string last_name
        date birth_date
        int yellow_cards
        int red_cards
        int suspended_matches_remaining
    }
    
    matches {
        int match_id PK
        int home_team_id FK
        int away_team_id FK
        timestamp match_date
        int home_score
        int away_score
        bool is_submitted
        bool is_locked
        json home_players
        json away_players
    }
```

---

## 📁 Folder Structuur

```
src/
├── components/
│   ├── common/           # Gedeelde componenten
│   ├── layout/           # Layout componenten
│   ├── navigation/       # Navigatie componenten
│   ├── pages/
│   │   ├── admin/        # Admin pagina's
│   │   ├── footer/       # Footer component
│   │   ├── header/       # Header component
│   │   ├── login/        # Login componenten
│   │   └── public/       # Publieke pagina's
│   ├── tables/           # Tabel componenten
│   ├── ui/               # Shadcn UI componenten
│   └── user/             # User management
├── config/               # Route configuratie
├── context/              # React contexts
├── domains/              # Domain-driven modules
├── hooks/                # Custom React hooks
├── integrations/         # Supabase integratie
├── lib/                  # Utility functies
├── pages/                # Route entry points
├── services/             # Business logic services
└── types/                # TypeScript types

supabase/
├── functions/            # Edge functions
│   ├── delete-user/
│   ├── generate-competition-schedule/
│   ├── generate-monthly-polls/
│   ├── send-password-reset/
│   ├── send-welcome-email/
│   ├── sync-card-penalties/
│   ├── sync-match-costs/
│   └── update-season-data/
├── migrations/           # Database migrations
└── config.toml           # Supabase configuratie
```

---

## 🔒 Security & Auth Flow

```mermaid
sequenceDiagram
    participant U as User
    participant H as Header
    participant LM as LoginModal
    participant AS as AuthService
    participant SB as Supabase
    participant PR as ProtectedRoute
    
    U->>H: Click Login
    H->>LM: Open Modal
    U->>LM: Enter Credentials
    LM->>AS: Login Request
    AS->>SB: verify_user_password()
    SB-->>AS: User Data + Role
    AS->>AS: set_current_user_context()
    AS-->>LM: Success
    LM-->>H: Close Modal
    H-->>U: Show User Menu
    
    U->>PR: Navigate to /admin/*
    PR->>AS: Check Auth
    AS-->>PR: isAdmin: true/false
    alt Is Admin
        PR-->>U: Render Admin Page
    else Not Admin
        PR-->>U: Redirect to Home
    end
```

---

## 📱 Responsive Design

De applicatie is mobile-first ontworpen met de volgende breakpoints:

| Breakpoint | Pixels | Gebruik |
|------------|--------|---------|
| `sm` | 640px | Kleine tablets |
| `md` | 768px | Tablets |
| `lg` | 1024px | Kleine laptops |
| `xl` | 1280px | Desktops |
| `2xl` | 1536px | Grote schermen |

### Mobile Specifieke Componenten

- `HamburgerIcon` - Mobile menu trigger
- `Sheet` - Slide-in navigatie
- `ResponsiveTable` - Scroll/card view switch
- `AdminQuickSheet` - Admin snelmenu

---

## 🎯 Key Patterns

### 1. Modal Pattern
```typescript
// Gebruik via context
const { openModal, closeModal } = useModal();
openModal(<PlayerModal player={player} onClose={closeModal} />);
```

### 2. Protected Route Pattern
```typescript
<ProtectedRoute requireAdmin>
  <AdminPage />
</ProtectedRoute>
```

### 3. Data Fetching Pattern
```typescript
// React Query met Supabase
const { data, isLoading, error } = useQuery({
  queryKey: ['players', teamId],
  queryFn: () => playerService.getByTeam(teamId)
});
```

### 4. Form Pattern
```typescript
// React Hook Form met Zod
const form = useForm<FormSchema>({
  resolver: zodResolver(formSchema),
  defaultValues: { ... }
});
```

---

## 📚 Gerelateerde Documentatie

- [README.md](./README.md) - Index van alle documentatie
- [ROUTING.md](./ROUTING.md) - Routing strategie
- [MODAL_SYSTEM_GUIDELINES.md](./MODAL_SYSTEM_GUIDELINES.md) - Modal richtlijnen
- [DESIGN_TOKENS.md](./DESIGN_TOKENS.md) - Design systeem
- [SUPABASE_GRANTS_CONVENTION.md](./SUPABASE_GRANTS_CONVENTION.md) - Database grants conventie
- [EMAIL_DNS_SETUP.md](./EMAIL_DNS_SETUP.md) - E-mail DNS setup
