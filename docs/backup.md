# Backup, ripristino e monitoraggio

I dati di tutti i ristoranti stanno nel database PostgreSQL su **Neon**. Sono protetti in tre modi.

## 1. Ripristino istantaneo di Neon

Neon tiene la storia delle modifiche e permette di riportare il database a un momento preciso
(**Restore** nel pannello Neon, oppure creando un _branch_ da un istante passato). La finestra dipende
dal piano Neon (poche ore sul piano gratuito, giorni su quelli a pagamento: verifica in Neon →
Settings). È il rimedio più rapido per un errore recente (es. dati cancellati per sbaglio un'ora fa).

## 2. Backup notturno cifrato (GitHub Actions)

Ogni notte alle 02:17 UTC il workflow **Backup** (`.github/workflows/backup.yml`):

1. scarica una copia completa del database (`pg_dump`, formato custom);
2. la **ripristina in un PostgreSQL vuoto** e conta ristoranti, prenotazioni e clienti: se il
   ripristino non funziona il workflow fallisce e GitHub manda un'email;
3. la **cifra** (AES-256 con una passphrase) e la conserva **30 giorni** come artifact privato del
   repository.

### Da configurare una volta

In GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret                | Valore                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| `BACKUP_DATABASE_URL` | stringa di connessione Neon **diretta** (l'host senza `-pooler`)                                   |
| `BACKUP_PASSPHRASE`   | una frase lunga e casuale. **Salvala anche in un password manager**: senza, i backup non si aprono |

Poi **Actions → Backup → Run workflow** per provarlo subito.

### Ripristinare un backup

1. GitHub → **Actions → Backup** → scegli la notte → scarica l'artifact `twentyreserve-AAAA-MM-GG`
   (uno zip con dentro il file `.dump.gpg`).
2. Decifra:
   ```bash
   gpg --decrypt twentyreserve-AAAA-MM-GG.dump.gpg > backup.dump   # chiede la passphrase
   ```
3. In Neon crea un database (o un branch) vuoto e ripristina:
   ```bash
   pg_restore --no-owner --no-acl -d "postgres://…nuovo-database…" backup.dump
   ```
   Serve `pg_restore` della stessa versione di PostgreSQL di Neon o più recente.
4. Controlla i dati, poi in Vercel aggiorna `DATABASE_URL` (Production) con il nuovo database e fai
   **Redeploy**. Le migrazioni partono da sole e saltano quelle già applicate.

Per recuperare solo alcuni dati (es. le prenotazioni di un ristorante) ripristina in un database a
parte e copia le righe che servono.

## 3. Monitoraggio

- **`GET /api/v1/health`** risponde `{"data":{"status":"ok","database":"ok"}}`, oppure 503 se il
  database non risponde.
- Il workflow **Monitor** (`.github/workflows/monitor.yml`) ogni 10 minuti controlla l'app (con il
  database) e il sito `twentyreserve.com`, con un secondo tentativo dopo 30 secondi. Se fallisce,
  GitHub manda un'email (GitHub → Settings → Notifications → Actions: "Send notifications for failed
  workflows only"). Gli indirizzi si cambiano con le variabili `HEALTH_URL` e `SITE_URL` del
  repository. GitHub può ritardare i controlli programmati di qualche minuto.
- Errori dell'applicazione: Vercel → progetto → **Logs** (filtro "Error"). Il job giornaliero dei
  promemoria e delle recensioni risponde con quante email ha mandato e quante sono fallite.

## Se arriva l'avviso "Monitor failed"

1. Apri l'URL dell'app: se non risponde, guarda Vercel → Deployments (l'ultimo deploy è fallito?
   **Instant Rollback** a quello precedente) e Vercel → Logs.
2. Se risponde ma il database no (`503`): guarda lo stato di Neon (status.neon.tech) e il pannello
   del progetto (limiti del piano, database sospeso).
3. Se il problema sono i dati: ripristino istantaneo Neon (punto 1) o backup notturno (punto 2).
