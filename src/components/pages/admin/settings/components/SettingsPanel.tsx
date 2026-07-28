import React from "react";
import {
  Settings,
  Building,
  ShieldAlert,
  Archive,
  type LucideIcon,
} from "lucide-react";
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { SectionAccordionItem, SectionIcon } from "@/components/layout";
import PlayerListLockSettings from "@/components/pages/admin/settings/components/PlayerListLockSettings";
import VenuesSettings from "@/components/pages/admin/settings/components/VenuesSettings";
import TimeslotsSettings from "@/components/pages/admin/settings/components/TimeslotsSettings";
import VacationsSettings from "@/components/pages/admin/settings/components/VacationsSettings";
import SeasonDataSettings from "@/components/pages/admin/settings/components/SeasonDataSettings";
import MatchFormSettings from "@/components/pages/admin/settings/components/MatchFormSettings";
import { SuspensionRulesSettings } from "@/components/pages/admin/settings/components/SuspensionRulesSettings";
import ManualArchiveSettings from "@/components/pages/admin/settings/components/ManualArchiveSettings";

function GroupHeading({
  icon,
  title,
  description,
  badge,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 items-start gap-3 text-left">
      <SectionIcon icon={icon} variant="group" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="block truncate text-sm font-semibold text-brand-dark">{title}</span>
          <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px] font-medium">
            {badge}
          </Badge>
        </span>
        <span className="mt-1 block text-xs font-normal leading-relaxed normal-case tracking-normal text-muted-foreground">
          {description}
        </span>
      </span>
    </span>
  );
}

const AdminSettingsPanel: React.FC = () => {
  return (
    <div className="space-y-4 sm:space-y-6 animate-slide-up pb-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <SectionIcon icon={Settings} variant="compact" />
          Organisatie-instellingen
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight text-brand-dark sm:text-3xl">
            Instellingen per competitie
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Beheer de tenant-specifieke speelomgeving (zalen en tijdslots blijven
            seizoenonafhankelijk; wijzigingen doe je manueel), de seizoensperiode, regels en
            historisch archief.
          </p>
        </div>
      </div>

      <Accordion type="single" collapsible className="space-y-4">
        <SectionAccordionItem
          value="season-environment"
          triggerContent={
            <GroupHeading
              icon={Building}
              title="Seizoen & Speelomgeving"
              description="Seizoensperiode en uitzonderingen; sportzalen en tijdslots blijven behouden over seizoenen heen."
              badge="4 onderdelen"
            />
          }
          contentClassName="space-y-4"
          itemClassName="border-primary/20 shadow-sm hover:shadow-md transition-shadow duration-200"
        >
          <SeasonDataSettings />
          <VenuesSettings />
          <TimeslotsSettings />
          <VacationsSettings />
        </SectionAccordionItem>

        <SectionAccordionItem
          value="rules-forms"
          triggerContent={
            <GroupHeading
              icon={ShieldAlert}
              title="Regels & Formulieren"
              description="Schorsingen, spelerslijst-lock en wedstrijdformulierregels."
              badge="3 onderdelen"
            />
          }
          contentClassName="space-y-4"
          itemClassName="border-primary/20 shadow-sm hover:shadow-md transition-shadow duration-200"
        >
          <SuspensionRulesSettings />
          <PlayerListLockSettings />
          <MatchFormSettings />
        </SectionAccordionItem>

        <SectionAccordionItem
          value="historical-archive"
          triggerContent={
            <GroupHeading
              icon={Archive}
              title="Historisch archief"
              description="Vul voorgaande seizoenen manueel aan voor de publieke Archief-pagina (klassement, beker, play-offs)."
              badge="historie"
            />
          }
          contentClassName="space-y-4"
          itemClassName="border-primary/20 shadow-sm hover:shadow-md transition-shadow duration-200"
        >
          <ManualArchiveSettings />
        </SectionAccordionItem>
      </Accordion>
    </div>
  );
};

export default AdminSettingsPanel;
