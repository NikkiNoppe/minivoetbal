export type ReglementBlock =
  | { type: "heading"; number: string; text: string }
  | { type: "article"; number: string; text: string };

export interface ReglementSection {
  id: string;
  title: string;
  blocks: ReglementBlock[];
}

export interface ReglementCopy {
  pageTitle: string;
  metaDescription: string;
  sections: ReglementSection[];
}

export interface ReglementOverrides {
  pageTitle?: string;
  metaDescription?: string;
  sectionTitles?: Record<string, string>;
  articles?: Record<string, string>;
  sections?: ReglementSection[];
}

export function applyReglementOverrides(
  base: ReglementCopy,
  overrides?: ReglementOverrides,
): ReglementCopy {
  if (!overrides) return base;

  if (overrides.sections) {
    return {
      pageTitle: overrides.pageTitle?.trim() || base.pageTitle,
      metaDescription: overrides.metaDescription?.trim() || base.metaDescription,
      sections: overrides.sections,
    };
  }

  return {
    pageTitle: overrides.pageTitle?.trim() || base.pageTitle,
    metaDescription: overrides.metaDescription?.trim() || base.metaDescription,
    sections: base.sections.map((section) => ({
      ...section,
      title: overrides.sectionTitles?.[section.id] ?? section.title,
      blocks: section.blocks.map((block) => {
        const next = overrides.articles?.[block.number];
        if (next === undefined) return block;
        return { ...block, text: next };
      }),
    })),
  };
}
