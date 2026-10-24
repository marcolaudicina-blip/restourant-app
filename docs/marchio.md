# Marchio TwentyReserve

Il logo è il numero **20** con lo zero a forma di orologio che segna le 8: le 20:00, l'ora della cena.
Il 2 scorre nello 0 con la sua base. Sotto o accanto, **TWENTY** e **RESERVE** (Inter Light e Regular,
convertiti in tracciati: i file non dipendono dai font installati).

## Colori

| Nome         | Valore    | Uso                                   |
| ------------ | --------- | ------------------------------------- |
| Verde Twenty | `#2f6555` | logo, pulsanti (`brand-600` nell'app) |
| Verde scuro  | `#264f44` | hover, testi su fondo chiaro          |
| Crema        | `#f6f5f2` | sfondo dell'app                       |

## File (`apps/web/public/brand/`, pubblici su `/brand/...`)

| File                                      | Per cosa                                           |
| ----------------------------------------- | -------------------------------------------------- |
| `twentyreserve-logo.svg` / `-white`       | versione verticale (20 sopra, scritta sotto)       |
| `twentyreserve-horizontal.svg` / `-white` | versione orizzontale (menu dell'app, email, sito)  |
| `twentyreserve-mark.svg` / `-white`       | solo il 20                                         |
| `twentyreserve-icon.svg`                  | icona: 20 bianco su quadrato verde arrotondato     |
| `twentyreserve-icon-square.svg`           | icona senza angoli arrotondati (social, App Store) |
| `icon-192.png`, `icon-512.png`            | icona per "Aggiungi a schermata Home"              |
| `email-logo.png`                          | intestazione delle email di invito e password      |

Nell'app il logo è il componente `ProductLogo` (`apps/web/src/components/product-logo.tsx`), disegnato
in `currentColor`. Favicon e icona per iPhone/iPad sono in `apps/web/src/app/` (`icon.svg`,
`favicon.ico`, `apple-icon.png`), il manifest in `apps/web/src/app/manifest.ts`.

Le email di conferma ai clienti restano col marchio del ristorante, non col nostro.
