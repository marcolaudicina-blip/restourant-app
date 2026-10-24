# Privacy, termini e GDPR

## Ruoli

- **TwentyReserve** è titolare dei dati di ristoratori e staff (account) e **responsabile del
  trattamento** (art. 28) dei dati dei clienti dei ristoranti.
- Ogni **ristorante** è titolare dei dati dei propri clienti.

## Pagine pubbliche

| Pagina                    | Contenuto                                                                     |
| ------------------------- | ----------------------------------------------------------------------------- |
| `/privacy`                | informativa per ristoratori e visitatori del sito, cookie (solo tecnici)      |
| `/termini`                | termini di servizio (B2B), con approvazione specifica artt. 1341-1342 c.c.    |
| `/trattamento-dati`       | accordo sul trattamento dei dati (art. 28) e sub-responsabili                 |
| `/prenota/<slug>/privacy` | informativa per i clienti del ristorante, scritta dai dati del locale (it/en) |

I dati dell'azienda (ragione sociale, P. IVA, sede, PEC) e l'elenco dei sub-responsabili sono in
`apps/web/src/lib/site.ts` (`COMPANY`, `SUBPROCESSORS`). **I testi sono una base di partenza: vanno
fatti rivedere da un consulente prima della vendita.**

## Nel prodotto

- **Registrazione**: casella obbligatoria per Termini, Accordo sul trattamento e Informativa;
  `users.terms_accepted_at` e `terms_version` (`TERMS_VERSION` in packages/shared) la registrano.
  Se i termini cambiano: aggiorna testo, `LEGAL_UPDATED` e `TERMS_VERSION`, e avvisa i titolari.
- **Pagina di prenotazione**: il cliente dichiara di aver letto l'informativa; il link porta a quella
  del ristorante (Configurazione → Pagina di prenotazione → Informativa privacy) o a quella pronta.
- **Conservazione** (Configurazione → Regole): dopo 12/24/36/60 mesi dall'ultima prenotazione nome e
  contatti vengono resi anonimi dal job giornaliero (`applyRetention`); i nuovi ristoranti partono
  da 24 mesi, quelli esistenti restano "finché non li cancello io" finché non scelgono. Le richieste
  in lista d'attesa vengono cancellate 30 giorni dopo il loro giorno.
- **Diritti dei clienti**: scheda cliente → elimina (anonimizza le prenotazioni).
- **Portabilità**: il titolare scarica tutti i dati del locale in JSON (Configurazione → Dati del
  locale → Scarica tutti i dati; `GET /restaurants/:id/export`).
