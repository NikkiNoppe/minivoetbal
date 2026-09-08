# Documentatie

Levende referentie voor Harelbeekse Minivoetbal (en het multi-tenant platform).  
Niets in deze boom is weggegooid: oude handleidingen (md/pdf) staan naast de Word-versies.

## Architectuur & code

| Document | Beschrijving |
|----------|--------------|
| [architectuur/ARCHITECTURE_MAP.md](./architectuur/ARCHITECTURE_MAP.md) | Pagina's, modals, services, edge functions en database |
| [architectuur/ROUTING.md](./architectuur/ROUTING.md) | URL-structuur en route-bescherming |
| [architectuur/AUTH_ROADMAP.md](./architectuur/AUTH_ROADMAP.md) | Auth-besluit: custom sessies, geen Supabase Auth-migratie |
| [architectuur/MODAL_SYSTEM_GUIDELINES.md](./architectuur/MODAL_SYSTEM_GUIDELINES.md) | Modal-systeem (`AppModal` / `ModalContext`) |
| [architectuur/DESIGN_TOKENS.md](./architectuur/DESIGN_TOKENS.md) | Kleuren, spacing en typografie tokens |

Zie ook `design-system/MASTER.md` (Cursor UI-workflow) en `src/domains/README.md` (domein-facades).

## Infra

| Document | Beschrijving |
|----------|--------------|
| [infra/SUPABASE_GRANTS_CONVENTION.md](./infra/SUPABASE_GRANTS_CONVENTION.md) | GRANT + RLS in nieuwe migraties |
| [infra/EMAIL_DNS_SETUP.md](./infra/EMAIL_DNS_SETUP.md) | DNS / ImprovMX / Resend voor `info@harelbekeminivoetbal.be` |

## Handleidingen (gebruikers)

Bronnen: Markdown + PDF + Word. Screenshots in `handleidingen/assets/`.

| Document | Beschrijving |
|----------|--------------|
| [handleidingen/HANDLEIDING_TEAMMANAGER.md](./handleidingen/HANDLEIDING_TEAMMANAGER.md) | Teamverantwoordelijke: wachtwoord, inloggen, spelers |
| [handleidingen/HANDLEIDING_TEAMVERANTWOORDELIJKE.docx](./handleidingen/HANDLEIDING_TEAMVERANTWOORDELIJKE.docx) | Zelfde gids als Word |
| [handleidingen/HANDLEIDING_TEAMMANAGER_WEDSTRIJD.md](./handleidingen/HANDLEIDING_TEAMMANAGER_WEDSTRIJD.md) | Wedstrijdformulier (teamverantwoordelijke) |
| [handleidingen/HANDLEIDING_SCHEIDSRECHTER.md](./handleidingen/HANDLEIDING_SCHEIDSRECHTER.md) | Wedstrijdformulier (scheidsrechter) |

## Audits

| Document | Beschrijving |
|----------|--------------|
| [audits/MOBILE_UI_AUDIT.docx](./audits/MOBILE_UI_AUDIT.docx) | Mobiele screenshots + route-overzicht |
| [audits/mobile-ui-audit/](./audits/mobile-ui-audit/) | PNG's + `build_audit_docx.py` om de Word-file te herbouwen |

## Bronbestanden (niet voor de website)

| Map | Inhoud |
|-----|--------|
| [bronnen/harelbeke-logo/](./bronnen/harelbeke-logo/) | Illustrator-bron (`Logo.ai`) en export-slices. Productielogo's staan in `public/images/logos/`. |

---

## Repo-kaart (mappen)

Applicatiecode is **niet** verplaatst: imports en `src/domains/`-facades blijven zoals ze zijn.

| Map | Rol |
|-----|-----|
| `src/` | React-app: `pages/` = route-shells, `components/pages/` = schermen, `services/` + `hooks/` = data, `domains/` = barrel re-exports |
| `public/` | Statische site-assets. `images/logos` + `images/icons` = productie; `images/AppIcons` = bron voor PWA/native iconen |
| `supabase/` | `migrations/` (niet herordenen) + `functions/` |
| `scripts/` | npm-scripts in de root van deze map; eenmalige Kuurne-helpers in `scripts/kuurne/` |
| `design-system/` | UI-tokens voor Cursor-skills |
| `archief/` | Lokale seizoens-JSON (gitignored, alleen `.gitkeep`) |
| `.cursor/` | Rules, skills, hooks voor agents |
| `DOCUMENTATIE/` | Deze map |

Eenmalige audit- en migratierapporten horen hier niet tenzij ze nog als referentie dienen.
