# Personale e accessi

Ogni locale ha un **titolare** (chi l'ha creato) e può aggiungere **manager** e **staff** da
**Configurazione → Personale**.

| Ruolo    | Cosa può fare                                                            |
| -------- | ------------------------------------------------------------------------ |
| Titolare | Tutto, compresi i dati del locale e il personale                         |
| Manager  | Configurazione, prenotazioni, clienti; aggiunge e gestisce solo lo staff |
| Staff    | Prenotazioni, sala e clienti; vede la configurazione senza modificarla   |

## Invitare una persona

1. Email e ruolo → **Invita**.
2. Si apre un link da **copiare** o **inviare su WhatsApp**; se le email sono attive parte anche
   un'email. Il link vale 7 giorni e si usa una volta sola.
3. La persona apre il link, scrive il nome e sceglie la password, ed entra direttamente nel locale.
   Se ha già un account (lavora anche in un altro locale) conferma con la sua password e da quel
   momento sceglie il locale dal menu.

Gli inviti in attesa si possono **revocare** o rimandare con **Nuovo link** (il vecchio smette di
funzionare). Nessuno può cambiare il proprio ruolo; il titolare non si può rimuovere. Chi viene
rimosso perde l'accesso subito.

## Password

- **Password dimenticata** (pagina di accesso): arriva un link per email, valido un'ora. Serve che le
  email siano attive (vedi `deploy.md`).
- **Link password** (Configurazione → Personale): il titolare o il manager crea un link valido 24 ore
  da consegnare a mano, anche senza email.
- **Il mio account**: cambia la propria password.

Dopo un cambio o un reset della password, tutte le altre sessioni aperte (altri telefoni, tablet)
devono accedere di nuovo.

## Dettagli tecnici

Inviti e link per la password sono token casuali: nel database c'è solo la loro impronta SHA-256.
Ogni utente ha un `session_version` scritto nel token di sessione: cambiare password lo incrementa e
le sessioni con la versione vecchia vengono rifiutate.
