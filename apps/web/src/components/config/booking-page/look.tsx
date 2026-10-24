"use client";

import { MAX_GALLERY_PHOTOS } from "@restourant/shared";
import { ArrowLeft, ArrowRight, ImagePlus, X } from "lucide-react";
import { useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { api, describeError } from "@/lib/api";
import { BRAND_PRESETS } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { resizeImage } from "@/lib/images";
import { mediaUrl } from "@/lib/media";
import { useRestaurant } from "@/lib/restaurant";

/** Look of the booking page: colour, logo, cover and gallery uploads. */

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <div>
      <p className="mb-2 text-sm font-medium">Colore del marchio</p>
      <div className="flex flex-wrap items-center gap-2">
        {BRAND_PRESETS.map((p) => (
          <button
            key={p.color}
            type="button"
            title={p.name}
            aria-label={`Colore ${p.name}`}
            aria-pressed={value === p.color}
            onClick={() => {
              onChange(p.color);
              setText(p.color);
            }}
            className={cn(
              "h-9 w-9 rounded-full ring-offset-2 transition-shadow",
              value === p.color ? "ring-2 ring-ink" : "hover:ring-2 hover:ring-line",
            )}
            style={{ backgroundColor: p.color }}
          />
        ))}
        <label
          className="relative ml-1 flex h-9 items-center gap-2 rounded-full border border-line pl-1 pr-3 text-sm"
          title="Colore personalizzato"
        >
          <input
            type="color"
            value={value}
            aria-label="Colore personalizzato"
            onChange={(e) => {
              onChange(e.target.value);
              setText(e.target.value);
            }}
            className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
          />
          <input
            value={text}
            aria-label="Codice colore"
            maxLength={7}
            onChange={(e) => {
              setText(e.target.value);
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toLowerCase());
            }}
            className="w-20 bg-transparent font-mono text-sm uppercase outline-none"
          />
        </label>
      </div>
    </div>
  );
}

function useUpload() {
  const { base } = useRestaurant();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function upload(file: File, options: { maxSize: number; keepTransparency?: boolean }) {
    setBusy(true);
    try {
      const dataUrl = await resizeImage(file, options);
      return (await api<{ id: string }>(`${base}/media`, { method: "POST", body: { dataUrl } })).id;
    } catch (error) {
      toast.error(error instanceof Error && !("status" in error) ? error.message : describeError(error));
      return null;
    } finally {
      setBusy(false);
    }
  }
  return { upload, busy };
}

function FilePicker({
  onFiles,
  multiple = false,
  children,
  className,
  disabled,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => ref.current?.click()} className={className}>
        {children}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple={multiple}
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </>
  );
}

export function ImageSlot({
  label,
  hint,
  imageId,
  onChange,
  maxSize,
  keepTransparency,
  className,
  fit = "cover",
}: {
  label: string;
  hint: string;
  imageId: string | null;
  onChange: (id: string | null) => void;
  maxSize: number;
  keepTransparency?: boolean;
  className: string;
  fit?: "cover" | "contain";
}) {
  const { upload, busy } = useUpload();
  const pick = async ([file]: File[]) => {
    if (!file) return;
    const id = await upload(file, { maxSize, keepTransparency });
    if (id) onChange(id);
  };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <FilePicker
        onFiles={pick}
        disabled={busy}
        className={cn(
          "group relative flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-line bg-canvas text-muted hover:border-brand-500",
          className,
        )}
      >
        {imageId ? (
          <img
            src={mediaUrl(imageId)}
            alt={label}
            className={cn("h-full w-full", fit === "contain" ? "object-contain p-2" : "object-cover")}
          />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs">
            <ImagePlus className="h-6 w-6" />
            Carica {label.toLowerCase()}
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Spinner className="h-5 w-5" />
          </span>
        )}
      </FilePicker>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{hint}</p>
        {imageId && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-xs font-medium text-red-600 hover:underline"
          >
            Rimuovi
          </button>
        )}
      </div>
    </div>
  );
}

export function Gallery({ photoIds, onChange }: { photoIds: string[]; onChange: (ids: string[]) => void }) {
  const { upload, busy } = useUpload();
  const toast = useToast();
  const room = MAX_GALLERY_PHOTOS - photoIds.length;

  async function add(files: File[]) {
    if (files.length > room) toast.error(`Puoi aggiungere ancora ${room} foto`);
    const added: string[] = [];
    for (const file of files.slice(0, room)) {
      const id = await upload(file, { maxSize: 1600 });
      if (id) added.push(id);
    }
    onChange([...photoIds, ...added]);
  }
  const move = (from: number, to: number) => {
    const next = [...photoIds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {photoIds.map((id, i) => (
        <div key={id} className="group relative overflow-hidden rounded-xl bg-canvas">
          <img src={mediaUrl(id)} alt={`Foto ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 to-transparent p-1.5">
            <div className="flex gap-1">
              <PhotoButton label="Sposta prima" disabled={i === 0} onClick={() => move(i, i - 1)}>
                <ArrowLeft className="h-3.5 w-3.5" />
              </PhotoButton>
              <PhotoButton
                label="Sposta dopo"
                disabled={i === photoIds.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <ArrowRight className="h-3.5 w-3.5" />
              </PhotoButton>
            </div>
            <PhotoButton label="Rimuovi foto" onClick={() => onChange(photoIds.filter((p) => p !== id))}>
              <X className="h-3.5 w-3.5" />
            </PhotoButton>
          </div>
        </div>
      ))}
      {room > 0 && (
        <FilePicker
          multiple
          onFiles={add}
          disabled={busy}
          className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-canvas text-xs text-muted hover:border-brand-500"
        >
          {busy ? <Spinner className="h-5 w-5" /> : <ImagePlus className="h-6 w-6" />}
          Aggiungi foto
        </FilePicker>
      )}
    </div>
  );
}

function PhotoButton({
  label,
  children,
  ...props
}: { label: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="rounded-md bg-white/90 p-1 text-ink hover:bg-white disabled:opacity-30"
      {...props}
    >
      {children}
    </button>
  );
}
