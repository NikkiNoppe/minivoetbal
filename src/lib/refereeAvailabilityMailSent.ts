/** Per-maand tracking: wie kreeg beschikbaarheid-mail (lokaal, per org). */

const STORAGE_KEY = "scheids-availability-mail-sent-v1";

type StoreShape = Record<string, number[]>;

function monthBucketKey(organizationId: number | null | undefined, month: string): string {
  const org = organizationId != null ? String(organizationId) : "default";
  return `${org}:${month}`;
}

function readStore(): StoreShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoreShape;
  } catch {
    return {};
  }
}

function writeStore(store: StoreShape) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota / private mode
  }
}

export function loadAvailabilityMailSentUserIds(
  month: string,
  organizationId?: number | null,
): Set<number> {
  const key = monthBucketKey(organizationId, month);
  const ids = readStore()[key];
  if (!Array.isArray(ids)) return new Set();
  return new Set(ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id)));
}

export function markAvailabilityMailSentUserIds(
  month: string,
  userIds: number[],
  organizationId?: number | null,
): Set<number> {
  const key = monthBucketKey(organizationId, month);
  const store = readStore();
  const next = new Set(store[key] ?? []);
  for (const id of userIds) {
    if (Number.isFinite(id)) next.add(id);
  }
  store[key] = Array.from(next);
  writeStore(store);
  return next;
}
