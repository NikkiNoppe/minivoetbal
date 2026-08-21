import type { ReglementBlock, ReglementCopy, ReglementSection } from "./types";

const heading = (text: string): ReglementBlock => ({ type: "heading", text });
const para = (text: string): ReglementBlock => ({ type: "paragraph", text });
const art = (number: number, text: string): ReglementBlock => ({
  type: "article",
  number: String(number),
  text,
});

function section(id: string, title: string, blocks: ReglementBlock[]): ReglementSection {
  return { id, title, blocks };
}

/**
 * Officieel algemeen reglement MVV Kuurne (versie 07.01.2025).
 * Eigen structuur (Art. 1–186) — niet afgeleid van Harelbeke.
 */
export const KUURNE_REGLEMENT: ReglementCopy = {
  pageTitle: "Algemeen reglement",
  metaDescription:
    "Algemeen reglement van Minivoetbal Vereniging Kuurne (versie 07.01.2025): organisatie, spelregels, beker, sancties en inschrijving.",
  versionLabel: "Versie 07.01.2025",
  playerHighlights: {
    maxPlayers: "Elk team mag maximaal 20 spelers hebben per seizoen, coach inbegrepen.",
    transfers: "Overgangen tijdens de lopende competitie en bekerwedstrijden zijn verboden.",
    inscription:
      "Nieuwe spelers aansluiten mag tot 31 december; ze zijn speelgerechtigd vanaf 1 januari.",
  },
  sections: [
    section("1", "I. Organisatie, doel en geest", [
      para(
        "De Minivoetbal Vereniging Kuurne (afgekort MVV Kuurne) is opgericht in 1981 met als doel de sportbeleving te bevorderen onder vorm van minivoetbal in een competitiecontext.",
      ),
      para(
        "Fairplay moet altijd op de eerste plaats staan zodat de competitie een gezonde sociale, culturele en sportieve vrijetijdsbesteding kan worden. De inrichters zullen nauw toezien op deze fairplay.",
      ),
      heading("Algemene vergaderingen"),
      para(
        "Het bestuur van MVV Kuurne houdt op afroep een algemene vergadering met de verantwoordelijken van elke ploeg. Iedere deelnemer zal tijdig verwittigd worden. Een afvaardiging van elke ploeg dient verplicht aanwezig te zijn.",
      ),
      heading("Bestuur — samenstelling"),
      para(
        "Het bestuur bestaat uit de voorzitter, de ondervoorzitter, de secretaris en de scheidsrechtersverantwoordelijke.",
      ),
      para(
        "Elk bestuurslid kan ontslagen worden na beraadslaging en uitspraak door meerderheid van stemmen. Bij gelijkheid van stemmen is de stem van de voorzitter doorslaggevend.",
      ),
      para(
        "De kerntaak van het bestuur bestaat erin de minivoetbalcompetitie en een eventuele bekercompetitie te organiseren volgens het algemeen reglement.",
      ),
      para("De frequentie van de werkvergaderingen wordt door het bestuur bepaald."),
      heading("Sportcomité — samenstelling"),
      para(
        "Het sportcomité buigt zich over disciplinaire zaken en diverse betwistingen met betrekking tot de (beker)competitie en de deelnemende ploegen.",
      ),
      para(
        "Het sportcomité bestaat uit minstens drie leden van het bestuur en de scheidsrechter die de leiding had in de wedstrijd waarin het incident — waarover het sportcomité de strafmaat moet uitspreken — zich voordeed.",
      ),
    ]),

    section("2", "II. Algemeen technisch reglement", [
      heading("De bal"),
      art(1, "Er wordt gespeeld met een bal, gecatalogeerd als minivoetbal."),
      art(
        2,
        "Bij iedere wedstrijd wordt de bal van de thuisploeg gebruikt. Wanneer deze niet aan de eisen voldoet, wordt de bal van de tegenstrever gebruikt of deze die voorhanden is in de sporthal.\nDe thuisploeg wordt in dit geval beboet volgens de boetelijst gepubliceerd op de website.",
      ),
      heading("De spelers"),
      art(
        3,
        "Minivoetbal wordt gespeeld met vijf spelers per ploeg. Er mogen zich maximum drie reservespelers plus één coach op de bank bevinden.",
      ),
      art(
        4,
        "Van zodra het aantal spelers bij één van de ploegen minder dan vier bedraagt, wordt de wedstrijd geschorst en de forfaitscore uitgesproken in het voordeel van de tegenstander, als deze wel uit minstens 4 spelers bestaat.",
      ),
      heading("De vervangingen"),
      art(5, "De spelers mogen voortdurend vervangen worden."),
      art(6, "Bij elke vervanging moet de scheidsrechter vooraf verwittigd worden."),
      art(7, "De vervanging gebeurt bij de middellijn."),
      art(
        8,
        "Eerst verlaat de te vervangen speler het terrein, pas daarna mag de wisselspeler aantreden.",
      ),
      art(
        9,
        "Een vervanging mag slechts gebeuren als de bal buiten de lijnen is en het spel stil ligt.",
      ),
      art(
        10,
        "Een vervanging moet gebeuren binnen de vijf seconden. Bij talmen kan de scheidsrechter de vervanging weigeren, een onrechtstreekse vrijschop toekennen in het voordeel van de tegenstrever of een gele kaart geven aan de verlatende of opkomende speler of aan beiden.",
      ),
      art(
        11,
        "Een foutieve vervanging kan in sommige gevallen aanleiding geven tot stopzetting van de wedstrijd (forfait).",
      ),
      art(
        12,
        "In geval van strafcorner mag een speler van de bank komen om te koppen, daarna moet hij terug naar de bank. Hij mag enkel koppen, niet scheppen.",
      ),
      heading("De uitrusting"),
      art(
        13,
        "Alle spelers van een ploeg dragen een identieke uitrusting. Een trainingsbroek onder de uitrusting is toegelaten.\n\nDe voorkeur gaat uit naar truitjes met een goed zichtbaar rugnummer.\n\nDe kapitein van een ploeg draagt een armband aan de linker bovenarm. Indien deze ontbreekt wordt de ploeg beboet volgens de boetelijst gepubliceerd op de website.",
      ),
      art(
        14,
        "Er worden enkel sportschoenen toegelaten met een effen zool (cfr. gemeentereglement sporthal).",
      ),
      art(
        15,
        "Bij uitrusting die moeilijk van elkaar te onderscheiden valt moet de thuisploeg van truitje veranderen, op eigen initiatief of op vraag van de scheidsrechter. Of kunnen de hesjes gebruikt worden die aanwezig zijn in het scheidsrechterslokaal. Het gebruik ervan dient aangevraagd te worden aan de scheidsrechter. De ploeg in kwestie zal beboet worden volgens de boetelijst gepubliceerd op de website.",
      ),
      art(
        16,
        "Het dragen van voorwerpen die letsels kunnen veroorzaken aan de tegenstander, is verboden. Bij inbreuk wordt de desbetreffende speler weggestuurd. Na verwijdering van bedoelde voorwerpen mag de speler opnieuw deelnemen aan de wedstrijd.",
      ),
      heading("Het terrein"),
      art(
        17,
        "Schade of gebreken aan het terrein (bvb. water op de sportvloer) worden voor de wedstrijd gemeld aan de verantwoordelijke van de sporthal, door eender welke speler of coach van een ploeg. De scheidsrechter beslist samen met de zaalverantwoordelijke of de wedstrijd kan doorgaan.",
      ),
      art(
        18,
        "Schade aan het scorebord wordt gemeld aan de scheidsrechter, die alles noteert op het wedstrijdblad.",
      ),
      heading("De wedstrijdduur"),
      art(
        19,
        "Een competitiewedstrijd en een bekerwedstrijd in de poulefase verloopt over vier periodes van 13 minuten. De knock-outfase van de beker verloopt over vier periodes van 11 minuten.",
      ),
      art(20, "Na de eerste en derde periode: 1 minuut rust."),
      art(21, "Na de tweede periode: 2 minuten rust + kampwissel."),
      art(22, "De scheidsrechter kan verloren tijd laten inhalen."),
      art(
        23,
        "De scheidsrechter beslist tot forfait wanneer er acht minuten na het officiële aanvangsuur van de wedstrijd onvoldoende spelers (minimum vier) van een ploeg op het terrein aanwezig zijn.",
      ),
      heading("De klassering"),
      art(
        24,
        "De klassering in de competitiewedstrijden en de poulewedstrijden voor de beker wordt als volgt bepaald:\n\nWedstrijd gewonnen = 2 punten voor de winnaar\nGelijkspel = 1 punt voor beide ploegen\nVerloren wedstrijd = 0 punten voor de verliezer\n\nIn de competitie tellen bij gelijke punten eerst het aantal gewonnen wedstrijden en indien dit nog geen uitsluitsel brengt vervolgens het doelpuntensaldo en tot slot het totaal aantal gemaakte doelpunten in alle competitiewedstrijden.\n\nIndien bovengestelde criteria voor het bepalen van de kampioen of degradant(en) in de competitie nog geen uitsluitsel brengen, dan zal een testmatch georganiseerd worden.\n\nIn de poulefase van de beker tellen bij gelijke punten de onderlinge duels in de poule en vervolgens, indien dit nog geen uitsluitsel brengt, het doelpuntensaldo van alle poulewedstrijden en tot slot het totaal aantal gemaakte doelpunten van alle poulewedstrijden.\n\nIndien bovengestelde criteria in het uitzonderlijke geval nog steeds geen uitsluitsel brengen, zal lottrekking georganiseerd worden.",
      ),
      art(
        25,
        "Tot de knockoutfase van de beker treden alle winnaars van elke poule toe, aangevuld met het benodigd aantal ‘beste tweedes’ om tot acht deelnemers aan de kwartfinales te komen.\n\nDe ‘beste tweedes’ hebben over alle poules heen de meeste punten, vervolgens het meeste aantal gewonnen wedstrijden en indien dit nog geen uitsluitsel brengt het beste doelpuntensaldo en tenslotte het hoogste aantal gemaakte doelpunten.\n\nIndien bovengestelde criteria in het uitzonderlijke geval nog steeds geen uitsluitsel brengen, zal lottrekking georganiseerd worden. Ook de onderlinge ranking van de ‘beste tweedes’ zal bij ex-aequo door lottrekking bepaald worden, cfr. toewijs van de volgende wedstrijden beschreven in art. 26.\n\nHet spelschema van de acht deelnemers in de knockoutfase van de beker ligt vast zoals in art. 26 toegelicht.",
      ),
      art(
        26,
        "Alle ploegen actief in de Kuurnse Minivoetbalvereniging worden middels lottrekking toegewezen aan bekerpoules.\n\nDe winnaars en ‘beste tweedes’ gaan verder in volgend knockoutschema:\n- match 1: winnaar poule 1 – eerste ‘beste tweede’\n- match 2: winnaar poule 2 – tweede ‘beste tweede’\n- match 3: winnaar poule 3 – derde ‘beste tweede’ of winnaar poule 6 (in geval er 6 poules ingericht worden)\n- match 4: winnaar poule 4 – winnaar poule 5\n\nDe halve finales gaan als volgt verder:\n- winnaar match 1 – winnaar match 2\n- winnaar match 3 – winnaar match 4\n\nDe winnaars van deze wedstrijden spelen de finale.",
      ),
      art(
        27,
        "Op het einde van de competitie zal de ploeg geëindigd op de laatste plaats in de eerste reeks, dalen naar de tweede reeks.\n\nDe ploeg die eerste is geëindigd in de tweede reeks zal stijgen naar de eerste reeks.\n\nHiervan kan slechts in uitzonderlijke gevallen afgeweken worden en na beslissing door het bestuur en in samenspraak met de betrokken ploeg(en), in eerste instantie de ploeg die de volgende plaats in de eindafrekening bezet.",
      ),
      art(
        28,
        "Ingeval een ploeg in de loop van de competitie in de eerste reeks stopt of uit competitie wordt gezet in de loop van de heenronde, dan kan een vervangende ploeg in de eerste reeks de plaats innemen.\n\nAlle wedstrijden van de stoppende ploeg worden dan op forfaitoverwinningen gezet voor de tegenstanders, voor de volledige heenronde.\n\nDe behaalde punten in de matchen tegen die vervangende ploeg in de terugronde tellen mee in de eindklassering.\n\nDe vervangende ploeg zal evenwel einde seizoen naar tweede reeks zakken.\n\nIngeval meerdere ploegen in de loop van de competitie in de eerste reeks stoppen of uit competitie worden gezet, zonder dat ze (allen) vervangen kunnen worden, dan kunnen meerdere ploegen uit de tweede reeks promoveren na beslissing van het bestuur en in samenspraak met betrokken ploeg(en) en eventuele nieuwe ploegen.\n\nIngeval een ploeg heel vroeg in de heenronde stopt of uit competitie wordt gezet, reeds na enkele matchen, dan kan het bestuur oordelen deze enkele matchen in te halen met een nieuwe vervangende ploeg, waardoor de competitie een normaal verloop kent en alle punten uit de gespeelde en ingehaalde wedstrijden meetellen voor de eindklassering. Indien de ploeg vroeg stopt in de terugronde, kan hiertoe ook eventueel beslist worden en gelden bovenvermelde principes.\n\nIngeval een ploeg in de loop van de competitie in de tweede reeks stopt of uit competitie wordt gezet, dan kan een vervangende ploeg in de tweede reeks de plaats innemen en gelden dezelfde principes als hierboven beschreven. De nieuwe vervangende ploeg kan evenwel niet naar de eerste reeks promoveren.",
      ),
      art(
        29,
        "Ingeval een ploeg in de loop van de poulefase uit de bekercompetitie stopt of uit die bekercompetitie wordt gezet, dan worden de wedstrijden geannuleerd en op de website op forfaitoverwinningen gezet voor de tegenstanders, maar gelden die punten niet in de eindstand van de poule. Mits de stoppende ploeg wel een volledige ronde afwerkte en dus éénmaal speelde tegen alle tegenstanders van de poule, dan worden die uitslagen wel behouden en gelden die punten wel in de eindstand.\n\nMogelijk dient zich een vervangende ploeg aan, die in de poulefase de plaats van de stoppende ploeg kan innemen, na beslissing van het bestuur van de KMVV. In geval die vervangende ploeg nog een volledige ronde kan afwerken en dus éénmaal kan spelen tegen alle tegenstanders van de poule, dan worden die uitslagen behouden en gelden die punten wel in de eindstand van de poule.\n\nIn de eindafrekening tellen dus de punten mee behaald tegen de stoppende ploeg en de punten behaald tegen de vervangende ploeg, op voorwaarde dat de stoppende en/of de vervangende ploegen een volledige ronde afwerkten, wat betekent dat ze éénmaal speelden tegen alle pouletegenstanders. De andere wedstrijden, geen volledige ronde dus, worden geannuleerd en komen op de website als forfaitoverwinningen voor de tegenstander, maar die punten tellen niet mee in de eindstand van de poule.\n\nDe poulewinnaar gaat in voorgemelde gevallen wel altijd door naar de knockoutfase, maar voor de beste tweede dient een herrekening te gebeuren, omdat die ploeg niet evenveel wedstrijden kon afwerken als de beste tweedes van de andere poules.\nDe herrekening gebeurt door de behaalde punten te delen door het aantal geldige wedstrijden en te vermenigvuldigen door het aantal wedstrijden dat had moeten gespeeld worden, cfr. de andere poules dus.\n\nHet bekomen puntenaantal wordt afgerond naar boven indien meer of gelijk aan 0,5 punten na de komma of naar beneden indien minder dan 0,5 punten na de komma.\nHetzelfde geldt voor de volgende criteria (gewonnen wedstrijden, doelpuntensaldo, gemaakte doelpunten) indien het puntenaantal geen onderscheid over de beste tweedes brengt.",
      ),
      art(
        30,
        "Er wordt een reeks van schepcorners genomen ingeval er na de normale wedstrijdduur een gelijke score is bij:\n- testwedstrijden voor bepaling kampioen in eerste en tweede reeks, of bepaling van de daler uit eerste reeks\n- bekerwedstrijden in de knockoutfase\n\nDe reeks strafcorners verloopt als volgt:\n- de scheidsrechter organiseert een toss en de winnaar van de toss mag starten\n- elke ploeg geeft vier spelers op die aan de strafcorners zullen deelnemen\n\nDe ploeg die de toss wint begint met speler A en B:\nA trapt — B kopt\nB trapt — A kopt\n\nVervolgens A & B van de andere ploeg.\n\nDan zet de ploeg die startte verder met speler C en D:\nC trapt en D kopt\nD trapt en C kopt\n\nVervolgens C & D van de andere ploeg.\n\nBij gelijke stand na vier strafcorners wordt verder om beurt één corner genomen door eender welk duo, tot er een ploeg faalt.",
      ),
      heading("Het wedstrijdblad"),
      art(31, "Het wedstrijdblad is enkele dagen voor de wedstrijd beschikbaar via de website."),
      art(
        32,
        "De thuisploeg biedt het wedstrijdblad ingevuld aan de bezoekers aan, minstens 10 minuten voor de aanvang van de wedstrijd.",
      ),
      art(
        33,
        "Bij afwezigheid van het wedstrijdblad dat van de website wordt gehaald, kan een blanco exemplaar verkregen worden bij de scheidsrechter. De thuisploeg wordt daarvoor beboet volgens de boetelijst gepubliceerd op de website.",
      ),
      art(34, "Het wedstrijdblad wordt door beide coaches gehandtekend."),
      art(35, "Alles moet in drukletters worden ingevuld."),
      art(
        36,
        "Het wedstrijdblad moet volgende zaken bevatten:\n- nummer van de match\n- datum en uur\n- ploegnaam\n- familienaam en voornaam van de deelnemende spelers\n- naam, voornaam en handtekening van de coach\n\nBij de naam van de kapitein wordt een “K” vermeld.",
      ),
      art(
        37,
        "De scheidsrechter vervolledigt het blad na de wedstrijd met:\n- de uitslag van de match in cijfers en letters\n- rode en/of gele kaarten (zie ook art. 46)\n- geblesseerde spelers\n- inbreuken die tot boetes leiden volgens de boetelijst gepubliceerd op de website\n- eventuele opmerkingen (op keerzijde)\n- zijn naam en handtekening",
      ),
      art(
        38,
        "Alleen personen die vermeld zijn op het wedstrijdblad en geldig ingeschreven mogen aantreden.",
      ),
      art(
        39,
        "De coach mag aantreden als zijn naam vermeld is bij de deelnemende spelers en geldig ingeschreven is.",
      ),
      art(40, "Alleen personen vermeld op het wedstrijdblad mogen op de bank plaatsnemen."),
      art(
        41,
        "Na de aftrap wordt er op het wedstrijdblad niets meer bijgeschreven en/of veranderd, tenzij door de scheidsrechter, en hebben spelers en ploegverantwoordelijken ook geen inzage meer in het blad.",
      ),
      art(
        42,
        "Bij verkeerd of onvolledig ingevuld wedstrijdblad wordt de ploeg beboet volgens de boetelijst gepubliceerd op de website.",
      ),
      art(
        43,
        "Spelers die te laat komen kunnen nog aan de wedstrijd deelnemen. Ze dienen hun identiteitsbewijs aan de scheidsrechter af te geven, die hun naam en voornaam aanvult op het wedstrijdblad.",
      ),
      art(
        44,
        "Bij het wedstrijdblad worden de identiteitsbewijzen (identiteitskaart of rijbewijs) van de spelers gevoegd voor de wedstrijd.",
      ),
      art(
        45,
        "Spelers of ploegverantwoordelijken zonder geldig identiteitsbewijs kunnen enkel aan de wedstrijd deelnemen mits toelating van de scheidsrechter, die daarvan notitie maakt op het wedstrijdblad.\n\nPer speler zonder geldig identiteitsbewijs wordt de ploeg beboet volgens de boetelijst gepubliceerd op de website.",
      ),
      art(
        46,
        "Bij het geven van een rode kaart dient de scheidsrechter de nodige uitleg in te vullen op de keerzijde van het wedstrijdblad. Indien de uitleg omstandig is kan de scheidsrechter invullen “verslag volgt”, waarna hij binnen de twee werkdagen een volledig verslag bezorgt aan de scheidsrechtersverantwoordelijke.",
      ),
      heading("De wedstrijdschorsing"),
      art(
        47,
        "Wanneer twee spelers van dezelfde ploeg rood of twee maal geel krijgen of indien er — voor om het even welke reden — nog slechts 3 spelers van éénzelfde ploeg op het terrein aanwezig zijn.",
      ),
      art(48, "Wanneer een speler uitdrukkelijk weigert de zaal te verlaten na zijn uitsluiting."),
      art(
        49,
        "Wanneer het verder zetten van de wedstrijd onmogelijk wordt gemaakt door het gedrag van de supporters van een ploeg. Het sportcomité beslist over de straf.",
      ),
      art(
        50,
        "Bij de wedstrijdschorsing veroorzaakt door de ene ploeg, wint de andere ploeg met de forfaitscore van 10-0.",
      ),
      heading("De scheidsrechters"),
      art(51, "Deze worden aangesteld door het bestuur."),
      art(
        52,
        "De bevoegdheid van de scheidsrechter geldt voor de ganse dag van de gespeelde wedstrijd en over het hele domein van het Sportpark te Kuurne.",
      ),
      art(
        53,
        "Op kosten van de ploeg die de aanvraag doet, kan steeds een tweede scheidsrechter bekomen worden. Dit dient aangevraagd te worden bij de scheidsrechtersverantwoordelijke, minimum 14 dagen voor de te spelen wedstrijd.",
      ),
      art(
        54,
        "De ploegverantwoordelijken kunnen de scheidsrechter steeds vragen de identiteit van bepaalde spelers te controleren. Dit wordt genoteerd op het wedstrijdblad, met daarbij het oordeel over het gevraagde onderzoek.",
      ),
      heading("Afwezigheid scheidsrechter(s)"),
      art(
        55,
        "De bezoekende ploeg heeft als eerste het recht een vervangende scheidsrechter aan te duiden.",
      ),
      art(
        56,
        "Bij weigering van de bezoekers moet de thuisploeg een vervangende scheidsrechter leveren, hetzij uit de eigen ploeg, hetzij uit het publiek. Bij gebrek aan vervangende scheidsrechter verliest de thuisploeg met forfaitcijfers, tenzij beide ploegen overeenkomen de wedstrijd in de beste verstandhouding zonder scheidsrechter af te werken.",
      ),
      art(
        57,
        "De gelegenheidsscheidsrechter vult zijn naam en adres in op het wedstrijdblad, alsook de uitslag, eventuele opmerkingen en/of kaarten. Hij neemt tevens een neutrale onpartijdige houding ten aanzien van beide ploegen.",
      ),
      art(58, "De vervangende scheidsrechter wordt door de MVV Kuurne voor zijn diensten vergoed."),
      art(
        59,
        "Een scheidsrechter die afwezig is zonder geldige reden krijgt een geldboete van 10 euro indien hij de scheidsrechtersverantwoordelijke minimum 24 uur voor het aanvangen van de match niet van zijn afwezigheid heeft verwittigd.\n\nDit geldt niet in geval van overmacht of ongeval.",
      ),
    ]),

    section("3", "III. Spelregels", [
      art(
        60,
        "Minivoetbal heeft veel gemeen met het gewone voetbal, doch er zijn enkele belangrijke afwijkingen:\n- sliding is verboden\n- er is geen vaste doelman\n- niemand mag de bal met de hand spelen (de regel “aangeschoten bal” geldt niet)\n- er bestaat geen buitenspel\n- de speler die op de grond ligt, mag niet naar de bal trappen\n- lichamelijk contact is verboden\n- balvoordeel wordt niet toegekend\n- de bal mag niet met de hak achteruit getrapt worden indien er gevaar is dat daardoor een andere speler kan geraakt worden door de achteruit zwaaiende voet",
      ),
      heading("De aftrap"),
      art(
        61,
        "De aftrap wordt gegeven bij het begin van iedere periode, vanaf het middelpunt, in om het even welke richting.",
      ),
      art(62, "De bezoekers nemen de eerste aftrap."),
      art(63, "Bij aftrap kan niet rechtstreeks gescoord worden."),
      heading("Het doelpunt"),
      art(64, "Wanneer de bal — tussen de doelpalen — helemaal over de doellijn is."),
      art(
        65,
        "Na een doelpunt wordt de bal terug in het spel gebracht via een medespeler die zich buiten de eigen strafschopzone bevindt. Bij inbreuk hiervan wordt de bal toegekend aan de tegenstrever, aan de zijlijn.",
      ),
      heading("De intrap"),
      art(66, "Wanneer de bal helemaal over de zijlijn is."),
      art(67, "Bij intrap moeten de tegenspelers zich op minstens vier meter afstand van de bal bevinden."),
      art(68, "Bij intrap kan niet rechtstreeks gescoord worden."),
      art(
        69,
        "De tijd die de speler krijgt voor het intrappen, bedraagt maximaal vier seconden, zoniet wordt de bal aan de tegenstrever toegekend via intrap op dezelfde plaats.",
      ),
      art(
        70,
        "Dezelfde sanctie geldt wanneer de bal niet stilligt of wanneer er vóór of op de lijn wordt ingetrapt.",
      ),
      heading("De doeltrap"),
      art(71, "Wanneer de bal volledig de doellijn heeft overschreden."),
      art(72, "Wordt genomen van om het even waar achter de doellijn."),
      art(73, "De bal moet stilliggen voor het intrappen."),
      art(
        74,
        "Bij doeltrap na een doelpunt moeten alle spelers zich op hun eigen speelhelft bevinden en de bal moet getrapt worden door de ene speler tot buiten het eigen strafschopgebied vooraleer hij door een andere speler mag aangeraakt worden.",
      ),
      art(75, "Vanuit doeltrap kan niet rechtstreeks gescoord worden."),
      art(
        76,
        "Gebeurt dit toch, dan mag de tegenpartij de bal intrappen langs de zijlijn, ter hoogte van het doel van de andere ploeg.",
      ),
      heading("De strafschop"),
      art(77, "Bij fout of handspel binnen het strafschopgebied."),
      art(
        78,
        "Wordt genomen vanaf het middelpunt van het terrein, naar het onverdedigde doel van de tegenstrever.",
      ),
      art(79, "Iedere speler moet zich ten minste op vier meter achter de bal bevinden."),
      heading("De hoekschop"),
      art(80, "Wordt niet genomen, maar wel opgeteld en op het scorebord aangeduid."),
      art(81, "Na de vierde hoekschop wordt een strafcorner toegekend."),
      art(
        82,
        "De bal wordt — naar keuze — op het linker- of het rechter strafcornerpunt gelegd, op de speelhelft van de tegenspeler.",
      ),
      art(
        83,
        "Speler A trapt vanaf het cornerpunt naar speler B die, zonder het strafschopgebied te betreden, de bal naar het onverdedigde doel kopt.",
      ),
      art(
        84,
        "De bal moet reeds in het doel zijn vooraleer de speler die kopt de grond raakt binnen het strafschopgebied.",
      ),
      art(85, "De bal mag de grond niet raken vóór speler B kopt."),
      art(86, "De scheidsrechter geeft 2 fluitsignalen, één vóór en één nà het nemen van de strafcorner."),
      art(
        87,
        "Het spel wordt hernomen met een doeltrap, of er gescoord werd of niet, na beslissing van de scheidsrechter.",
      ),
      art(
        88,
        "Een strafcorner moet altijd worden genomen, ook als de officiële wedstrijdduur is verstreken.",
      ),
      heading("De rechtstreekse vrijschop"),
      art(89, "Wordt toegekend na een fout, handspel, sliding, enz."),
      art(90, "Wordt genomen vanaf de plaats van de fout; er kan rechtstreeks gescoord worden."),
      heading("De onrechtstreekse vrijschop"),
      art(
        91,
        "Wordt toegekend bij gevaarlijk spel, obstructie, foutief hernemen van het spel, bal die het plafond raakt, enz.",
      ),
      art(
        92,
        "De scheidsrechter steekt de arm in de hoogte tot de onrechtstreekse vrijschop genomen werd.",
      ),
      art(93, "Wordt altijd genomen buiten het strafschopgebied."),
      art(
        94,
        "Er kan niet rechtstreeks gescoord worden; de bal moet eerst een andere speler geraakt hebben.",
      ),
      heading("De scheidsrechtersbal"),
      art(95, "Wordt gegeven bij vergissing van de scheidsrechter of bij een dubbele fout."),
      art(96, "Wordt altijd toegekend buiten het strafschopgebied."),
    ]),

    section("4", "IV. Beker- en testwedstrijden", [
      art(97, "Alle spel- en strafreglementen zijn dezelfde als bij de competitiewedstrijden."),
      art(
        98,
        "Het fairplaypunten- en boetereglement zoals gepubliceerd op de website blijft eveneens gelden.",
      ),
      heading("Fairplayranking"),
      art(
        99,
        "De fairplayranking wordt per reeks bijgehouden. De fairplaypunten worden aangerekend volgens het punten- en boetereglement zoals gepubliceerd op de website. De ploeg met het minst behaalde fairplaypunten wint de fairplayranking van zijn reeks.\n\nHet staat het bestuur vrij hier een trofee aan te verbinden.",
      ),
    ]),

    section("5", "V. Sancties en boetes", [
      heading("De gele kaarten"),
      art(
        100,
        "Voor opzettelijk brutaal spel, opzettelijk handspel, verplaatsen van het doel, aanmerkingen en/of beledigingen tegenover de scheidsrechter.\n\nDe ploeg van die geelgestrafte speler wordt beboet volgens de boetelijst gepubliceerd op de website.",
      ),
      art(
        101,
        "Na ontvangst van een gele kaart wordt de speler uitgewezen voor de rest van de lopende periode + de daaropvolgende periode; hij mag vervangen worden door een andere speler zodra de bal buiten de lijnen is.",
      ),
      art(
        102,
        "Bij een tweede gele kaart voor dezelfde speler in dezelfde wedstrijd wordt deze speler uitgesloten voor de rest van de match, zonder te mogen vervangen worden.",
      ),
      art(103, "De gele kaarten uit competitie gelden ook voor de bekerwedstrijden en omgekeerd."),
      art(
        104,
        "De speler die twee gele kaarten krijgt in verschillende wedstrijden of in één en dezelfde wedstrijd wordt automatisch voor één wedstrijd geschorst, namelijk de daaropvolgende wedstrijd, of dit een beker- of competitiewedstrijd is maakt geen verschil.",
      ),
      art(
        105,
        "Na een vierde gele kaart volgt één wedstrijd extra schorsing, dus twee opeenvolgende wedstrijden; na zes gele kaarten volgt twee matchen extra schorsing, dus drie opeenvolgende wedstrijden, enzovoort.",
      ),
      art(
        106,
        "De ploegen moeten de stand der gele kaarten zelf bijhouden en respecteren.\nTer ondersteuning zijn de gele en rode kaarten raadpleegbaar op de website.\nTevens vermeldt het wedstrijdblad, voor zover dit de versie is die van de website wordt gehaald, eveneens de geschorste spelers.",
      ),
      heading("De rode kaarten"),
      art(
        107,
        "Voor zware fout, natrap, slagen, bedreigingen en/of slagen aan de scheidsrechter, enz.\n\nDe ploeg van die roodgestrafte speler wordt beboet volgens de boetelijst gepubliceerd op de website.",
      ),
      art(
        108,
        "De speler wordt uitgewezen en kan niet vervangen worden, tenzij de fout gebeurd is voor aanvang van de wedstrijd. De speler wordt onmiddellijk geschorst, minstens tot het tijdstip waarop het sportcomité over de zaak beslist.",
      ),
      art(109, "De rode kaarten uit competitie gelden ook voor de bekerwedstrijden en omgekeerd."),
      heading("De kaarten — algemeen"),
      art(
        110,
        "Bij ontvangen van een gele of rode kaart is de speler verplicht zijn juiste familie- en voornaam mee te delen aan de scheidsrechter.",
      ),
      art(
        111,
        "Bij opgeven van een valse naam wordt de speler een zwaardere straf opgelegd. Zijn ploeg wordt bijkomend beboet volgens de boetelijst gepubliceerd op de website.",
      ),
      heading("De schorsingen"),
      art(
        112,
        "Bij een rode kaart kan de speler opgeroepen worden naar de bijeenkomst van het sportcomité. Hij mag zich laten vertegenwoordigen of laten bijstaan door de ploegafgevaardigde. Het sportcomité spreekt zich nadien uit over de sanctie.",
      ),
      art(
        113,
        "Na een rode kaart kan het bestuur een voorstel van sanctie richten aan de ploeg van de betrokken speler, via e-mail, zonder dat deze voor het sportcomité is verschenen. Indien het voorstel (de minnelijke schikking) niet aanvaard wordt, dient de ploegverantwoordelijke dit binnen de vier dagen te laten weten aan de scheidsrechtersverantwoordelijke met de nodige motivering en kan het sportcomité samenkomen waarop de speler kan uitgenodigd worden.",
      ),
      art(
        114,
        "Na een rode kaart blijft de speler geschorst tot oproeping voor het sportcomité of tot bekendmaking aan de ploegverantwoordelijke van de genomen sanctie.",
      ),
      art(
        115,
        "Bij het negeren van de oproep tot verschijnen voor het sportcomité bedraagt de minimum schorsing dertien matchen.",
      ),
      heading("Het scorebord"),
      art(
        116,
        "Het bestuur verbindt er zich toe zo snel als mogelijk de uitslag en rangschikking te publiceren op de website.",
      ),
      heading("De uitwijzing"),
      art(
        117,
        "De speler die een gele kaart krijgt in de 3de of de 4de periode of die een rode kaart krijgt, moet onmiddellijk het terrein verlaten. Hij mag daarna ook niet meer op de reservebank plaatsnemen, noch zich in de tribune of sporthal ophouden; dit mag wel in de kleedkamer en in het cafetaria.",
      ),
      art(
        118,
        "Een coach die geschorst wordt, mag niet meer in de zaal plaatsnemen gedurende de periode van de schorsing; ook niet in de kleedkamers, tribune, scheidsrechterslokaal of achter de afsluiting.",
      ),
      art(119, "De geschorste speler kan de functie van coach niet uitoefenen."),
      art(120, "De geschorste coach kan niet aantreden als speler."),
      heading("De schorsing door het sportcomité"),
      art(
        121,
        "Het bestuur kan steeds sancties uitspreken tegen spelers, coaches of ploegen. Het bestuur kan ploegen uitsluiten uit de competitie, uit de beker- en/of testwedstrijden.",
      ),
      heading("Het forfait"),
      art(
        122,
        "Wanneer een ploeg afwezig is op een wedstrijd, verliest deze de wedstrijd met forfaitscore 10-0 en wordt de ploeg beboet volgens de boetelijst gepubliceerd op de website.\nEen moedwillig forfait wordt bestraft met een boete volgens de boetelijst gepubliceerd op de website. De ploeg die forfait geeft verliest eveneens de wedstrijd met de forfaitscore 10-0.\n\nHet sportcomité beslist over het al dan niet “moedwillig” zijn van het forfait.",
      ),
      art(
        123,
        "Wanneer een ploeg door bepaalde omstandigheden tijdens een wedstrijd tot minder dan vier spelers herleid wordt, wordt de wedstrijd stopgezet en de forfaitscore uitgesproken in het voordeel van de andere ploeg.",
      ),
      art(
        124,
        "Wanneer een speler weigert het terrein te verlaten als de scheidsrechter dit eist, wordt de wedstrijd stopgezet en wordt dit als een moedwillig forfait beschouwd met gevolgen cfr. art. 125.",
      ),
      art(
        125,
        "De scheidsrechter beslist tot forfait wanneer er acht minuten na het officiële aanvangsuur minder dan vier spelers van een ploeg op het terrein aanwezig zijn.",
      ),
      art(
        126,
        "Bij twee maal niet verwittigd forfait kan het bestuur beslissen de ploeg uit te sluiten uit de competitie.",
      ),
      heading("Het verwittigd forfait"),
      art(
        127,
        "Een forfait wordt als “verwittigd forfait” aanzien als dit minstens één dag voor de wedstrijd werd gemeld aan het bestuur, de ploegverantwoordelijke van de tegenstrever en de scheidsrechtersverantwoordelijke.\n\nDe ploeg die forfait geeft staat in voor het verwittigen van de tegenstander. De contactinformatie staat per ploeg op de website.",
      ),
      art(
        128,
        "Bij verwittigd forfait blijft de forfaitscore. De ploeg wordt beboet volgens de boetelijst gepubliceerd op de website.",
      ),
      heading("Ploegen buiten competitie"),
      art(
        129,
        "Er kunnen steeds ploegen ingevoegd worden om geschorste of gestopte ploegen te vervangen. Het bestuur beslist of dit te organiseren valt.",
      ),
      heading("Slechts vier spelers"),
      art(
        130,
        "Wanneer een ploeg slechts met vier spelers kan aantreden, mag de tegenstrever uit sportiviteit beslissen om ook maar met vier spelers te spelen, maar dan wel gedurende de ganse wedstrijd. De scheidsrechter noteert dit op het wedstrijdblad.",
      ),
      heading("Het voorbehoud"),
      art(
        131,
        "Een ploeg mag een wedstrijd “onder voorbehoud” spelen.\n\nIn dit geval moet de ploegafgevaardigde dit door de scheidsrechter laten noteren op het wedstrijdblad, met daarbij de uitleg inzake de vermoedelijke onregelmatigheid.\n\nHet sportcomité onderzoekt de aanvraag tot voorbehoud en bepaalt de uitslag.",
      ),
      art(
        132,
        "In geval van bewuste beïnvloeding en manipulatie van een wedstrijd die wordt bewezen of erkend door een persoon verbonden aan een ploeg, zal het bestuur een gepaste sanctie uitspreken voor individuele leden of de volledige ploeg.",
      ),
      heading("De omkoping"),
      art(
        133,
        "Betaling of omkoping van spelers teneinde een uitslag te vervalsen wordt bestraft met uitsluiting van deze speler en zijn volledige ploeg en met het volledig verlies van de betaalde waarborgsom.",
      ),
      heading("De blaam"),
      art(134, "Ploegen kunnen voor onsportief gedrag een blaam krijgen."),
      art(135, "De sanctie is voor de volledige op het wedstrijdblad vermelde ploeg, elk een gele kaart."),
      art(
        136,
        "De scheidsrechter vraagt de blaam aan. Het sportcomité beslist over de strafmaat van de blaam.",
      ),
      heading("De wanbetaling"),
      art(
        137,
        "De sancties wegens het niet betalen van de bijdragen op de vastgestelde data zijn:\n\na) elke competitiewedstrijd na uiterste datum van betaling wordt verloren met forfaitcijfers;\n\nb) na een tweede forfait voor achterstallige betalingen kan de ploeg geschrapt worden uit de competitie.",
      ),
      art(
        138,
        "Er kan gedurende heel het seizoen aan de ploegen gevraagd worden de waarborgsom aan te zuiveren (bvb. na forfait).",
      ),
      heading("De geschorste spelers"),
      art(
        139,
        "De ploeg die een geschorste speler toch opstelt, wordt bestraft met forfait voor elke wedstrijd. De forfait wordt beboet volgens de boetelijst zoals op de website gepubliceerd.",
      ),
      art(
        140,
        "Wanneer een speler in een andere competitie voor één jaar of meer geschorst wordt, dan wordt deze schorsing overgenomen door de MVV Kuurne.",
      ),
      heading("De klachten"),
      art(
        141,
        "Een klacht dient binnen de twee werkdagen bezorgd of verstuurd te worden aan het bestuur, of na de wedstrijd mondeling aan een bestuurslid.",
      ),
      art(
        142,
        "Het bestuur zal deze behandelen en de nodige beslissing of sanctie treffen.\nHier is geen beroep mogelijk.",
      ),
      heading("Het beroep"),
      art(
        143,
        "Tegen beslissingen van het sportcomité kan steeds beroep worden aangetekend, uitgezonderd in geval van toepassing van art. 142.",
      ),
      art(
        144,
        "Een aanvraag tot beroep dient binnen de twee werkdagen bezorgd of verstuurd te worden aan het bestuur.",
      ),
      art(
        145,
        "Het beroepscomité wordt samengesteld cfr. bijlage A van dit reglement (beroepsprocedure).",
      ),
      art(
        146,
        "Alle beslissingen worden genomen bij meerderheid van stemmen.\n\nIn geval van gelijkheid van stemmen is de stem van de voorzitter doorslaggevend.",
      ),
      heading("De boetes"),
      art(147, "De actuele boetelijst staat gepubliceerd op de website."),
    ]),

    section("6", "VI. Organisatorisch reglement", [
      heading("De aansluiting"),
      art(148, "Er is een beperking — per ploeg — van 20 spelers, coach inbegrepen."),
      art(149, "Er is een minimum — per ploeg — van 8 spelers."),
      art(
        150,
        "Er mogen geen spelers opgesteld worden die spelen in een hogere afdeling dan 1ste provinciale van de Belgische Voetbalbond of een aanverwante competitie in het buitenland.",
      ),
      art(
        151,
        "Er mogen geen spelers aangesloten worden die spelen bij een provinciale en/of nationale mini- en/of zaalvoetbalcompetitie.",
      ),
      art(
        152,
        "Alle spelers van de KMVV dienen niet-betaalde sportbeoefenaars te zijn; d.w.z. dat zij minivoetbal spelen enkel voor het sportieve genoegen en er zeker niet voor betaald mogen worden.",
      ),
      art(153, "Alle aangesloten spelers moeten het reglement respecteren."),
      art(
        154,
        "Door vermeld te zijn op de spelerslijst verbinden zij zich ertoe de reglementen te eerbiedigen.",
      ),
      art(
        155,
        "Een speler is aangesloten zodra de spelerslijst bij het bestuur ter goedkeuring werd aanvaard. Elk jaar wordt een nieuwe spelerslijst opgemaakt voor de start van de competitie.",
      ),
      art(156, "Aansluiting van nieuwe spelers mag slechts gebeuren op het tijdstip, bepaald door het bestuur."),
      art(
        157,
        "Overgangen van spelers van de ene naar de andere ploeg tijdens de lopende competitie en bekerwedstrijden zijn verboden.",
      ),
      art(
        158,
        "Spelers die bij twee ploegen staan ingeschreven, worden voorlopig geschorst, tot beslissing van het bestuur.",
      ),
      art(159, "Aansluiten van bijkomende spelers na de start van de competitie mag tot 31 december."),
      art(
        160,
        "Deze nieuw aangesloten spelers zijn evenwel pas speelgerechtigd vanaf 1 januari van het daaropvolgend kalenderjaar.",
      ),
      art(161, "Elke op het wedstrijdblad vermelde speler moet minstens 16 jaar oud zijn."),
      art(
        162,
        "Het bestuur is niet verantwoordelijk voor onsportief gedrag van spelers en/of publiek, die schade berokkenen aan personen en/of goederen. Er zal wel streng worden opgetreden tegen de schuldigen; eventueel zullen gerechtelijke overheden ter plaatse geroepen worden.",
      ),
      heading("De inschrijving"),
      art(163, "Ploegen schrijven in tegen een door het bestuur bepaalde datum."),
      art(164, "De inschrijving is pas geldig na tijdige betaling van het inschrijvingsgeld."),
      art(165, "Nieuwe ploegen betalen eveneens een waarborg om geldig ingeschreven te zijn."),
      art(
        166,
        "De spelerslijst moet ingediend worden ten laatste voor de competitiestart, tegen een door het bestuur aangeduide datum.",
      ),
      art(167, "De som van de inschrijving en waarborg wordt elk jaar opnieuw vastgelegd door het bestuur."),
      art(
        168,
        "De inschrijving van de ploeg wordt slechts aanvaard indien elke speler is vermeld op het inschrijvingsformulier (naam, voornaam, adres en geboortedatum) evenals de naam, voornaam, adres, tel.nr. en e-mailadres van de ploegverantwoordelijke.",
      ),
      heading("De verzekering"),
      art(169, "Het nemen van een sportongevallenverzekering voor elke speler is verplicht."),
      art(
        170,
        "De ploegen kunnen kiezen tussen een verzekering die ze zelf aangaan of de collectieve verzekering via MVV Kuurne.",
      ),
      art(
        171,
        "Ploegen die aansluiten met een eigen gekozen verzekering, moeten dit kunnen bewijzen op het ogenblik van de inschrijving.",
      ),
      art(
        172,
        "Ploegen die aansluiten bij de collectieve groepsverzekering van MVV Kuurne betalen, per speler, een bijdrage die jaarlijks vastgesteld wordt door het bestuur.",
      ),
      art(
        173,
        "Het bestuur kan nooit verantwoordelijk gesteld worden voor ongevallen en/of wetsovertredingen van aangesloten leden.",
      ),
      heading("De naamsverandering"),
      art(
        174,
        "Ploegen mogen niet van naam veranderen tijdens het seizoen; dit mag enkel tijdens het tussenseizoen.",
      ),
      art(175, "Bij naamsverandering zullen administratiekosten worden aangerekend."),
      heading("Het clubbestuur"),
      art(
        176,
        "Wijzigingen van ploegverantwoordelijken en hun contactgegevens dienen zo vlug mogelijk gemeld te worden zodat MVV Kuurne ten allen tijde over de correcte coördinaten van de ploegverantwoordelijken kan beschikken.",
      ),
      heading("De financiële verplichtingen"),
      art(
        177,
        "De deelnamesom aan de Kuurnse minivoetbalcompetitie bestaat uit een inschrijvingssom voor het volledige seizoen en eventueel bijkomend een waarborgsom voor nieuwe ploegen. Die bijdragen worden jaarlijks door het bestuur bepaald.",
      ),
      art(
        178,
        "De boeten van het afgelopen seizoen worden betaald in het lopend seizoen. Detail kan verkregen worden bij het bestuur.",
      ),
      art(
        179,
        "Niet betaalde verschuldigde bedragen worden ingehouden van de waarborgsom die in dat geval zo vlug mogelijk terug moet aangezuiverd worden.\n\nDe ploeg die nalaat de waarborgsom aan te zuiveren, kan het volgende seizoen niet aanvangen.",
      ),
      art(
        180,
        "De uiterste datum van betaling wordt altijd vermeld bij het toesturen van een rekening. De datum van ontvangst, voorkomende op het rekeninguittreksel, geldt als datum van betaling. Ploegen die laattijdig betalen worden beboet volgens de boetelijst die op de website is gepubliceerd.",
      ),
      heading("Het reglement Kuurnse sporthal"),
      art(
        181,
        "Het huishoudelijk reglement van het Kuurnse Sportpark wordt door MVV Kuurne overgenomen en gerespecteerd. Dit reglement is opgenomen op de website van de gemeente Kuurne: www.kuurne.be, alsook op de website van MVV Kuurne.",
      ),
      art(
        182,
        "Na overtreding tegen de reglementen van het Kuurnse Sportpark kan de overtreder en/of zijn ploeg, naast de sanctie van de VZW Sportpark, ook nog bijkomend bestraft worden door MVV Kuurne.",
      ),
      art(
        183,
        "De twee ploegen die de laatste wedstrijd van de dag spelen dienen elk één van de doelen terug te plaatsen in de daartoe voorziene berging in de sporthal.",
      ),
      heading("Varia"),
      art(
        184,
        "De samenstelling van het bestuur MVV Kuurne is terug te vinden op de website www.mvvkuurne.be.",
      ),
      art(
        185,
        "De ploegverantwoordelijke van de speler die een rode kaart heeft ontvangen, evenals de betrokken scheidsrechter, worden vooraf verwittigd van de datum, uur en plaats van de eventuele verschijning voor het sportcomité.\n\nHet sportcomité, dat beslissingsbevoegdheid heeft inzake rode kaarten, bestaat uit minstens 3 bestuursleden van de KMVV aangevuld met de scheidsrechter die de leiding had in de betrokken wedstrijd waarin de rode kaart werd toegekend.\nHet bestuurslid dat op enige wijze verbonden is aan de ploeg bij welke de betrokken speler speelt, of de tegenpartij, neemt niet deel aan het sportcomité.\n\nVolgende procedure wordt gevolgd:\n- de scheidsrechter wordt gehoord\n- de betrokken speler en/of ploegverantwoordelijke worden gehoord\n- de eventuele getuigen worden gehoord\n- de beslissingsprocedure wordt doorlopen\n\nBeslissingsprocedure:\n- Stemming sportcomité om de strafcategorie te bepalen:\n- minimumstraf = stemming voor 2, 3 of 4 wedstrijden schorsing\n- lichte schorsing = 5 t.e.m. 8 wedstrijden schorsing\n- zware schorsing = 9 t.e.m. 13 wedstrijden schorsing\n- zeer zware schorsing = 14 wedstrijden tot totaalverbod verdere deelname aan de competities van MVV Kuurne\n\nVaststelling schorsingsduur:\n- Bij minimumstraf: stemming voor 2, 3 of 4 wedstrijden\n- Bij lichte schorsing: leden sportcomité stemmen d.m.v. briefjes, in geheime stemming, en kiezen tussen 5, 6, 7 of 8 wedstrijden. De getallen worden opgeteld en gedeeld door het aantal leden van het sportcomité. Er wordt afgerond naar beneden.\n- Bij zware schorsing: idem als hierboven, maar er wordt gekozen tussen 9, 10, 11, 12 of 13 wedstrijden schorsing.\n- Bij zeer zware schorsing: geen stemming; beslissing moet worden genomen in consensus.\n\nDe beslissing wordt binnen de week meegedeeld aan de ploegverantwoordelijke van de betrokken speler.\nBij de beslissingsprocedure mogen enkel de leden van het sportcomité aanwezig zijn.\n\nBeroepsprocedure:\nDe procedure is dezelfde als hierboven beschreven met enkel volgende verschillen:\n- het sportcomité wordt aangevuld met ploegverantwoordelijken uit de andere reeks dan degene waarin de betrokken speler speelt\n- deze hebben evenveel beslissingsrecht als de leden van het sportcomité zelf\n- minstens vier aanvullende leden worden uitgenodigd.\n\nIn geval van toepassing van art. 114 (minnelijke schikking):\nEen minnelijke schikking kan enkel toegepast worden voor de categorie minimumstraf, lichte en zware schorsing.\nIn geval van minnelijke schikking wordt dezelfde beslissingsprocedure zoals hierboven is beschreven gevolgd om de strafcategorie te bepalen en om de schorsingsduur vast te stellen.\nIndien de betrokken speler of ploegverantwoordelijke niet akkoord is met de uitgesproken minnelijke schikking wordt de gewone procedure opgestart.",
      ),
      art(
        186,
        "De deelname — op welke wijze ook — aan de competities en werking van MVV Kuurne houdt ook in dat men ermee akkoord gaat dat de gegevens van de ploegen en personen worden bijgehouden en verwerkt door het bestuur van de vereniging.\nBepaalde gegevens worden gepubliceerd op de website, nl. het klassement, de gele en rode kaarten, de ploegverantwoordelijken, lijsten met namen van spelers en bestuursleden, alsook de scheidsrechters.\n\nIeder kan inzage vragen bij het bestuur aangaande de opgeslagen gegevens wat betreft zijn eigen persoon.\nMen kan vragen dat deze worden aangepast als ze verkeerd werden opgenomen.\nDe ploegverantwoordelijken kunnen inzage vragen inzake de opgeslagen gegevens wat betreft hun ploeg en deze indien nodig laten aanpassen als ze verkeerd werden opgenomen.",
      ),
    ]),
  ],
};
