# Roadmap

## ✅ Fase 0: fondamenta e configurazione generica

Monorepo, CI, database, autenticazione e ruoli, configurazione completa, modelli, anteprima orari,
storico modifiche.

## 🔄 Fase 1: sostituire Superb nel nostro ristorante

1. ✅ **Prenotazioni**: niente doppie prenotazioni garantito dal database, stati, note ospite e
   interne, walk-in, spostamento e unione dei tavoli
2. ✅ **Motore di disponibilità**: orari + tavoli liberi + combinazioni + tavoli uniti + priorità +
   durate + ritmo + blocchi, con il motivo di ogni orario non disponibile
3. ✅ **Gestionale web** (Next.js): configurazione guidata, lista del giorno, nuova prenotazione con
   orari disponibili, sala con spostamento e unione dei tavoli, editor della disposizione,
   configurazione completa, vista a griglia tavoli × orari con trascinamento, foglio del servizio da
   stampare, aggiornamento tra dispositivi entro 10 secondi con avviso delle prenotazioni online,
   personale con inviti e ruoli. Da fare: app per telefono
4. ✅ **Pagina di prenotazione pubblica** con colori, logo, copertina e foto del locale, link da
   condividere, pulsante e modulo da inserire nel sito (vedi `pagina-prenotazione.md`). Da fare:
   versione in inglese, QR code
5. ✅ **Email** (Resend): conferma e richiesta ricevuta per le prenotazioni online con l'avviso del
   ristorante, prenotazioni inserite, spostate o cancellate dallo staff, promemoria il giorno prima,
   link "Gestisci la prenotazione" per modificare o disdire online con avviso allo staff
6. ✅ **Scheda cliente**: creata in automatico dalle prenotazioni e riconosciuta dal telefono, note
   permanenti, etichette, visite / coperti / no-show / cancellazioni, storico, cancellazione con
   anonimizzazione (GDPR), importazione di clienti e prenotazioni da CSV (Superb e altri)
7. ⏳ Configurazione del nostro ristorante e 1–2 settimane in parallelo a Superb

## Fase 2: renderlo vendibile

Registrazione self-service con configurazione guidata, abbonamenti Stripe, caparre e carta a garanzia
con Stripe Connect, Super Admin, backup e disaster recovery, privacy e termini.

## Fase 3: meglio di Superb

SMS e WhatsApp, lista d'attesa, feedback e recensioni Google, statistiche, assistente AI per le
prenotazioni via messaggio, gift card, marketing, integrazioni cassa.
