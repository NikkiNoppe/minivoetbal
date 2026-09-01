import React, { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** In-content skeleton for lazy route chunks (keeps header/footer visible). */
export const RoutePageSkeleton = memo(() => (
  <div
    className={cn(
      "mx-auto w-full max-w-7xl space-y-4 px-4 py-8 sm:space-y-6 sm:px-6 lg:px-8",
      "animate-slide-up pb-6",
    )}
    aria-busy="true"
    aria-label="Pagina laden"
  >
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-56 w-full rounded-lg" />
    <div className="space-y-3">
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-12 w-full rounded-md" />
      <Skeleton className="h-12 w-full rounded-md" />
    </div>
  </div>
));
RoutePageSkeleton.displayName = "RoutePageSkeleton";

/** Skeleton for lazy admin dashboard tabs. */
export const AdminTabSkeleton = memo(() => (
  <div className="w-full space-y-4 sm:space-y-6" aria-busy="true" aria-label="Tab laden">
    <Skeleton className="h-8 w-40" />
    <div className="grid gap-3 sm:grid-cols-3">
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
    <Skeleton className="h-48 w-full rounded-lg" />
    <div className="space-y-2 md:hidden">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full rounded-lg" />
      ))}
    </div>
  </div>
));
AdminTabSkeleton.displayName = "AdminTabSkeleton";
