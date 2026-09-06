import React from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  SECTION_COLLAPSIBLE_CONTENT,
  SECTION_COLLAPSIBLE_SURFACE,
  SECTION_COLLAPSIBLE_TRIGGER,
} from "@/components/layout/section-collapsible-styles";
import { cn } from "@/lib/utils";

interface MatchFormSectionCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  children: React.ReactNode;
  contentId?: string;
  contentClassName?: string;
  trailing?: React.ReactNode;
  /** Compact header + tighter padding for dense forms (e.g. Wedstrijdinfo) */
  compact?: boolean;
}

export function MatchFormSectionCard({
  open,
  onOpenChange,
  title,
  children,
  contentId,
  contentClassName,
  trailing,
  compact = false,
}: MatchFormSectionCardProps) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <div className={SECTION_COLLAPSIBLE_SURFACE}>
        <CollapsibleTrigger
          className={cn(
            SECTION_COLLAPSIBLE_TRIGGER,
            "group rounded-t-lg",
            compact && "min-h-[44px] py-3 text-sm",
          )}
        >
          <span className="flex items-center gap-2 min-w-0 flex-1 text-left font-semibold">
            {title}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {trailing}
            <ChevronDown
              className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </div>
        </CollapsibleTrigger>
        {children != null && children !== false && (
        <CollapsibleContent id={contentId}>
          <div className={cn(SECTION_COLLAPSIBLE_CONTENT, contentClassName)}>
            {children}
          </div>
        </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}
