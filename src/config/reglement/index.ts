import type { ReglementCopy } from "./types";
import { HARELBEKE_REGLEMENT } from "./harelbeke";
import { KUURNE_REGLEMENT } from "./kuurne";

export type {
  ReglementBlock,
  ReglementCopy,
  ReglementOverrides,
  ReglementPlayerHighlights,
  ReglementSection,
} from "./types";
export { applyReglementOverrides } from "./types";

const BY_SLUG: Record<string, ReglementCopy> = {
  harelbeke: HARELBEKE_REGLEMENT,
  kuurne: KUURNE_REGLEMENT,
};

export function resolveReglementCopy(slug: string): ReglementCopy {
  return BY_SLUG[slug] ?? HARELBEKE_REGLEMENT;
}
