import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useOrgAwareNavigate } from "@/hooks/useOrgAwareNavigate";
import { ADMIN_ROUTES } from "@/config/routes";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";

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
    <div className="flex min-h-[30vh] items-center justify-center" aria-busy="true">
      <LoadingSpinner />
      <span className="sr-only">Doorverwijzen naar seizoensplanning…</span>
    </div>
  );
};

export default SeasonPlanningRedirect;
