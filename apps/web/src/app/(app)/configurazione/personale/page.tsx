"use client";

import type { InvitableRole } from "@restourant/shared";
import { Check, Copy, KeyRound, MessageCircle, Send, Trash2, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { PageLoader } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/api";
import { formatDateShort, ROLE_LABELS } from "@/lib/labels";
import { useMe, useRestaurantMutation, useTeam } from "@/lib/queries";
import { useRestaurant } from "@/lib/restaurant";
import type { PendingInvitation, TeamMember } from "@/lib/types";

const ROLE_HELP: Record<keyof typeof ROLE_LABELS, string> = {
  owner: "Tutto, compresi i dati del locale e il personale",
  manager: "Configurazione, prenotazioni e personale di sala",
  staff: "Prenotazioni, sala e clienti; vede la configurazione senza modificarla",
};

/** A link to hand over: copy it or send it on WhatsApp. */
type SharedLink = { title: string; description: string; url: string; message: string };

export default function TeamPage() {
  const team = useTeam();
  const me = useMe();
  const { role } = useRestaurant();
  const [shared, setShared] = useState<SharedLink | null>(null);
  if (team.isPending || !team.data) return <PageLoader />;

  const myId = me.data?.user.id;
  // Managers give and manage the "staff" role only; the owner both.
  const roles: InvitableRole[] = role === "owner" ? ["staff", "manager"] : ["staff"];
  const manageable = (m: TeamMember) =>
    m.userId !== myId && m.role !== "owner" && (role === "owner" || m.role === "staff");

  return (
    <div className="flex flex-col gap-5">
      <InviteCard roles={roles} onLink={setShared} />

      <Card>
        <CardHeader title="Persone" description="Chi può accedere al gestionale di questo locale." />
        <ul className="divide-y divide-line">
          {team.data.members.map((m) => (
            <MemberRow
              key={m.userId}
              member={m}
              isMe={m.userId === myId}
              editable={manageable(m)}
              roles={roles}
              onLink={setShared}
            />
          ))}
        </ul>
      </Card>

      {team.data.invitations.length > 0 && (
        <Card>
          <CardHeader title="Inviti in attesa" description="Valgono 7 giorni." />
          <ul className="divide-y divide-line">
            {team.data.invitations.map((i) => (
              <InvitationRow key={i.id} invitation={i} onLink={setShared} />
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-5 text-sm">
        <p className="mb-2 font-medium">Cosa può fare ogni ruolo</p>
        <dl className="grid gap-1.5 sm:grid-cols-[8rem_1fr]">
          {(Object.keys(ROLE_HELP) as (keyof typeof ROLE_HELP)[]).map((r) => (
            <div key={r} className="contents">
              <dt className="font-medium">{ROLE_LABELS[r]}</dt>
              <dd className="text-muted">{ROLE_HELP[r]}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {shared && <ShareDialog link={shared} onClose={() => setShared(null)} />}
    </div>
  );
}

const absolute = (path: string) => `${window.location.origin}${path}`;

function useInvite() {
  return useRestaurantMutation(
    (base, body: { email: string; role: InvitableRole }) =>
      api<{ path: string; emailSent: boolean }>(`${base}/team/invitations`, { method: "POST", body }),
    ["config"],
  );
}

function inviteLink(email: string, result: { path: string; emailSent: boolean }): SharedLink {
  const url = absolute(result.path);
  return {
    title: "Invito creato",
    description: result.emailSent
      ? `Abbiamo mandato l'invito a ${email}. Puoi anche inviargli il link direttamente.`
      : `Invia questo link a ${email}: lo apre, sceglie la password ed entra. Vale 7 giorni.`,
    url,
    message: `Ciao! Ti ho aggiunto al gestionale delle prenotazioni. Entra da qui: ${url}`,
  };
}

function InviteCard({ roles, onLink }: { roles: InvitableRole[]; onLink: (link: SharedLink) => void }) {
  const invite = useInvite();
  const toast = useToast();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = { email: String(data.get("email")).trim(), role: String(data.get("role")) as InvitableRole };
    try {
      const result = await invite.mutateAsync(body);
      form.reset();
      onLink(inviteLink(body.email, result));
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  return (
    <Card>
      <CardHeader
        title="Aggiungi una persona"
        description="Riceve un link per entrare: niente password da comunicare."
      />
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3 p-5">
        <Field label="Email" className="min-w-56 flex-1">
          {(id) => <Input id={id} name="email" type="email" required placeholder="nome@esempio.it" />}
        </Field>
        <Field label="Ruolo">
          {(id) => (
            <Select id={id} name="role" defaultValue="staff" className="w-40">
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" loading={invite.isPending}>
          <UserPlus className="h-4 w-4" /> Invita
        </Button>
      </form>
    </Card>
  );
}

function MemberRow({
  member,
  isMe,
  editable,
  roles,
  onLink,
}: {
  member: TeamMember;
  isMe: boolean;
  editable: boolean;
  roles: InvitableRole[];
  onLink: (link: SharedLink) => void;
}) {
  const toast = useToast();
  const mutation = useRestaurantMutation(
    (base, action: { kind: "role"; role: InvitableRole } | { kind: "remove" } | { kind: "reset" }) =>
      action.kind === "role"
        ? api(`${base}/team/members/${member.userId}`, { method: "PATCH", body: { role: action.role } })
        : action.kind === "remove"
          ? api(`${base}/team/members/${member.userId}`, { method: "DELETE" })
          : api<{ path: string; hours: number }>(`${base}/team/members/${member.userId}/reset-link`, {
              method: "POST",
            }),
    ["config"],
  );

  async function run(action: Parameters<typeof mutation.mutateAsync>[0], success?: string) {
    try {
      const result = await mutation.mutateAsync(action);
      if (action.kind === "reset") {
        const { path, hours } = result as { path: string; hours: number };
        const url = absolute(path);
        onLink({
          title: "Link per la nuova password",
          description: `Invialo a ${member.fullName}: sceglie una nuova password ed entra. Vale ${hours} ore, una volta sola.`,
          url,
          message: `Ciao ${member.fullName.split(" ")[0]}, ecco il link per scegliere una nuova password: ${url}`,
        });
      }
      if (success) toast.success(success);
    } catch (e) {
      toast.error(describeError(e));
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">
          {member.fullName} {isMe && <span className="text-sm font-normal text-muted">(tu)</span>}
        </p>
        <p className="truncate text-sm text-muted">{member.email}</p>
      </div>
      {editable ? (
        <>
          <Select
            aria-label={`Ruolo di ${member.fullName}`}
            value={member.role}
            disabled={roles.length < 2}
            onChange={(e) => run({ kind: "role", role: e.target.value as InvitableRole }, "Ruolo aggiornato")}
            className="w-36"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => run({ kind: "reset" })}
            title="Password dimenticata"
          >
            <KeyRound className="h-4 w-4" /> Link password
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Rimuovi ${member.fullName}`}
            onClick={() => {
              if (window.confirm(`Rimuovere ${member.fullName}? Non potrà più accedere a questo locale.`))
                void run({ kind: "remove" }, `${member.fullName} rimosso`);
            }}
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </Button>
        </>
      ) : (
        <Badge className="bg-canvas text-ink">{ROLE_LABELS[member.role]}</Badge>
      )}
    </li>
  );
}

function InvitationRow({
  invitation,
  onLink,
}: {
  invitation: PendingInvitation;
  onLink: (link: SharedLink) => void;
}) {
  const toast = useToast();
  const invite = useInvite();
  const revoke = useRestaurantMutation(
    (base, id: string) => api(`${base}/team/invitations/${id}`, { method: "DELETE" }),
    ["config"],
  );
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{invitation.email}</p>
        <p className="text-sm text-muted">
          {ROLE_LABELS[invitation.role]} · scade il {formatDateShort(invitation.expiresAt.slice(0, 10))}
        </p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        loading={invite.isPending}
        onClick={async () => {
          try {
            const result = await invite.mutateAsync({ email: invitation.email, role: invitation.role });
            onLink(inviteLink(invitation.email, result));
          } catch (e) {
            toast.error(describeError(e));
          }
        }}
      >
        <Send className="h-4 w-4" /> Nuovo link
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => revoke.mutateAsync(invitation.id).catch((e) => toast.error(describeError(e)))}
      >
        Revoca
      </Button>
    </li>
  );
}

function ShareDialog({ link, onClose }: { link: SharedLink; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open onClose={onClose} title={link.title} description={link.description}>
      <div className="flex flex-col gap-3">
        <p className="break-all rounded-lg bg-canvas px-3 py-2 font-mono text-xs" data-testid="shared-link">
          {link.url}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              await navigator.clipboard.writeText(link.url);
              setCopied(true);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiato" : "Copia link"}
          </Button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(link.message)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-canvas"
          >
            <MessageCircle className="h-4 w-4" /> Invia su WhatsApp
          </a>
          <Button variant="ghost" onClick={onClose} className="ml-auto">
            Fatto
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
