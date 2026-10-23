import type { ReservationChannel } from "@restourant/shared";
import { DoorOpen, Globe } from "lucide-react";
import { cn } from "@/lib/cn";

export const CHANNEL_LABELS: Record<ReservationChannel, string> = {
  staff: "Inserita dallo staff",
  online: "Online",
  walk_in: "Walk-in",
};

/**
 * Where a booking came from. Bookings entered by staff are the default and carry no badge, so the
 * ones made by guests on the website stand out.
 */
export function ChannelBadge({
  channel,
  compact = false,
}: {
  channel: ReservationChannel;
  compact?: boolean;
}) {
  if (channel === "staff") return null;
  const online = channel === "online";
  const Icon = online ? Globe : DoorOpen;
  return (
    <span
      title={online ? "Prenotata dal cliente online" : "Arrivato senza prenotazione"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full font-medium",
        compact ? "p-0.5" : "px-2 py-0.5 text-xs",
        online ? "bg-violet-100 text-violet-700" : "bg-stone-200 text-stone-700",
      )}
    >
      <Icon className={compact ? "h-3.5 w-3.5" : "h-3 w-3"} aria-hidden />
      {compact ? <span className="sr-only">{CHANNEL_LABELS[channel]}</span> : CHANNEL_LABELS[channel]}
    </span>
  );
}
