# Auth — definitief architectuurbesluit

> **Cursor rule:** [`.cursor/rules/custom-auth-architectuur.mdc`](../.cursor/rules/custom-auth-architectuur.mdc) (always apply)

## Besluit

**Custom session auth blijft het permanente productiemodel.** Geen geplande migratie naar Supabase Auth.

| Onderdeel | Status |
|-----------|--------|
| `user_sessions` + `p_session_token` | Productie |
| Session-RPC's + `private.resolve_app_session` | Productie |
| Supabase Auth JWT + RLS-first | **Niet gepland** |
| Pilot `VITE_USE_SUPABASE_AUTH` | **Niet in productie; niet uitbreiden** |

Dit besluit voorkomt een tweede grote auth-refactor. Supabase Auth is alleen opnieuw te overwegen bij een **expliciet productbesluit** (MFA, SSO, dashboard user management) — dan als **één volledig migratieproject**, niet via het huidige bridge-model.

---

## Productie-architectuur

- **Login:** `login_user` / `login_super_admin` → rij in `user_sessions` (24u)
- **Client:** `localStorage.auth_data` + `getRpcSessionArgs()` / `getEdgeFunctionHeaders()`
- **Server:** ~59 session-RPC's; autorisatie via `private.resolve_app_session(p_session_token)`
- **Edge:** `x-session-token` → `validate_session`; DB via `service_role`
- **RLS:** defense-in-depth (`get_current_user_role()`); primair pad = session-RPC's
- **Publiek:** `get_public_matches` / `get_public_teams` — geen sessie

### Verplichte tabellen (niet droppen)

| Tabel | Functie |
|-------|---------|
| `user_sessions` | Sessietokens |
| `password_reset_tokens` | Wachtwoord reset + welkomstmail |
| `auth_rate_limits` | Rate limiting login / reset-mail |

Cleanup: `private.cleanup_expired_auth_rows()` — pg_cron job `cleanup-expired-auth-rows` (03:00 UTC).

---

## Wat agents / developers wél doen

- Nieuwe ingelogde reads/writes → session-RPC + `*SessionFetch.ts`
- Nieuwe client-facing DEFINER RPC → invoker wrapper (lint 0028)
- Na auth-wijziging → `npm run test:security` (44/44)

Zie ook: `session-rpc-beveiliging.mdc`, `supabase-client.mdc`.

---

## Wat niet doen

- Supabase Auth pilot in productie zetten of verder uitbouwen
- `user_sessions` / reset / rate-limit tabellen droppen
- Nieuwe `withUserContext` of direct `.from()` op gevoelige tabellen
- Primair overschakelen naar `auth.uid()` / JWT zonder volledig migratieplan

---

## Historisch: pilot (experimenteel, bevroren)

Code bestaat maar **mag niet actief worden gebruikt**:

- `users.auth_uid`, `establish_app_session_from_supabase_auth`, `src/lib/supabaseAuthBridge.ts`
- `VITE_USE_SUPABASE_AUTH=true` alleen voor lokaal experiment

Flow (niet productie): JWT login → bridge RPC → legacy `user_sessions` token. Dit is **geen eindroute** — alleen een oude migratie-idea die bewust is stopgezet.

---

## Herzieningscriteria (toekomst)

Heropen auth-besluit alleen bij minstens één van:

- Verplichte **MFA**
- **SSO** (OAuth/SAML)
- Schaal / self-service user management via Supabase Dashboard

Dan: volledige migratie naar JWT + RLS, geen permanent bridge-model.
