"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { api, describeError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const email = String(new FormData(event.currentTarget).get("email"));
      await api("/auth/password/forgot", { method: "POST", body: { email } });
      setSent(true);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Password dimenticata</h1>
      {sent ? (
        <div className="mt-3 flex flex-col gap-3 text-sm text-muted">
          <p>
            Se l&apos;indirizzo corrisponde a un account, ti abbiamo inviato un link per sceglierne una nuova.
            Vale un&apos;ora.
          </p>
          <p>
            Non arriva? Controlla lo spam, oppure chiedi al titolare o al manager del locale: da{" "}
            <em>Configurazione → Personale</em> può crearti un link.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <Field label="Email">
            {(id) => <Input id={id} name="email" type="email" required autoComplete="email" />}
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" size="lg" loading={pending} className="justify-center">
            Invia il link
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-medium text-brand-700 hover:underline">
          Torna all&apos;accesso
        </Link>
      </p>
    </Card>
  );
}
