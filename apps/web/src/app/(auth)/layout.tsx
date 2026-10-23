import type { ReactNode } from "react";
import { UtensilsCrossed } from "lucide-react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2 text-brand-700">
          <UtensilsCrossed className="h-7 w-7" />
          <span className="text-xl font-semibold tracking-tight">Restourant</span>
        </div>
        {children}
      </div>
    </main>
  );
}
