import React from "react";
import { BookOpen, FileDown } from "lucide-react";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { PageHeader, PublicPage } from "@/components/layout";
import {
  SECTION_COLLAPSIBLE_CONTENT,
  SECTION_COLLAPSIBLE_SURFACE,
  SECTION_COLLAPSIBLE_TRIGGER,
} from "@/components/layout/section-collapsible-styles";
import { useOrganizationContent } from "@/hooks/useOrganizationContent";
import { useOrganization } from "@/hooks/useOrganization";
import type { ReglementBlock } from "@/config/reglement";

const NUMBER_CLASS = "min-w-[2.75rem] font-bold flex-shrink-0 tabular-nums";

function ReglementBlockView({ block }: { block: ReglementBlock }) {
  if (block.type === "heading") {
    return (
      <h3 className="pl-[14px] flex items-start font-semibold text-foreground mt-3 first:mt-0">
        {block.number ? <span className={NUMBER_CLASS}>{block.number}</span> : null}
        <span className="block flex-1">{block.text}</span>
      </h3>
    );
  }

  if (block.type === "paragraph") {
    return <p className="pl-[14px] text-justify whitespace-pre-line">{block.text}</p>;
  }

  if (block.type === "download") {
    return (
      <div className="pl-[14px]">
        <a
          href={block.href}
          download
          className="flex min-h-[52px] w-full items-center gap-3 rounded-lg bg-primary px-3 py-2.5 text-left no-underline shadow-md transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:max-w-md"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-background text-primary">
            <FileDown className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-primary-foreground">{block.label}</span>
            <span className="block text-xs font-medium text-primary-foreground/80">PDF downloaden</span>
          </span>
        </a>
      </div>
    );
  }

  return (
    <p className="pl-[14px] flex items-start">
      <span className={NUMBER_CLASS}>{block.number}</span>
      <span className="block flex-1 text-justify whitespace-pre-line">{block.text}</span>
    </p>
  );
}

const ReglementPage: React.FC = () => {
  const { organizationSlug } = useOrganization();
  const { reglement } = useOrganizationContent();

  return (
    <PublicPage>
      <PageHeader
        title={reglement.pageTitle}
        subtitle={reglement.versionLabel}
        icon={BookOpen}
      />

      <section aria-label="Competitiereglement" className="max-w-3xl mx-auto w-full">
        <Accordion
          key={organizationSlug}
          type="single"
          collapsible
          defaultValue=""
          className="space-y-3"
        >
          {reglement.sections.map((section) => (
            <AccordionItem
              key={section.id}
              value={section.id}
              className={SECTION_COLLAPSIBLE_SURFACE}
            >
              <AccordionTrigger className={SECTION_COLLAPSIBLE_TRIGGER}>
                <span className="text-left flex-1">{section.title}</span>
              </AccordionTrigger>
              <AccordionContent className={SECTION_COLLAPSIBLE_CONTENT}>
                <div className="space-y-3">
                  {section.blocks.map((block, index) => (
                    <ReglementBlockView
                      key={`${block.type}-${"number" in block ? block.number : index}-${index}`}
                      block={block}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </PublicPage>
  );
};

export default ReglementPage;
