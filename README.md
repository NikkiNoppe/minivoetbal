# Minivoetbal

Webapp voor minivoetbalcompetities (Harelbeke + Kuurne) op één codebase.

**Documentatie:** [DOCUMENTATIE/README.md](./DOCUMENTATIE/README.md)

| Map | Wat |
|-----|-----|
| `src/` | React-app |
| `public/` | Statische assets (logo's, iconen, documenten) |
| `supabase/` | Migraties en edge functions |
| `scripts/` | Build-, deploy- en security-helpers; Kuurne-eenmalig in `scripts/kuurne/` |
| `DOCUMENTATIE/` | Architectuur, infra, handleidingen, audits, bronbestanden |
| `design-system/` | UI-richtlijnen voor agents |
| `archief/` | Lokale seizoensback-ups (niet in git) |

Lockfiles en tool-config (`vite`, `tsconfig`, `eslint`, …) blijven in de root — Vite verwacht dat. In de Cursor-sidebar staan ze genest onder `package.json`.
