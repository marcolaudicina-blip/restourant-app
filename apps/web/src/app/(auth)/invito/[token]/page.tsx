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
import { ROLE_LABELS } from "@/lib/labels";
import { rememberRestaurant } from "@/lib/restaurant";

type Invitation = {
  restaurantName: string;
  email: string;
  role: keyof typeof ROLE_LABELS;
  accountExists: boolean;
};

/** Joining a restaurant's team from the link a manager sent. */
export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const invitation = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => api<Invitation>(`/auth/invitations/${token}`),
    retry: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (invitation.isPending) return <PageLoader />;
  if (invitation.isError || !invitation.data) {
    return (
      <Card className="p-6 text-center">
        <h1 className="text-xl font-semibold">Invito non valido</h1>
        <p className="mt-2 text-sm text-muted">{describeError(invitation.error)}</p>
        <Link href="/login" className="mt-6 inline-block text-sm font-medium text-brand-700 hover:underline">
          Vai all&apos;accesso
        </Link>
      </Card>
    );
  }
  const data = invitation.data;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const result = await api<{ restaurantId: string }>("/api/session", {
        method: "POST",
        body: { mode: "accept-invitation", token, ...form },
      });
      rememberRestaurant(result.restaurantId);
      // A full load: whoever was signed in on this device before must not linger in the cache.
      window.location.href = "/prenotazioni";
    } catch (e) {
      setError(describeError(e));
      setPending(false);
    }
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-semibold">Unisciti a {data.restaurantName}</h1>
      <p className="mt-1 text-sm text-muted">
        Sei stato invitato come <strong>{ROLE_LABELS[data.role].toLowerCase()}</strong> con l&apos;indirizzo{" "}
        {data.email}.
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        {data.accountExists ? (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
            Hai già un account con questa email: inserisci la tua password per aggiungere il locale.
          </p>
        ) : (
          <Field label="Il tuo nome">
            {(id) => <Input id={id} name="fullName" required autoComplete="name" />}
          </Field>
        )}
        <Field
          label={data.accountExists ? "La tua password" : "Scegli una password"}
          hint={data.accountExists ? undefined : "Almeno 10 caratteri"}
        >
          {(id) => (
            <Input
              id={id}
              name="password"
              type="password"
              required
              minLength={data.accountExists ? 1 : 10}
              autoComplete={data.accountExists ? "current-password" : "new-password"}
            />
          )}
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button type="submit" size="lg" loading={pending} className="justify-center">
          Accetta l&apos;invito
        </Button>
      </form>
    </Card>
  );
}
