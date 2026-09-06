import React from "react";
import { ClipboardList } from "lucide-react";
import { ProfilePollAdminSection } from "./ProfilePollAdminSection";
import { SectionCollapsibleCard } from "@/components/layout";

export function ProfilePollAdminCollapsible({
  accordionValue = "admin-polls",
}: {
  accordionValue?: string;
}) {
  return (
    <SectionCollapsibleCard
      title="Profielpolls"
      icon={ClipboardList}
      accordionValue={accordionValue}
      contentClassName="pt-0"
    >
      <ProfilePollAdminSection />
    </SectionCollapsibleCard>
  );
}
