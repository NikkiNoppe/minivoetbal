# Cursor — Harelbeekse Minivoetbal

Overzicht van projectconfiguratie voor Cursor-agents.

## Rules (`.cursor/rules/`)

| Bestand | Scope | Beschrijving |
|---------|-------|--------------|
| `custom-auth-architectuur.mdc` | **altijd** | **Definitief auth-besluit** — custom session tokens, geen Supabase Auth-migratie |
| `supabase.mdc` | altijd | Ingang: verwijst naar alle Supabase-rules |
| `session-rpc-beveiliging.mdc` | migraties, services, hooks | **Geen `*_public` views** — session-RPC-model, deploy-checklist |
| `supabase-rls-sensitive-data.mdc` | migraties, services, publiek | RLS, gevoelige kolommen, security-tests |
| `supabase-schema.mdc` | `supabase/**` | Migraties, RLS, triggers, edge functions |
| `supabase-client.mdc` | `src/services`, hooks, domains | Session-RPC fetch-lagen, legacy `withUserContext` |
| `ui-mobile-first.mdc` | altijd | Mobiel als hoofdplatform, touch targets |
| `ui-frontend-workflow.mdc` | **altijd** | **Skills + uniforme pagina's bij elk UI-werk** |
| `ui-accessibility.mdc` | altijd | Focus, contrast, semantiek, reduced motion |
| `ui-logged-in-pages.mdc` | `src/components/pages/user/**`, login | Uniforme UI voor ingelogde pagina's in publieke layout |
| `data-snel-laden.mdc` | altijd | TanStack Query, skeletons, achtergrond-sync |
| `ui-design-system.mdc` | `src/**/*.tsx`, thema | Kleuren/branding per org (`application_settings`) |
| `ui-ux-principles.mdc` | `src/**/*.tsx` | Feedback, formulieren, leeg/fout-states |
| `ui-21st-dev.mdc` | `src/**/*.tsx` | UI-voorbeelden via 21st.dev |
| `project-footer-versie.mdc` | altijd | Footer buildversie `v1.YYMMDD` |
| `multi-tenant-visie.mdc` | **altijd** | Platformvisie, één codebase, stap-voor-stap migratie |
| `multi-tenant-database.mdc` | `supabase/**` | `organization_id`, RLS, migratie-backfill |
| `multi-tenant-frontend.mdc` | `src/**` | Actieve org-filter, config, query keys |

**Naamgeving:** `<domein>-<onderwerp>.mdc` — domeinen: `supabase`, `ui`, `data`, `project`, `multi-tenant`.

## Hooks (`.cursor/hooks/`)

| Script | Trigger | Doel |
|--------|---------|------|
| `update-footer-version.sh` | `sessionStart`, `beforeSubmitPrompt` (fallback) | Footer-versie bijwerken naar vandaag (1×/dag) |

Configuratie: `hooks.json`.

## Skills (`.cursor/skills/`)

Skills worden **niet** door Cursor automatisch ingeladen — de agent moet ze lezen wanneer de taak UI raakt. Dat wordt afgedwongen via `ui-frontend-workflow.mdc` (always-apply).

| Map | Wanneer lezen |
|-----|----------------|
| `ui-ux-pro-max/` | **Elk** UI-werk — design system, UX-checklist, `search.py --stack shadcn` |
| `21st-dev-reference/` | Nieuwe componenten, secties, redesigns — vóór from-scratch bouwen |

**Project design system:** `design-system/MASTER.md` — uniforme layout, cards, spacing, tokens.

### Skills activeren (voor developers)

1. **Rules** — `ui-frontend-workflow.mdc` staat op `alwaysApply: true`; elke agent-sessie krijgt de instructie om skills te lezen bij UI-werk.
2. **Beschrijvingen** — skills hebben brede `description` in YAML frontmatter zodat Cursor ze in de skill-picker toont bij frontend-prompts.
3. **Glob-rules** — `ui-design-system`, `ui-ux-principles`, `ui-21st-dev` triggeren extra wanneer `src/**/*.tsx` open is.
4. **Handmatig** — in een prompt: *"Lees ui-ux-pro-max en 21st-dev skills; volg design-system/MASTER.md"*.

## Gerelateerde npm-scripts

```bash
npm run update-types        # Types van remote Supabase-project
npm run update-types:local  # Types van lokale Supabase-stack
npm run test:security       # Na elke security-migratie (40 live checks)
```

Vereist: `npx supabase login` (eenmalig) voor `update-types`.

## Lovable security scanner — false positives

Dit project gebruikt **custom session-token auth** (anon key + `p_session_token` / `x-session-token`), geen Supabase Auth JWT-rollen. Na deploy + `npm run test:security` (40/40 groen) zijn de meeste Lovable Criticals **opgelost op productie**.

