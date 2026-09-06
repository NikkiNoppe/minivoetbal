import { cn } from "@/lib/utils";

/** Mini icon-knop voor de tenant-debugbalk. */
export function devMiniButtonClass(isActive: boolean, extra?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-md border font-semibold transition-colors",
    "min-h-[36px] min-w-[44px] px-2",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-45",
    isActive
      ? "border-brand-600 bg-brand-600 text-white"
      : "border-amber-400 bg-white text-amber-950 hover:bg-amber-100",
    extra,
  );
}
