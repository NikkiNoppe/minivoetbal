# E-mail & DNS Setup

## Doel

1. **Uitgaand:** forfait-mails versturen vanaf `info@harelbekeminivoetbal.be` via Resend.
2. **Inkomend:** antwoorden op `info@harelbekeminivoetbal.be` doorsturen naar `noppe.nikki@icloud.com` via ImprovMX.

---

## Huidige DNS-status (gecontroleerd op 21 mei 2026)

| Record | Huidige waarde | Status |
|--------|----------------|--------|
| MX @ priority 10 | `x1.improvmx.com` | ❌ **Fout** — dit hostname heeft geen A-record en kan geen mail ontvangen |
| MX @ priority 20 | `mx2.improvmx.com` | ✅ OK |
| TXT SPF @ | `v=spf1 include:spf.improvmx.com ~all` | ⚠️ Werkt voor ImprovMX, mist Resend |
| TXT DKIM | `resend._domainkey` | ✅ OK |
| TXT DMARC | `p=none` | ✅ OK |
| `send.harelbekeminivoetbal.be` MX/SPF | Resend bounce-handling | ✅ OK (aparte subdomain) |

**Hoofdprobleem:** de MX-record wijst naar `x1.improvmx.com` in plaats van `mx1.improvmx.com`. Mailservers proberen eerst priority 10 te bereiken, falen daar, en sommige geven dan op voordat ze mx2 proberen.

---

## Stap 1 — DNS corrigeren (jij, bij je DNS-provider)

Pas de records voor `harelbekeminivoetbal.be` aan (niet bij Lovable — die beheert enkel `notify.*`).

### MX-records (ImprovMX — inkomende mail)

Verwijder alle bestaande MX-records op `@` en voeg toe:

| Type | Host | Waarde | Priority |
|------|------|--------|----------|
| MX | @ | `mx1.improvmx.com` | 10 |
| MX | @ | `mx2.improvmx.com` | 20 |

> ⚠️ Gebruik **`mx1`**, niet `x1`. Controleer via [ImprovMX Inspector](https://inspector.improvmx.com/harelbekeminivoetbal.be).

### SPF (gecombineerd voor ImprovMX + Resend)

Er mag maar **één** SPF TXT-record op `@` staan. Vervang de huidige waarde door:

```text
v=spf1 include:spf.improvmx.com include:amazonses.com ~all
```

Resend-verzending loopt via `send.harelbekeminivoetbal.be` (eigen SPF/MX) — die records **niet** wijzigen.

### DKIM (Resend — uitgaande mail)

Laat staan zoals Resend ze heeft opgegeven:

- Host: `resend._domainkey`
- Waarde: de lange public key uit het Resend-dashboard

### DMARC

Huidige record is OK (`p=none`). Later eventueel aanscherpen naar `p=quarantine` als alles stabiel draait.

---

## Stap 2 — ImprovMX alias instellen (jij)

1. Log in op [app.improvmx.com](https://app.improvmx.com).
2. Controleer dat `harelbekeminivoetbal.be` in je account staat en **DNS verified** toont (na stap 1).
3. Voeg alias toe:
   - **Alias:** `info`
   - **Forward naar:** `noppe.nikki@icloud.com`
4. Optioneel: voeg een catch-all alias `@` → `noppe.nikki@icloud.com` toe voor andere adressen op het domein.

Controleer in **Email Logs** of binnenkomende mails zichtbaar zijn wanneer je test.

---

## Stap 3 — Resend domein (uitgaand)

1. Ga naar [resend.com/domains](https://resend.com/domains).
2. Controleer dat `harelbekeminivoetbal.be` status **Verified** heeft.
3. De code gebruikt al `from: info@harelbekeminivoetbal.be` in `send-forfait-notification`.
4. `reply_to: info@harelbekeminivoetbal.be` zorgt dat antwoorden naar het ImprovMX-alias gaan.

---

## Stap 4 — iCloud ontvangst

Doorgestuurde mail kan in iCloud in **Ongewenst** belanden. Controleer daar als testmails niet in de inbox verschijnen.

Tips:
- Stuur een testmail naar `info@harelbekeminivoetbal.be` vanaf een extern adres (niet vanaf iCloud zelf).
- Controleer ImprovMX Email Logs: status moet `delivered` zijn.
- Voeg in iCloud een filter/regel toe voor afzenders van `@harelbekeminivoetbal.be` als nodig.

---

## Stap 5 — Test

### Test inkomend (ImprovMX)

1. Stuur een mail vanaf Gmail/Outlook naar `info@harelbekeminivoetbal.be`.
2. Controleer of die binnen enkele minuten in `noppe.nikki@icloud.com` aankomt.
3. Check ImprovMX logs bij problemen.

### Test antwoord op forfait-mail

1. Stuur een forfait-mail naar jezelf via de app.
2. Beantwoord die mail.
3. Het antwoord moet op `info@` binnenkomen en doorgestuurd worden naar iCloud.

### Verificatie-tools

- [ImprovMX Inspector](https://inspector.improvmx.com/harelbekeminivoetbal.be)
- [MXToolbox SPF Check](https://mxtoolbox.com/spf.aspx)
- Terminal: `dig MX harelbekeminivoetbal.be +short`

Verwacht resultaat:

```text
10 mx1.improvmx.com.
20 mx2.improvmx.com.
```

---

## Architectuur

```text
Uitgaand (forfait-mail):
  App → Resend → ontvanger
  From: info@harelbekeminivoetbal.be
  Reply-To: info@harelbekeminivoetbal.be

Inkomend (antwoord):
  Antwoord → MX mx1/mx2.improvmx.com → ImprovMX → noppe.nikki@icloud.com
```

Resend en ImprovMX delen het root-domein:
- **ImprovMX** = MX op `@` (inkomende mail ontvangen)
- **Resend** = DKIM + `send.*` subdomain (uitgaande mail + bounces)

Geen conflict zolang Resend's MX-record enkel op `send.harelbekeminivoetbal.be` staat (niet op `@`).

---

## Wat je me laat weten

Zeg **"klaar"** zodra:
1. MX-record is aangepast naar `mx1.improvmx.com`
2. SPF is gecombineerd
3. ImprovMX alias `info` → `noppe.nikki@icloud.com` actief is

Dan kunnen we samen de test uitvoeren. Deel een screenshot van je DNS-records als iets niet valideert.
