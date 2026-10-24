"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/labels";
import { useMe } from "@/lib/queries";

export default function AccountPage() {
  const me = useMe();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get("newPassword"));
    if (newPassword !== String(data.get("confirm"))) {
      setError("Le due password non coincidono");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api("/api/session", {
        method: "POST",
        body: { mode: "change-password", currentPassword: String(data.get("currentPassword")), newPassword },
      });
      form.reset();
      toast.success("Password cambiata: gli altri dispositivi dovranno accedere di nuovo");
    } catch (e) {
      setError(describeError(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <PageHeader title="Il mio account" />
      <div className="grid max-w-3xl gap-5">
        <Card className="p-5">
          <p className="text-lg font-semibold">{me.data?.user.fullName}</p>
          <p className="text-sm text-muted">{me.data?.user.email}</p>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {me.data?.memberships.map((m) => (
              <li key={m.restaurantId} className="rounded-full bg-canvas px-3 py-1">
                {m.restaurantName} · {ROLE_LABELS[m.role]}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader
            title="Cambia password"
            description="Dopo il cambio, gli altri dispositivi dovranno accedere di nuovo."
          />
          <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Password attuale" className="sm:col-span-2">
              {(id) => (
                <Input
                  id={id}
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              )}
            </Field>
            <Field label="Nuova password" hint="Almeno 10 caratteri">
              {(id) => (
                <Input
                  id={id}
                  name="newPassword"
                  type="password"
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
              )}
            </Field>
            <Field label="Ripeti la nuova password">
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
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{error}</p>
            )}
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" loading={pending}>
                Cambia password
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
