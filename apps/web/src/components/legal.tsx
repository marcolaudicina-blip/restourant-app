import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME, ProductLogo } from "./product-logo";
import { COMPANY, CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/site";

/** Layout of the legal pages of the showcase site: readable text, links to the other pages. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/sito" aria-label={PRODUCT_NAME} className="text-brand-700">
            <ProductLogo />
          </Link>
          <Link href="/login" className="text-sm font-medium text-brand-700 hover:underline">
            Accedi
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Ultimo aggiornamento: {LEGAL_UPDATED}</p>
        <article className="mt-8 flex flex-col gap-4 text-[15px] leading-relaxed [&_a]:text-brand-700 [&_a]:underline [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
          {children}
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-5 py-8 text-sm text-muted">
        <nav className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/privacy" className="hover:text-brand-700">
            Privacy e cookie
          </Link>
          <Link href="/termini" className="hover:text-brand-700">
            Termini di servizio
          </Link>
          <Link href="/trattamento-dati" className="hover:text-brand-700">
            Trattamento dei dati (art. 28)
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-brand-700">
            {CONTACT_EMAIL}
          </a>
        </nav>
        <p>
          {PRODUCT_NAME} · {COMPANY.name} · P. IVA {COMPANY.vatId}
        </p>
      </div>
    </footer>
  );
}

/** "Mario Rossi, Via Roma 1, Palermo, P. IVA …, email …" */
export function CompanyDetails() {
  return (
    <>
      <strong>{COMPANY.name}</strong>, {COMPANY.address}, P. IVA {COMPANY.vatId}, email{" "}
      <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      {COMPANY.pec && (
        <>
          , PEC <a href={`mailto:${COMPANY.pec}`}>{COMPANY.pec}</a>
        </>
      )}
    </>
  );
}
