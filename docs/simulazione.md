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

Con `SIM_LEVEL=2` si aggiungono un quinto ristorante grande e operazioni più dure: spostamenti
manuali e tavoli uniti a mano, prenotazioni dello staff su tavoli scelti (anche sbagliati),
ripristino di prenotazioni cancellate, conferma delle richieste, cambio di giorno e di durata,
sei clienti che prenotano lo stesso orario nello stesso istante, lista d'attesa (iscrizione e
avviso dopo una disdetta) e cambi di configurazione a metà giornata (blocchi di tavoli e sale,
online chiuso, giorno chiuso, orari speciali, tavoli disattivati, priorità, capienza online).

Dopo ogni operazione riuscita controlla anche lo **storico** e le **email**: una nuova riga con chi
ha agito (staff, cliente, sistema), il titolo giusto e le righe attese (Ora, Persone, Giorno, Tavolo,
Stato con il prima → dopo), e al cliente l'email prevista (confermata, richiesta, modificata,
cancellata) o nessuna.

```bash
pnpm --filter @restourant/api simulate                      # 220 operazioni per ristorante
SIM_OPS=300 SIM_SEED=7 SIM_REPORT=/tmp/sim.md pnpm --filter @restourant/api simulate
SIM_LEVEL=2 SIM_OPS=400 SIM_SEED=11 pnpm --filter @restourant/api simulate
# Su un Postgres vero (le richieste simultanee corrono davvero in parallelo, a differenza di PGlite):
TEST_DATABASE_URL=postgres://utente:password@localhost:5432/vuoto SIM_LEVEL=2 pnpm --filter @restourant/api simulate
```

`TEST_DATABASE_URL` vale per tutti i test dell'API: usa un database vuoto dedicato, che i test
riempiono senza cancellarlo.

Il rapporto elenca per ristorante le operazioni e gli esiti, e gli esempi di ERRORE (il test
fallisce), AVVISO e NOTA (scelte possibili ma migliorabili, es. posti sprecati per la priorità).
