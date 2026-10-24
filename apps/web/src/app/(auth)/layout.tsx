import type { ReactNode } from "react";
import { ProductLogo } from "@/components/product-logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <ProductLogo size="lg" className="mb-8 justify-center" />
        {children}
      </div>
    </main>
  );
}
