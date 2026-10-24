# Statistiche

**Statistiche** (menu a sinistra; sul telefono da "Il mio account") è per titolare e manager
(permesso `stats.read`). Per un periodo (7 giorni, 30 giorni, 3 mesi, 12 mesi o date a scelta, al
massimo 12 mesi) mostra:

- **coperti** e **prenotazioni**, con la variazione rispetto allo stesso numero di giorni prima;
- quota **online**, e con quanti giorni di anticipo si prenota dal sito;
- **no-show** (sulle prenotazioni che dovevano arrivare) e cancellazioni;
- coperti **per giorno** (anche come tabella), **media per giorno della settimana** e **per ora di
  arrivo**;
- **canali**: sito, staff/telefono, walk-in;
- **clienti abituali** del periodo e giudizio medio delle recensioni.

Contano le prenotazioni non cancellate e non no-show, per data della prenotazione. I numeri sono
calcolati al momento (`GET /restaurants/:id/stats?from&to`), nulla viene salvato a parte.
