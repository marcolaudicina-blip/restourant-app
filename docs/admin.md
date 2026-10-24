# Admin TwentyReserve

Pannello per lo staff di TwentyReserve (`/admin`, voce **Admin** nel menu). Lo vede solo chi accede con
un'email elencata nella variabile `PLATFORM_ADMIN_EMAILS` (separate da virgola, su Vercel solo
Production). Per tutti gli altri la pagina e le API `/v1/admin/*` rispondono "non trovato".

## Cosa mostra

- **Numeri della piattaforma**: ristoranti (e nuovi della settimana), utenti, prenotazioni degli ultimi
  30 giorni e quante online.
- **Ristoranti**: titolare e email, data di iscrizione e giorni di prova rimasti (30), prenotazioni degli
  ultimi 30 giorni, persone dello staff, ultima attività. Ricerca per nome, città, titolare o email.
- **Dettagli**: contatti, persone con ruolo, prenotazioni dei prossimi 30 giorni, ultime 25 voci del
  registro modifiche, link alla pagina pubblica.

## Accesso come assistenza

**Entra come assistenza** aggiunge l'admin al ristorante come manager con `memberships.support = true`:
lavora nel locale come lo staff, con una fascia gialla sempre visibile e il pulsante **Esci
dall'assistenza**. Il ristorante lo vede nel Personale come "Assistenza TwentyReserve" e ogni ingresso
e uscita resta nel suo registro modifiche (`support_access`). Uscendo, l'accesso viene tolto; un admin
che è davvero membro di un locale non perde mai il suo ruolo.

## API

`GET /v1/admin/overview`, `GET /v1/admin/restaurants`, `GET /v1/admin/restaurants/:id`,
`POST`/`DELETE /v1/admin/restaurants/:id/support`. `GET /v1/auth/me` riporta `platformAdmin`.
