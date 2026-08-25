import React from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SECTION_COLLAPSIBLE_CONTENT,
  SECTION_COLLAPSIBLE_SURFACE,
  SECTION_COLLAPSIBLE_TRIGGER,
} from "@/components/layout/section-collapsible-styles";
import { SectionIcon } from "@/components/layout/section-icon";
import { cn } from "@/lib/utils";

interface SectionCollapsibleCardProps {
  id?: string;
  title: React.ReactNode;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Binnen ProfileSectionsAccordion: unieke waarde; sluit andere secties bij openen */
  accordionValue?: string;
  badge?: React.ReactNode;
  headerAction?: React.ReactNode;
  contentClassName?: string;
  itemClassName?: string;
  children: React.ReactNode;
}

function SectionHeaderContent({
  title,
  icon,
  badge,
}: Pick<SectionCollapsibleCardProps, "title" | "icon" | "badge">) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-x-2 gap-y-1 text-left flex-wrap">
      {icon ? <SectionIcon icon={icon} variant="compact" /> : null}
      <span className="truncate">{title}</span>
      {badge ? <span className="min-w-0 max-w-full">{badge}</span> : null}
    </span>
  );
}

function SectionAccordionTrigger({
  title,
  icon,
  badge,
  headerAction,
}: Pick<
  SectionCollapsibleCardProps,
  "title" | "icon" | "badge" | "headerAction"
>) {
  const trigger = (
    <AccordionTrigger
      className={cn(
        SECTION_COLLAPSIBLE_TRIGGER,
        headerAction && "flex-1 min-w-0 rounded-none rounded-tl-lg",
        !headerAction && "rounded-t-lg",
      )}
    >
      <SectionHeaderContent title={title} icon={icon} badge={badge} />
    </AccordionTrigger>
  );

  if (!headerAction) return trigger;

  return (
    <div className="flex w-full items-stretch">
      {trigger}
      <div className="flex shrink-0 items-center rounded-tr-lg border-l border-primary/10 px-3 py-2 sm:px-4">
        {headerAction}
      </div>
    </div>
  );
}

/**
 * Inklapbare content-sectie — zelfde trigger-hoogte/styling als ReglementPage.
 * Gebruik overal waar een accordion-achtige sectie nodig is (profiel, polls, …).
 */
export function SectionCollapsibleCard({
  id,
  title,
  icon: Icon,
  defaultOpen = false,
  open,
  onOpenChange,
  accordionValue,
  badge,
  headerAction,
  contentClassName,
  itemClassName,
  children,
}: SectionCollapsibleCardProps) {
  if (accordionValue) {
    return (
      <AccordionItem
        id={id}
        value={accordionValue}
        className={cn(SECTION_COLLAPSIBLE_SURFACE, itemClassName)}
      >
        <SectionAccordionTrigger
          title={title}
          icon={Icon}
          badge={badge}
          headerAction={headerAction}
        />
        <AccordionContent
          className={cn(SECTION_COLLAPSIBLE_CONTENT, contentClassName)}
        >
          {children}
        </AccordionContent>
      </AccordionItem>
    );
  }

  const collapsibleProps =
    open !== undefined ? { open, onOpenChange } : { defaultOpen };

  return (
    <Collapsible {...collapsibleProps}>
      <div className={SECTION_COLLAPSIBLE_SURFACE}>
        <div
          className={cn(
            "flex w-full",
            headerAction ? "items-stretch" : "items-center",
          )}
        >
          <CollapsibleTrigger
            className={cn(
              SECTION_COLLAPSIBLE_TRIGGER,
              "group",
              headerAction && "flex-1 min-w-0 rounded-none rounded-tl-lg",
              !headerAction && "rounded-t-lg",
            )}
          >
            <SectionHeaderContent title={title} icon={Icon} badge={badge} />
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
          {headerAction && (
            <div className="flex shrink-0 items-center rounded-tr-lg border-l border-primary/10 px-3 py-2 sm:px-4">
              {headerAction}
            </div>
          )}
        </div>
        <CollapsibleContent>
          <div className={cn(SECTION_COLLAPSIBLE_CONTENT, contentClassName)}>
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