**Verwachte scanner-ruis (geen actie nodig):**

| Finding | Waarom veilig |
|---------|----------------|
| SECURITY DEFINER + `GRANT EXECUTE TO anon` (lint 0028/0029) | Opgelost via **public INVOKER wrappers** + `private.*_impl` DEFINER; `authenticated` EXECUTE revoked. Zie migraties `202606150*`. |
| `verify_jwt = false` op edge functions | JWT op anon key is triviaal; echte auth is `x-session-token` → `validate_session` in `_shared/auth.ts`. |
| `users.password` kolomnaam | Waarde is bcrypt (`crypt()`); kolom is `REVOKE` voor clients. |
| RLS met `get_current_user_role()` | Clients kunnen `set_config` niet meer aanroepen; context alleen via `login_user` / `restore_user_session`. |
| Oude migratiebestanden met `p_user_id integer` | Historische SQL; live DB gebruikt `p_session_token uuid` (zie `20260609110000`). |

**Verificatie:** `npm run test:security` — 44/44 groen na deploy; incl. edge functions zonder sessie → 401, `set_config` geblokkeerd, admin RPCs leeg zonder token, interne helpers (`resolve_session_role`, `check_email_rate_limit`) niet callable door anon.

## Supabase Database Linter (0028/0029)

**0028** = `public` functie met `SECURITY DEFINER` + `GRANT EXECUTE TO anon`. **0029** = idem voor `authenticated`.

| Fase | Migratie(s) | Effect |
|------|-------------|--------|
| A | `20260615000000_revoke_authenticated_rpc_execute.sql` | Alle 0029 warnings weg (app gebruikt alleen anon key) |
| B | `20260615001000_lock_down_internal_public_functions.sql` | Interne helpers niet meer via REST; legacy `verify_user_password*` / `get_match_statistics` weg |
| C | `20260615010000` + `20260615020000` + `20260615010500` | `private.create_public_invoker_wrapper` + batch: DEFINER body → `private.*`, dunne `public` INVOKER wrapper |
| C+ | `20260615011000_grant_anon_private_schema_usage.sql` | `GRANT USAGE ON SCHEMA private TO anon` (nodig voor INVOKER wrappers) |
| D | `20260615030000_suspension_session_rpcs.sql` | `is_player_suspended` / `check_batch_players_suspended` vereisen `p_session_token` |

Het `private` schema is **niet** exposed in PostgREST → DEFINER impls daar triggeren geen 0028. Na deploy: Security Advisor opnieuw scannen in Supabase Dashboard.

## Supabase Database Linter — RLS performance (0003 / 0006)

Migraties `20260616000000` t/m `20260616002000`:

| Lint | Fix |
|------|-----|
| **0003** auth_rls_initplan | `(SELECT current_setting(...))`, `(SELECT auth.role())`, `(SELECT get_current_user_role())` in RLS-expressies |
| **0006** multiple_permissive_policies | Redundante policies samengevoegd tot één policy per rol+actie (users, matches, players, teams, application_settings, …) |

RLS is defense-in-depth; de app gebruikt primair session-RPC's. `npm run test:security` blijft 44/44 groen na deploy.

| Lint | Migratie `20260616003000` |
|------|---------------------------|
| **0001** unindexed_foreign_keys | Index op `matches.home/away_team_id`, `team_costs.team_id/cost_setting_id` |
| **0005** unused_index | Verwijderd: duplicaten + `idx_referee_matches_poll` (kleine tabel, seq scan) + legacy `idx_team_costs_date`. Behouden FK/perf-indexen; `20260616005000` warmt idx_scan na deploy. |

| Lint | Migratie `20260616004000` |
|------|---------------------------|
| **Query advisor** (pg_stat) | Composiet-indexen: `matches(match_date)`, `(is_playoff_match, match_date)`, `(is_submitted, match_date)`, team+date; `team_costs(team_id, transaction_date)`; `players(last_name, first_name)` |

**Performance Advisor rescan:** na `20260616005000` opnieuw scannen; nieuwe indexen staan eerst op idx_scan=0 tot er queries draaien.

## Auth (definitief)

**Custom session auth blijft.** Geen Supabase Auth-migratie gepland.

| Document / rule | Inhoud |
|-----------------|--------|
| [`custom-auth-architectuur.mdc`](rules/custom-auth-architectuur.mdc) | Always-apply rule voor agents |
| [`DOCUMENTATIE/architectuur/AUTH_ROADMAP.md`](../DOCUMENTATIE/architectuur/AUTH_ROADMAP.md) | Menselijk leesbaar besluit + tabellen |

Pilot `VITE_USE_SUPABASE_AUTH` — **niet in productie; niet uitbreiden.**
