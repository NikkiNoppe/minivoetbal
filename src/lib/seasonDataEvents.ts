/** Event wanneer Instellingen seizoensdata wijzigen (vakantie, slots, …). */

export const SEASON_DATA_CHANGED_EVENT = "minivoetbal:season-data-changed";

export type SeasonDataChangedDetail = {
  organizationId?: number;
  source?: string;
};

export function emitSeasonDataChanged(detail: SeasonDataChangedDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SEASON_DATA_CHANGED_EVENT, { detail }),
  );
}
