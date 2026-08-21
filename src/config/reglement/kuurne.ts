import { applyReglementOverrides } from "./types";
import { HARELBEKE_REGLEMENT } from "./harelbeke";

/**
 * Kuurne-reglement: dezelfde structuur als Harelbeke, met eigen artikels
 * waar de competitie afwijkt. Niet-vermelde artikels blijven gelijk.
 */
export const KUURNE_REGLEMENT = applyReglementOverrides(HARELBEKE_REGLEMENT, {
  metaDescription:
    "Volledig reglement en spelregels van Minivoetbal Vereniging Kuurne: inschrijving, wedstrijdregels, schorsingen en financiële bepalingen.",
  articles: {
    "1.1":
      "Minivoetbal Vereniging Kuurne zet zich in om de passie voor minivoetbal te delen en te bevorderen binnen een sportieve en competitieve omgeving. Plezier, respect en fairplay staan hierbij altijd centraal.",
    "1.2":
      "Het bestuur is verantwoordelijk voor de organisatie van de competitie en de naleving van dit reglement.",
    "2.1.5":
      "Het bestuur en de scheidsrechters hebben het recht om personen die zich niet aan deze gedragsregels houden, te verwijderen van het sportpark.",
    "8.5":
      "Het reglement van Sportpark Kuurne wordt overgenomen. Laatste wedstrijdploegen plaatsen doelen terug in de berging.",
  },
});
