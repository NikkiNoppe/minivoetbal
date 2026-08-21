import React from "react";
import { BookOpen } from "lucide-react";
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

function ReglementBlockView({ block }: { block: ReglementBlock }) {
  if (block.type === "heading") {
    return (
      <h3 className="pl-[14px] flex items-start font-semibold text-foreground mt-2">
        <span className="min-w-[2.5rem] font-bold flex-shrink-0">{block.number}</span>
        <span className="block flex-1">{block.text}</span>
      </h3>
    );
  }

  return (
    <p className="pl-[14px] flex items-start">
      <span className="min-w-[2.5rem] font-bold flex-shrink-0">{block.number}</span>
      <span className="block flex-1 text-justify whitespace-pre-line">{block.text}</span>
    </p>
  );
}

const ReglementPage: React.FC = () => {
  const { organizationSlug } = useOrganization();
  const { reglement } = useOrganizationContent();

  return (
    <PublicPage>
      <PageHeader title={reglement.pageTitle} icon={BookOpen} />

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
              value={section.title}
              className={SECTION_COLLAPSIBLE_SURFACE}
            >
              <AccordionTrigger className={SECTION_COLLAPSIBLE_TRIGGER}>
                <span className="text-left flex-1">{section.title}</span>
              </AccordionTrigger>
              <AccordionContent className={SECTION_COLLAPSIBLE_CONTENT}>
                <div className="space-y-3">
                  {section.blocks.map((block) => (
                    <ReglementBlockView key={block.number} block={block} />
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
