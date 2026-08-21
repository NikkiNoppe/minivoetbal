export type ReglementBlock =
  | { type: "heading"; number?: string; text: string }
  | { type: "article"; number: string; text: string }
  | { type: "paragraph"; text: string };

export interface ReglementSection {
  id: string;
  title: string;
  blocks: ReglementBlock[];
}

export interface ReglementPlayerHighlights {
  maxPlayers: string;
  transfers: string;
  inscription: string;
}

export interface ReglementCopy {
  pageTitle: string;
  metaDescription: string;
  versionLabel?: string;
  playerHighlights: ReglementPlayerHighlights;
  sections: ReglementSection[];
}

export interface ReglementOverrides {
  pageTitle?: string;
  metaDescription?: string;
  versionLabel?: string;
  playerHighlights?: Partial<ReglementPlayerHighlights>;
  sectionTitles?: Record<string, string>;
  articles?: Record<string, string>;
  sections?: ReglementSection[];
}

function mergePlayerHighlights(
  base: ReglementPlayerHighlights,
  override?: Partial<ReglementPlayerHighlights>,
): ReglementPlayerHighlights {
  return {
    maxPlayers: override?.maxPlayers?.trim() || base.maxPlayers,
    transfers: override?.transfers?.trim() || base.transfers,
    inscription: override?.inscription?.trim() || base.inscription,
  };
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
      versionLabel: overrides.versionLabel?.trim() || base.versionLabel,
      playerHighlights: mergePlayerHighlights(base.playerHighlights, overrides.playerHighlights),
      sections: overrides.sections,
    };
  }

  return {
    pageTitle: overrides.pageTitle?.trim() || base.pageTitle,
    metaDescription: overrides.metaDescription?.trim() || base.metaDescription,
    versionLabel: overrides.versionLabel?.trim() || base.versionLabel,
    playerHighlights: mergePlayerHighlights(base.playerHighlights, overrides.playerHighlights),
    sections: base.sections.map((section) => ({
      ...section,
      title: overrides.sectionTitles?.[section.id] ?? section.title,
      blocks: section.blocks.map((block) => {
        if (block.type !== "article") return block;
        const next = overrides.articles?.[block.number];
        if (next === undefined) return block;
        return { ...block, text: next };
      }),
    })),
  };
}
