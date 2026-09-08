# Scripts

| Bestand | Doel | Aanroep |
|---------|------|---------|
| `generate-seo-static.mjs` | Statische SEO-pagina's | `npm run generate:seo` |
| `test-matches-security.sh` | Security-checks na deploy | `npm run test:security` |
| `mcp-deploy-all.mjs` | Edge functions deployen (MCP) | `node scripts/mcp-deploy-all.mjs` |
| `mcp-deploy-args.mjs` | Deploy-args voor één function | `node scripts/mcp-deploy-args.mjs <naam>` |
| `vite-plugin-season-archive.ts` | Dev-plugin: seizoens-JSON naar `archief/` | via `vite.config.ts` |

## Kuurne (eenmalig)

| Bestand | Doel |
|---------|------|
| [kuurne/generate-kuurne-schedule.py](./kuurne/generate-kuurne-schedule.py) | Speelschema uit Excel-kalender |
| [kuurne/import-kuurne-timeslots-from-excel.py](./kuurne/import-kuurne-timeslots-from-excel.py) | Timeslots/vakanties uit dezelfde Excel |
