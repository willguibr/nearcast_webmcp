import type { AwarenessSnapshot, AwarenessSource } from "@nearcast/shared";
import { AWARENESS_ADAPTERS, sourceInfo, type AwarenessAdapter, type ParsedItems } from "../adapters/canada/awareness.ts";

interface Run extends ParsedItems { source: AwarenessSource }
/** Independent caches prevent one unavailable provider from hiding the other feeds. */
export function createAwarenessLoader(adapters: AwarenessAdapter[] = AWARENESS_ADAPTERS) {
  const cache = new Map<string, { data: ParsedItems; retrievedAt: string; expiresAt: number }>();
  const inflight = new Map<string, Promise<Run>>();
  const STALE_LIMIT_MS = 30 * 60_000;

  async function run(adapter: AwarenessAdapter, now: Date): Promise<Run> {
    const previous = cache.get(adapter.id), checkedAt = now.toISOString();
    const base = { ...sourceInfo(adapter), checkedAt };
    if (previous && now.getTime() < previous.expiresAt) return {
      ...previous.data, source: { ...base, status: previous.data.rejectedCount ? "partial" : "available",
        retrievedAt: previous.retrievedAt, count: previous.data.items.length, rejectedCount: previous.data.rejectedCount },
    };
    if (inflight.has(adapter.id)) return inflight.get(adapter.id)!;
    const work = (async (): Promise<Run> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(new Error("Source deadline exceeded")), 20_000);
      try {
        const data = await adapter.fetch(now, controller.signal);
        // Successful empty snapshots replace old records; otherwise a later failure resurrects ended notices.
        cache.set(adapter.id, { data, retrievedAt: checkedAt, expiresAt: now.getTime() + adapter.ttlMs });
        return { ...data, source: { ...base, retrievedAt: checkedAt, status: data.rejectedCount ? "partial" : "available",
          count: data.items.length, rejectedCount: data.rejectedCount } };
      } catch (e) {
        const error = e instanceof Error ? e.message : "Source unavailable";
        if (previous && now.getTime() - Date.parse(previous.retrievedAt) <= STALE_LIMIT_MS) return {
          ...previous.data, source: { ...base, status: "stale", retrievedAt: previous.retrievedAt,
            count: previous.data.items.length, rejectedCount: previous.data.rejectedCount, error },
        };
        return { items: [], rejectedCount: 0, source: { ...base, status: "error", count: 0, rejectedCount: 0, error } };
      } finally { clearTimeout(timeout); }
    })();
    inflight.set(adapter.id, work);
    try { return await work; } finally { inflight.delete(adapter.id); }
  }

  return async (now = new Date()): Promise<AwarenessSnapshot> => {
    const runs = await Promise.all(adapters.map((a) => run(a, now)));
    return { items: runs.flatMap((r) => r.items), sources: runs.map((r) => r.source), retrievedAt: now.toISOString(), demo: false };
  };
}

export const loadAwareness = createAwarenessLoader();
