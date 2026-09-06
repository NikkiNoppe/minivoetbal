import React, { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  SectionCollapsibleCard,
  useProfileAccordionItem,
} from "@/components/layout";
import { TeamManagerSchorsingenPanel } from "@/components/pages/admin/schorsingen/TeamManagerSchorsingenPanel";
import { useSuspensionsData } from "@/domains/cards-suspensions";

interface ProfileTeamSuspensionsCardProps {
  teamId: number;
  teamName?: string;
  accordionValue?: string;
  onRequestOpen?: () => void;
}

export function ProfileTeamSuspensionsCard({
  teamId,
  teamName,
  accordionValue = "schorsingen",
  onRequestOpen,
}: ProfileTeamSuspensionsCardProps) {
  const location = useLocation();
  const { suspensions } = useSuspensionsData();
  const isOpen = useProfileAccordionItem(accordionValue);

  const activeCount = useMemo(
    () =>
      (suspensions ?? []).filter(
        (s) => s.teamId === teamId && s.status === "active",
      ).length,
    [suspensions, teamId],
  );

  const didAutoOpenRef = useRef(false);

  useEffect(() => {
    if (location.hash === "#schorsingen") {
      didAutoOpenRef.current = true;
      onRequestOpen?.();
      const timer = window.setTimeout(() => {
        document
          .getElementById("profile-schorsingen")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return () => window.clearTimeout(timer);
    }
  }, [location.hash, onRequestOpen]);

  useEffect(() => {
    if (didAutoOpenRef.current || activeCount <= 0) return;
    didAutoOpenRef.current = true;
    onRequestOpen?.();
  }, [activeCount, onRequestOpen]);

  const headerBadge =
    activeCount > 0 ? (
      <Badge variant="destructive" className="text-xs">
        {activeCount} actief
      </Badge>
    ) : undefined;

  return (
    <SectionCollapsibleCard
      id="profile-schorsingen"
      itemClassName="scroll-mt-24"
      accordionValue={accordionValue}
      title="Schorsingen"
      icon={Ban}
      badge={headerBadge}
      contentClassName="!p-0"
    >
      {isOpen ? (
        <TeamManagerSchorsingenPanel
          teamId={teamId}
          teamName={teamName}
          embedded
        />
      ) : null}
    </SectionCollapsibleCard>
  );
}
