"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { api, describeError } from "@/lib/api";

/** Choosing a new password from a one-time link (email, or handed over by the manager). */
export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const reset = useQuery({
    queryKey: ["password-reset", token],
    queryFn: () => api<{ email: string }>(`/auth/password/reset/${token}`),
    retry: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (reset.isPending) return <PageLoader />;
  if (reset.isError || !reset.data) {
    return (
      <Card className="p-6 text-center">
        <h1 className="text-xl font-semibold">Link non valido</h1>
        <p className="mt-2 text-sm text-muted">{describeError(reset.error)}</p>
        <Link
          href="/password-dimenticata"
          className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline"
        >
          Chiedi un nuovo link
        </Link>
      </Card>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError("Le due password non coincidono");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api("/api/session", { method: "POST", body: { mode: "reset-password", token, password } });
      window.location.href = "/prenotazioni";
    } catch (e) {
      setError(describeError(e));
      setPending(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Nuova password</h1>
      <p className="mt-1 text-sm text-muted">Per l&apos;account {reset.data.email}.</p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <Field label="Nuova password" hint="Almeno 10 caratteri">
          {(id) => (
            <Input
              id={id}
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
            />
          )}
        </Field>
        <Field label="Ripeti la password">
          {(id) => (
            <Input
              id={id}
              name="confirm"
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
            />
          )}
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" size="lg" loading={pending} className="justify-center">
          Salva e accedi
        </Button>
      </form>
    </Card>
  );
}
