"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, describeError } from "@/lib/api";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Field, Input } from "./ui/field";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      await api("/api/session", { method: "POST", body: { mode, ...form } });
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch (e) {
      setError(describeError(e));
      setPending(false);
    }
  }

  const register = mode === "register";
  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">{register ? "Crea il tuo ristorante" : "Accedi"}</h1>
      <p className="mt-1 text-sm text-muted">
        {register ? "Prova gratuita, nessuna carta richiesta." : "Bentornato. Inserisci le tue credenziali."}
      </p>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
        {register && (
          <>
            <Field label="Nome del ristorante">
              {(id) => <Input id={id} name="restaurantName" required autoComplete="organization" />}
            </Field>
            <Field label="Il tuo nome">
              {(id) => <Input id={id} name="fullName" required autoComplete="name" />}
            </Field>
          </>
        )}
        <Field label="Email">
          {(id) => <Input id={id} name="email" type="email" required autoComplete="email" />}
        </Field>
        <Field label="Password" hint={register ? "Almeno 10 caratteri" : undefined}>
          {(id) => (
            <Input
              id={id}
              name="password"
              type="password"
              required
              minLength={register ? 10 : 1}
              autoComplete={register ? "new-password" : "current-password"}
            />
          )}
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" size="lg" loading={pending} className="justify-center">
          {register ? "Crea account" : "Accedi"}
        </Button>
        {!register && (
          <Link href="/password-dimenticata" className="text-center text-sm text-brand-700 hover:underline">
            Password dimenticata?
          </Link>
        )}
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        {register ? "Hai già un account? " : "Nuovo ristorante? "}
        <Link
          href={register ? "/login" : "/registrati"}
          className="font-medium text-brand-700 hover:underline"
        >
          {register ? "Accedi" : "Registrati"}
        </Link>
      </p>
    </Card>
  );
}
