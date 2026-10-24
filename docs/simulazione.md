# Simulazione delle prenotazioni

`apps/api/test/simulation.test.ts` è una sessione lunga e casuale contro l'API vera (PGlite in
memoria): quattro ristoranti (i tre modelli trattoria, pizzeria a turni, fine dining e uno su misura
con priorità, combinazioni, tavoli solo-combinazione, limiti online per fascia, capienza online
ridotta, sala non prenotabile online, tavoli bloccati, regole di durata per sala, ritmo e coperti
massimi), su cinque giorni compreso il cambio dell'ora legale (25 ottobre 2026).

Per ogni ristorante esegue centinaia di operazioni: prenotazioni online (anche a orari non offerti),
dello staff, walk-in, gruppi grandi (richieste), modifiche dello staff (orario e persone), modifiche
dei clienti dal link, cancellazioni, no-show, clienti seduti. Ogni risultato è controllato con un
modello indipendente (non usa il motore): tavoli validi per il gruppo, tavoli uniti adiacenti e
minimi, nessuna sovrapposizione, blocchi rispettati, durate, scelta uguale alla migliore libera,
tavoli uniti liberati con meno persone, limiti online, ritmo e coperti massimi, e alla fine la
disponibilità (staff e online, 1-8 persone, ogni orario) confrontata con il modello.

```bash
pnpm --filter @restourant/api simulate                      # 220 operazioni per ristorante
SIM_OPS=300 SIM_SEED=7 SIM_REPORT=/tmp/sim.md pnpm --filter @restourant/api simulate
```

Il rapporto elenca per ristorante le operazioni e gli esiti, e gli esempi di ERRORE (il test
fallisce), AVVISO e NOTA (scelte possibili ma migliorabili, es. posti sprecati per la priorità).
