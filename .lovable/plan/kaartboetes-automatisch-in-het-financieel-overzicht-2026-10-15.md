# Kaartboetes automatisch in het financieel overzicht

## Oorzaak (bevestigd in de logs)
Sinds er meerdere organisaties zijn, mislukt het automatisch boeken van kaartboetes bij elke opgeslagen wedstrijd. De boete wordt aangemaakt zonder organisatie, en dat weigert de database ("organization_id mag niet leeg zijn"). Daardoor is er sinds 11 mei 2026 geen enkele gele/rode kaart meer als boete geboekt. Bovendien kiest de functie de boeteprijs van alle organisaties door elkaar (bv. Kuurne kon de Harelbeke-prijs van 5 euro krijgen i.p.v. 2,50 euro).

## Oplossing (klein, niets visueel)
Eén bestand aanpassen: de functie die kaartboetes boekt.
1. De organisatie van de wedstrijd ophalen.
2. Alleen de boeteprijzen van die organisatie gebruiken.
3. Bij elke nieuwe boete de organisatie (en het seizoen van de wedstrijd) meegeven.

Daarna boekt elke wijziging aan kaarten op een wedstrijdformulier (toevoegen of verwijderen) meteen de juiste boete.

## Verleden rechtzetten
Eenmalig voor alle ingediende wedstrijden van het huidige seizoen (beide organisaties) de ontbrekende kaartboetes toevoegen op basis van de kaarten die op het formulier staan, met de juiste prijs en de datum van de wedstrijd. Geen bestaande handmatige boetes worden aangeraakt. Vooraf toon ik de lijst (wedstrijd, ploeg, aantal kaarten, bedrag) ter controle.

## Technische details
- `supabase/functions/sync-card-penalties/index.ts`: `matches` select `organization_id, season_label` voor `matchId`; `costs` queries `.eq('organization_id', orgId)`; insert-rijen krijgen `organization_id` + `season_label`; existing/cleanup-queries ook gescoped op org.
- Backfill via SQL insert in `team_costs` (`is_auto_card_penalty = true`) voor matches met `is_submitted` en kaarten in `home_players`/`away_players` (`yellow`=1x Gele kaart, `double_yellow`=2x Gele kaart, `red`=1x Rode kaart), enkel waar het aantal bestaande auto-boetes lager is dan gewenst.
- Verifiëren: edge-function logs zonder fout na opslaan; team-balans van match 2445 (De Florre/Truuk City, 3 gele kaarten) toont +3 boetes.
