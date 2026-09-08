# Supabase Data API Grants — Conventie

**Context:** vanaf **30 oktober 2026** verleent Supabase op bestaande projecten geen automatische rechten meer aan `anon` / `authenticated` / `service_role` voor *nieuwe* tabellen in het `public` schema. Zonder expliciete `GRANT` geeft PostgREST een `42501`-fout.

Bestaande tabellen behouden hun huidige grants — die hoeven we niet aan te raken.

---

## Regel

**Iedere nieuwe `CREATE TABLE public.<naam>` migration moet expliciete grants + RLS bevatten.**

## Sjabloon (copy-paste)

```sql
-- 1. Tabel
CREATE TABLE public.<naam> (
  id          BIGSERIAL PRIMARY KEY,
  -- ... kolommen ...
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Data API grants (verplicht vanaf okt 2026)
GRANT SELECT                         ON public.<naam> TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<naam> TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.<naam> TO service_role;

-- 3. RLS aan
ALTER TABLE public.<naam> ENABLE ROW LEVEL SECURITY;

-- 4. Policies — minstens één per gebruikte command (SELECT/INSERT/UPDATE/DELETE)
CREATE POLICY "Public can read <naam>"
  ON public.<naam> FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage <naam>"
  ON public.<naam> FOR ALL
  USING (get_current_user_role() = 'admin')
  WITH CHECK (get_current_user_role() = 'admin');
```

## Belangrijke nuances

- **Geef `anon` enkel `SELECT`** — nooit insert/update/delete. Voor schrijfacties die niet-ingelogd moeten kunnen, gebruik een `SECURITY DEFINER` RPC.
- **Gevoelige tabellen** (zoals `password_reset_tokens`): laat `anon` en `authenticated` weg, geef enkel `service_role`. Combineer met een policy die enkel service_role toelaat.
- **Grants ≠ beveiliging.** Grants openen enkel het deurtje naar de Data API. RLS bepaalt welke rijen iemand effectief mag zien/wijzigen. Beide zijn verplicht.
- **Views:** `GRANT SELECT ON public.<view> TO anon, authenticated;` en gebruik `WITH (security_invoker=on)` zodat RLS van de onderliggende tabellen blijft gelden.

## Wat NIET doen

- ❌ `GRANT ... ON ALL TABLES IN SCHEMA public TO ...` — geeft per ongeluk te ruime rechten op gevoelige tabellen.
- ❌ `ALTER DEFAULT PRIVILEGES` als "fix once and forget" — botst mogelijk met Supabase's eigen toekomstige defaults.
- ❌ Massa-migration draaien op alle bestaande tabellen — niet nodig (grants blijven behouden) en risico op afwijking met productiestate.

## Snelle checklist bij nieuwe tabel

- [ ] `CREATE TABLE public.<x>`
- [ ] 3 × `GRANT` (anon read-only, authenticated CRUD, service_role CRUD) — pas aan voor gevoelige tabellen
- [ ] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- [ ] Eén of meerdere `CREATE POLICY` statements
- [ ] Frontend gebruikt `supabase.from('<x>')` zonder fout in dev
