/*
 * Outgoing email. Production sends through Resend (https://resend.com) when RESEND_API_KEY and
 * EMAIL_FROM are set; without them emails are skipped, so development and previews never mail guests.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Shown as the sender, e.g. the restaurant's name. The address is always EMAIL_FROM's. */
  fromName?: string;
  /** Where the guest's replies go, e.g. the restaurant's own address. */
  replyTo?: string | null;
};

export type Mailer = {
  /** False when sending is not configured: callers skip the work and record why. */
  readonly enabled: boolean;
  send(message: EmailMessage): Promise<void>;
};

/** `"Trattoria" <prenotazioni@example.com>` from EMAIL_FROM's address and a display name. */
export function senderWithName(from: string, name: string | undefined): string {
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
  const clean = name?.replace(/["\\<>\r\n]/g, "").trim();
  return clean ? `"${clean}" <${address}>` : from;
}

export function createResendMailer(options: { apiKey: string; from: string; timeoutMs?: number }): Mailer {
  return {
    enabled: true,
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: senderWithName(options.from, message.fromName),
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Resend ${response.status}: ${body.slice(0, 300)}`);
      }
    },
  };
}

export const disabledMailer: Mailer = { enabled: false, send: async () => undefined };

/** Keeps messages in memory, for tests. */
export function createMemoryMailer(): Mailer & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    enabled: true,
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

export function mailerFromConfig(email: { apiKey: string; from: string } | null): Mailer {
  return email ? createResendMailer(email) : disabledMailer;
}
