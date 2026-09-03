import type { Hazard, SourceMeta } from "@nearcast/shared";
import type { SourceAdapter } from "../domain/hazard.ts";
import { ALL_ADAPTERS, runAdapters } from "./source-service.ts";
import { log } from "../utils/logging.ts";

export interface HazardSnapshot {
  hazards: Hazard[];
  sources: SourceMeta[];
  retrievedAt: string;
}

export interface LoadOptions {
  adapters?: SourceAdapter[];
  now?: Date;
  timeoutMs?: number;
  /** Warm-container memoization so bursts of cache misses do not re-hit upstream feeds. */
  cacheTtlMs?: number;
}

const DEFAULT_CACHE_TTL_MS = Number(process.env.SNAPSHOT_CACHE_SECONDS || 45) * 1000;

let cached: { snapshot: HazardSnapshot; expiresAt: number; key: string } | null = null;
let inflight: Promise<HazardSnapshot> | null = null;

export function clearSnapshotCache(): void { cached = null; inflight = null; }

export async function loadHazards(opts: LoadOptions = {}): Promise<HazardSnapshot> {
  const adapters = opts.adapters ?? ALL_ADAPTERS;
  const key = adapters.map((a) => a.id).join(",");
  const ttl = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const nowMs = Date.now();
  if (cached && cached.key === key && cached.expiresAt > nowMs) return cached.snapshot;
  if (inflight) return inflight;
  inflight = (async () => {
    const now = opts.now ?? new Date();
    const runs = await runAdapters(adapters, now, opts.timeoutMs);
    const hazards = dedupe(runs.flatMap((r) => r.hazards));
    const snapshot: HazardSnapshot = { hazards, sources: runs.map((r) => r.meta), retrievedAt: now.toISOString() };
    log.info("snapshot built", {
      count: hazards.length,
      sources: snapshot.sources.map((s) => ({ id: s.id, status: s.status, count: s.count, durationMs: s.durationMs })),
    });
    if (ttl > 0) cached = { snapshot, expiresAt: Date.now() + ttl, key };
    return snapshot;
  })();
  try { return await inflight; } finally { inflight = null; }
}

function dedupe(hazards: Hazard[]): Hazard[] {
  const seen = new Set<string>();
  const out: Hazard[] = [];
  for (const h of hazards) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
  }
  return out;
}
