import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export interface SeasonStepSectionProps {
  step: number;
  title: string;
  headingId: string;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}

const SeasonStepSection: React.FC<SeasonStepSectionProps> = ({
  step,
  title,
  headingId,
  defaultOpen = true,
  className,
  contentClassName,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section aria-labelledby={headingId} className={className}>
      <Collapsible open={open} onOpenChange={setOpen} className="space-y-3">
        <h3
          id={headingId}
          className="m-0 border-b border-primary/15 pb-3 font-semibold"
        >
          <CollapsibleTrigger
            type="button"
            className={cn(
              "group flex w-full items-center justify-between gap-3",
              "min-h-[44px] rounded-md text-left cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Stap {step}
              </span>
              <span className="text-base font-semibold text-brand-dark">
                {title}
              </span>
            </span>
            <ChevronDown
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 motion-safe:group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </CollapsibleTrigger>
        </h3>
        <CollapsibleContent className={contentClassName}>
          {children}
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
};

export default React.memo(SeasonStepSection);
