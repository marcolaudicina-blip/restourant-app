"use client";

import { ChevronLeft, ChevronRight, Globe, Mail, MapPin, Phone, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { brandStyle } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { mediaUrl } from "@/lib/media";
import { PRODUCT_NAME } from "../product-logo";
import type { PublicProfile } from "@/lib/types";
import { BookingFlow } from "./booking-flow";
import { GUEST_LOCALES, useGuestText } from "./i18n";

/**
 * The restaurant's public booking page, in the restaurant's colors. `embed` is the compact version
 * shown in an iframe on the restaurant's own website; `preview` is used by the settings screen.
 * Layout follows the width of the page itself (container queries), not of the screen.
 */
export function BookingPage({
  profile,
  embed = false,
  preview = false,
  className,
}: {
  profile: PublicProfile;
  embed?: boolean;
  preview?: boolean;
  className?: string;
}) {
  const ref = useEmbedHeight(embed);
  const { t, locale } = useGuestText();

  if (embed) {
    return (
      <div
        ref={ref}
        lang={locale}
        style={brandStyle(profile.page.brandColor)}
        className={cn("@container bg-surface", className)}
      >
        <div className="mx-auto flex max-w-xl flex-col gap-5 p-4">
          <div className="flex items-center gap-3">
            <Logo profile={profile} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{profile.name}</p>
              <p className="text-xs text-muted">{t.bookATable}</p>
            </div>
            {!preview && <LanguageSwitch embed />}
          </div>
          <BookingFlow profile={profile} preview={preview} />
          <Footer />
        </div>
      </div>
    );
  }

  const photos = profile.page.photoIds;
  return (
    <div
      lang={locale}
      style={brandStyle(profile.page.brandColor)}
      className={cn("@container bg-canvas", className)}
    >
      <Hero profile={profile} preview={preview} />
      <div className="mx-auto grid max-w-5xl gap-8 px-4 pb-12 @3xl:grid-cols-[minmax(0,1fr)_400px] @3xl:gap-10 @3xl:px-6">
        <aside className="relative -mt-6 min-w-0 @3xl:order-2 @3xl:-mt-28">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-xl shadow-black/5 @3xl:sticky @3xl:top-6">
            <h2 className="mb-5 text-lg font-semibold">{t.bookATable}</h2>
            <BookingFlow profile={profile} preview={preview} />
          </div>
        </aside>
        <main className="flex min-w-0 flex-col gap-8 @3xl:order-1 @3xl:pt-8">
          {profile.page.description && (
            <p className="whitespace-pre-line text-base leading-relaxed text-ink/85">
              {profile.page.description}
            </p>
          )}
          {photos.length > 0 && <Gallery photoIds={photos} name={profile.name} />}
          <Contacts profile={profile} />
        </main>
      </div>
      <Footer />
    </div>
  );
}

function Hero({ profile, preview }: { profile: PublicProfile; preview: boolean }) {
  const cover = profile.page.coverId;
  return (
    <header className="relative isolate overflow-hidden bg-[var(--brand)]">
      {!preview && (
        <div className="absolute right-3 top-3 z-10 @3xl:right-6">
          <LanguageSwitch dark />
        </div>
      )}
      {cover ? (
        <img src={mediaUrl(cover)} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgb(255_255_255/0.18),transparent_55%)]" />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/70 via-black/25 to-black/5" />
      <div className="mx-auto flex min-h-56 max-w-5xl items-end gap-4 px-4 pb-10 pt-16 @3xl:min-h-80 @3xl:px-6 @3xl:pb-12">
        <Logo profile={profile} size="lg" />
        <div className="min-w-0 text-white">
          <h1 className="text-2xl font-semibold tracking-tight [text-wrap:balance] @3xl:text-4xl">
            {profile.name}
          </h1>
          {(profile.city || profile.addressLine) && (
            <p className="mt-1 flex items-center gap-1 text-sm text-white/85">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">
                {[profile.addressLine, profile.city].filter(Boolean).join(", ")}
              </span>
            </p>
          )}
        </div>
      </div>
    </header>
  );
}

/** IT · EN: reloads the page with `?lang=` (and `embed=1` inside the restaurant's site). */
export function LanguageSwitch({ dark = false, embed = false }: { dark?: boolean; embed?: boolean }) {
  const { t, locale } = useGuestText();
  const href = (lang: string) => (embed ? `?embed=1&lang=${lang}` : `?lang=${lang}`);
  return (
    <nav
      aria-label={t.language}
      className={cn(
        "flex shrink-0 overflow-hidden rounded-full text-xs font-semibold",
        dark ? "bg-black/35 text-white backdrop-blur" : "border border-line text-muted",
      )}
    >
      {GUEST_LOCALES.map((l) => (
        <a
          key={l}
          href={href(l)}
          hrefLang={l}
          aria-current={l === locale ? "true" : undefined}
          className={cn(
            "px-2.5 py-1 uppercase",
            l === locale && (dark ? "bg-white/25" : "bg-[var(--brand)] text-[var(--brand-contrast)]"),
          )}
        >
          {l}
        </a>
      ))}
    </nav>
  );
}

export function Logo({ profile, size }: { profile: PublicProfile; size: "sm" | "lg" }) {
  const { t } = useGuestText();
  const box = size === "lg" ? "h-16 w-16 @3xl:h-20 @3xl:w-20 rounded-2xl" : "h-11 w-11 rounded-xl";
  if (profile.page.logoId) {
    return (
      <img
        src={mediaUrl(profile.page.logoId)}
        alt={t.logoAlt(profile.name)}
        className={cn(box, "shrink-0 bg-white object-contain p-1.5 shadow-md")}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        box,
        "flex shrink-0 items-center justify-center bg-white text-xl font-semibold text-[var(--brand-strong)] shadow-md",
      )}
    >
      {profile.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Gallery({ photoIds, name }: { photoIds: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const { t } = useGuestText();
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{t.thePlace}</h2>
      {/* First picture wide, the others fill rows of equal height whatever their number. */}
      <div className="flex flex-wrap gap-2">
        {photoIds.map((id, i) => (
          <button
            key={id}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={t.photo(i + 1, photoIds.length)}
            className={cn(
              "overflow-hidden rounded-xl bg-line",
              i === 0 ? "aspect-[16/9] w-full" : "h-32 min-w-36 flex-1 basis-[30%] @xl:h-40",
            )}
          >
            <img
              src={mediaUrl(id)}
              alt={t.photoAlt(name, i + 1)}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.03]"
            />
          </button>
        ))}
      </div>
      {open !== null && (
        <Lightbox photoIds={photoIds} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

function Lightbox({
  photoIds,
  index,
  onIndex,
  onClose,
}: {
  photoIds: string[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { t } = useGuestText();
  const step = (delta: number) => onIndex((index + delta + photoIds.length) % photoIds.length);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % photoIds.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + photoIds.length) % photoIds.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, photoIds.length, onIndex, onClose]);

  const nav = "absolute top-1/2 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25";
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={t.photos}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <img
        src={mediaUrl(photoIds[index]!)}
        alt=""
        className="max-h-[85vh] max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25"
      >
        <X className="h-5 w-5" />
      </button>
      {photoIds.length > 1 && (
        <>
          <button
            type="button"
            aria-label={t.previousPhoto}
            className={cn(nav, "left-4")}
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label={t.nextPhoto}
            className={cn(nav, "right-4")}
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}
    </div>
  );
}

function Contacts({ profile }: { profile: PublicProfile }) {
  const { t } = useGuestText();
  const address = [profile.addressLine, [profile.postalCode, profile.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const rows: { icon: ReactNode; content: ReactNode }[] = [];
  if (address) {
    rows.push({
      icon: <MapPin className="h-4 w-4" />,
      content: (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${profile.name}, ${address}`)}`}
          target="_blank"
          rel="noreferrer"
          className="hover:underline"
        >
          {address}
        </a>
      ),
    });
  }
  if (profile.phone) {
    rows.push({
      icon: <Phone className="h-4 w-4" />,
      content: (
        <a href={`tel:${profile.phone.replace(/\s/g, "")}`} className="hover:underline">
          {profile.phone}
        </a>
      ),
    });
  }
  if (profile.email) {
    rows.push({
      icon: <Mail className="h-4 w-4" />,
      content: (
        <a href={`mailto:${profile.email}`} className="hover:underline">
          {profile.email}
        </a>
      ),
    });
  }
  if (profile.website) {
    rows.push({
      icon: <Globe className="h-4 w-4" />,
      content: (
        <a href={profile.website} target="_blank" rel="noreferrer" className="hover:underline">
          {profile.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
        </a>
      ),
    });
  }
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{t.contacts}</h2>
      <ul className="flex flex-col gap-2.5 text-sm">
        {rows.map((row, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="mt-0.5 text-[var(--brand-strong)]">{row.icon}</span>
            <span className="min-w-0 break-words">{row.content}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Footer() {
  const { t } = useGuestText();
  return (
    <p className="pb-6 text-center text-xs text-muted">
      {t.poweredBy} {PRODUCT_NAME}
    </p>
  );
}

/** Inside an iframe, tells the parent page how tall the widget is (see the embed code). */
function useEmbedHeight(embed: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!embed || !element || window.parent === window) return;
    const post = () =>
      window.parent.postMessage({ type: "restourant:height", height: Math.ceil(element.offsetHeight) }, "*");
    const observer = new ResizeObserver(post);
    observer.observe(element);
    post();
    return () => observer.disconnect();
  }, [embed]);
  return ref;
}
