import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useOrgAwareNavigate } from "@/hooks/useOrgAwareNavigate";
import { ADMIN_ROUTES } from "@/config/routes";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Redirect oude speelformaat-routes (/admin/competition, /cup, /playoffs, …)
 * naar Seizoensplanning (behoudt ?org= via useOrgAwareNavigate).
 */
const SeasonPlanningRedirect: React.FC = () => {
  const navigate = useOrgAwareNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.delete("tab");
    const qs = params.toString();
    navigate(
      qs
        ? `${ADMIN_ROUTES["season-planning"]}?${qs}`
        : ADMIN_ROUTES["season-planning"],
      { replace: true },
    );
  }, [navigate, searchParams]);

  return (
    <div className="space-y-3 py-8" aria-busy="true" aria-label="Doorverwijzen naar seizoensplanning">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-full max-w-md" />
      <span className="sr-only">Doorverwijzen naar seizoensplanning…</span>
    </div>
  );
};

export default SeasonPlanningRedirect;
