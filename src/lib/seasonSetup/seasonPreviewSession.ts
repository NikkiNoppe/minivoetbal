/**
 * Module-level seizoenspreview-sessie: blijft bestaan bij tab/page-switch
 * (LazyTabContent unmount) en laat generatie op de achtergrond doorlopen.
 */

import type { SeasonPlan } from "@/lib/seasonCalendar";
import type { SeasonSetup } from "./types";
import {
  buildUnifiedSeasonPreview,
  type UnifiedSeasonPreview,
} from "./buildUnifiedPreview";

export type SeasonPreviewProgress = {
  percent: number;
  label: string;
};

export type SeasonPreviewSessionState = {
  organizationId: number | null;
  preview: UnifiedSeasonPreview | null;
  error: string | null;
  loading: boolean;
  progress: SeasonPreviewProgress | null;
  /** Verhoogt bij elke nieuwe run; oude runs negeren hun resultaat. */
  runId: number;
};

type Listener = () => void;

let state: SeasonPreviewSessionState = {
  organizationId: null,
  preview: null,
  error: null,
  loading: false,
  progress: null,
  runId: 0,
};

const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

export function getSeasonPreviewSession(): SeasonPreviewSessionState {
  return state;
}

export function subscribeSeasonPreviewSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function patchSession(partial: Partial<SeasonPreviewSessionState>): void {
  state = { ...state, ...partial };
  emit();
}

export function clearSeasonPreviewSession(): void {
  state = {
    ...state,
    preview: null,
    error: null,
    loading: false,
    progress: null,
    runId: state.runId + 1,
  };
  emit();
}

type TeamLike = { team_id: number; team_name: string };

export type RunSeasonPreviewInput = {
  organizationId: number;
  setup: SeasonSetup;
  seasonStart: string;
  seasonEnd: string;
  teams: TeamLike[];
  plan: SeasonPlan | null;
  allowDualMatchWeek?: boolean;
  /** Optioneel: vóór packing (bv. cache clear + plan rebuild). */
  prepare?: () => Promise<SeasonPlan | null>;
};

/**
 * Start preview-generatie in de module-store. Safe om te callen vanuit een
 * pagina die daarna unmount — resultaat blijft in de sessie.
 */
export async function runSeasonPreviewGeneration(
  input: RunSeasonPreviewInput,
): Promise<UnifiedSeasonPreview | null> {
  const runId = state.runId + 1;
  patchSession({
    runId,
    organizationId: input.organizationId,
    loading: true,
    error: null,
    // Oude preview behouden tot nieuwe klaar is (geen flits naar leeg)
    progress: { percent: 3, label: "Voorbereiden…" },
  });

  const isCurrent = () => state.runId === runId;

  try {
    let plan = input.plan;
    if (input.prepare) {
      patchSession({
        progress: { percent: 8, label: "Seizoensplan vernieuwen…" },
      });
      plan = await input.prepare();
      if (!isCurrent()) return null;
    }

    const result = await buildUnifiedSeasonPreview({
      setup: input.setup,
      seasonStart: input.seasonStart,
      seasonEnd: input.seasonEnd,
      organizationId: input.organizationId,
      teams: input.teams,
      plan,
      allowDualMatchWeek: input.allowDualMatchWeek,
      onProgress: (p) => {
        if (!isCurrent()) return;
        patchSession({ progress: p });
      },
    });

    if (!isCurrent()) return null;

    patchSession({
      preview: result,
      loading: false,
      progress: { percent: 100, label: "Klaar" },
      error: null,
    });
    // Kort 100% tonen, daarna progress clearen
    setTimeout(() => {
      if (state.runId === runId && !state.loading) {
        patchSession({ progress: null });
      }
    }, 600);
    return result;
  } catch (e) {
    if (!isCurrent()) return null;
    const msg = e instanceof Error ? e.message : "Onbekende fout";
    patchSession({
      loading: false,
      progress: null,
      error: msg,
      preview: null,
    });
    throw e;
  }
}
