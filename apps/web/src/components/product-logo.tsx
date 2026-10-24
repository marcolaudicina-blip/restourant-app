import { UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/cn";

/** The product's name, in one place for the app, the sign-in pages and the booking pages. */
export const PRODUCT_NAME = "TwentyReserve";

/** Mark + name. Replace the icon here when the real logo is ready. */
export function ProductLogo({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 text-brand-700", className)}>
      <UtensilsCrossed className={size === "lg" ? "h-7 w-7" : "h-6 w-6"} aria-hidden />
      <span className={cn("font-semibold tracking-tight", size === "lg" ? "text-xl" : "text-lg")}>
        {PRODUCT_NAME}
      </span>
    </span>
  );
}
