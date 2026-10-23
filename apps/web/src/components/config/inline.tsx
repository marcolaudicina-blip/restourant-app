"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Inputs that save on blur/Enter, for spreadsheet-style editing of tables and rules.
 * They only call `onCommit` when the value actually changed.
 */

export function InlineText({
  value,
  onCommit,
  className,
  label,
}: {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };
  return (
    <input
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn(
        "h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm hover:border-line focus:border-brand-500 focus:bg-surface focus:outline-none",
        className,
      )}
    />
  );
}

export function InlineNumber({
  value,
  onCommit,
  min,
  max,
  label,
  className,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
  min?: number;
  max?: number;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  useEffect(() => setDraft(value === null ? "" : String(value)), [value]);
  const commit = () => {
    const next = draft.trim() === "" ? null : Number(draft);
    if (
      next !== null &&
      (Number.isNaN(next) || (min !== undefined && next < min) || (max !== undefined && next > max))
    ) {
      setDraft(value === null ? "" : String(value));
      return;
    }
    if (next !== value) onCommit(next);
  };
  return (
    <input
      aria-label={label}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn(
        "h-9 w-16 rounded-md border border-transparent bg-transparent px-2 text-sm tabular-nums hover:border-line focus:border-brand-500 focus:bg-surface focus:outline-none",
        className,
      )}
    />
  );
}

export function InlineCheck({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer accent-brand-600"
    />
  );
}
