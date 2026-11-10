# Flikkeren bij opstarten verminderen

## Doel
De website start rustig op: geen wisselende achtergrondkleur, geen "lege grijze blokken" die verspringen naar de echte pagina, geen verspringende inhoud.

## Vermoedelijke oorzaken (eerst meten)
1. De startpagina wordt apart ingeladen: eerst verschijnt een grijze laad-placeholder, daarna pas de echte pagina.
2. De achtergrondkleur start met een standaardkleur en wordt pas aangepast zodra de clubkleuren uit de database binnen zijn.
3. Logo, nieuws en wedstrijden laden na elkaar in, waardoor de pagina meerdere keren verspringt.

Stap 1 is dit bevestigen door een opname van het opstarten te maken (schermafbeeldingen per fractie van een seconde) en te kijken welke wissels zichtbaar zijn.

## Aanpak
- Startpagina direct meeleveren i.p.v. apart inladen, zodat de grijze placeholder wegvalt.
- Clubkleuren en achtergrond van de vorige bezoek onthouden en meteen toepassen, zodat de kleur niet meer wisselt.
- Eén rustige laadweergave in dezelfde vorm als de echte pagina, met vaste hoogtes voor logo en kaarten zodat niets verspringt.
- Zachte overgang (fade-in) wanneer de inhoud verschijnt, in plaats van een harde wissel.

Visueel verandert verder niets aan de pagina's zelf.

## Technische details
- `src/App.tsx`: `Index` eager importeren; overige routes lazy laten.
- `src/lib/bootTheme.ts`: laatst geladen thema-CSS-variabelen in localStorage cachen per org en vóór mount toepassen; `index.html` body-achtergrond laten volgen.
- `RoutePageSkeleton`/AlgemeenPage: vaste afmetingen voor logo (width/height) en kaartcontainers; korte opacity-transitie.
- Controleren dat auth-wacht (`authContextReady`) geen volledige leeg-render veroorzaakt.
- Verificatie met Playwright: screenshots op 0/200/500/1000 ms vóór en na.
