import type { Role } from "@restourant/shared";
import type { RenderedEmail } from "./booking-email.template.js";

/* Emails about accounts: joining a restaurant's team, choosing a new password. */

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export const ROLE_NAMES: Record<Role, string> = { owner: "titolare", manager: "manager", staff: "staff" };

function layout(title: string, body: string, action: { label: string; url: string }, footer: string) {
  // The logo is served by the web app, at the same address as the link.
  const logo = `${new URL(action.url).origin}/brand/email-logo.png`;
  return `<!doctype html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head>
<body style="margin:0;padding:0;background:#f6f5f2;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d1b18">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px">
<tr><td style="padding:32px">
<img src="${escape(logo)}" width="160" height="42" alt="TwentyReserve" style="display:block;margin:0 0 24px;border:0">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${escape(title)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a463f">${body}</p>
<a href="${escape(action.url)}" style="display:inline-block;background:#2f6555;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">${escape(action.label)}</a>
<p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#6f6a62">${escape(footer)}<br>Se il pulsante non funziona, copia questo indirizzo nel browser:<br><span style="word-break:break-all">${escape(action.url)}</span></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

export function renderInvitationEmail(input: {
  restaurantName: string;
  inviterName: string | null;
  role: Role;
  url: string;
}): RenderedEmail {
  const who = input.inviterName ? `${input.inviterName} ti ha invitato` : "Sei stato invitato";
  const subject = `Invito a lavorare con ${input.restaurantName}`;
  const sentence = `${who} a usare il gestionale delle prenotazioni di ${input.restaurantName} come ${ROLE_NAMES[input.role]}.`;
  const footer = "L'invito vale 7 giorni. Se non ti aspettavi questa email puoi ignorarla.";
  return {
    subject,
    html: layout(subject, escape(sentence), { label: "Accetta l'invito", url: input.url }, footer),
    text: [sentence, "", `Accetta l'invito: ${input.url}`, "", footer].join("\n"),
  };
}

export function renderPasswordResetEmail(input: {
  fullName: string;
  url: string;
  hours: number;
}): RenderedEmail {
  const subject = "Reimposta la password";
  const sentence = `Ciao ${input.fullName.split(/\s+/)[0]}, per scegliere una nuova password usa il pulsante qui sotto.`;
  const footer = `Il link vale ${input.hours === 1 ? "un'ora" : `${input.hours} ore`} e si può usare una volta sola. Se non l'hai chiesto tu, ignora questa email: la password resta quella di prima.`;
  return {
    subject,
    html: layout(subject, escape(sentence), { label: "Scegli una nuova password", url: input.url }, footer),
    text: [sentence, "", input.url, "", footer].join("\n"),
  };
}
