import { cn } from "@/lib/cn";

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Caricamento"
      className={cn(
        "inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent",
        className,
      )}
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center text-brand-600">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
