import type { Hazard, SourceMeta } from "@nearcast/shared";
import type { SourceAdapter } from "../domain/hazard.ts";
import { usgsAdapter } from "../adapters/us/earthquakes.ts";
import { nwsAdapter } from "../adapters/us/weather.ts";
import { nifcAdapter } from "../adapters/us/wildfires.ts";
import { ecccAdapter } from "../adapters/canada/weather.ts";
import { cwfisAdapter } from "../adapters/canada/wildfires.ts";
import { nrcanAdapter } from "../adapters/canada/earthquakes.ts";
import { log, errorMessage } from "../utils/logging.ts";
import { DEFAULT_SOURCE_TIMEOUT_MS } from "../utils/fetch.ts";

export const ALL_ADAPTERS: SourceAdapter[] = [ecccAdapter, cwfisAdapter, nrcanAdapter, nwsAdapter, nifcAdapter, usgsAdapter];

export interface SourceRun { meta: SourceMeta; hazards: Hazard[] }

/** Last successful result per source, kept in the warm container so a slow/failed feed serves stale data instead of nothing. */
const lastGood = new Map<string, SourceRun>();
const STALE_MAX_AGE_MS = Number(process.env.STALE_MAX_AGE_MINUTES || 180) * 60_000;

export function clearLastGood(): void { lastGood.clear(); }

/** Run one adapter, never throwing: failures become `SourceMeta.status`. */
export async function runAdapter(adapter: SourceAdapter, now: Date, timeoutMs = DEFAULT_SOURCE_TIMEOUT_MS): Promise<SourceRun> {
  const started = Date.now();
  const base = { id: adapter.id, agency: adapter.agency, country: adapter.country };
  try {
    const result = await adapter.fetch({ now, timeoutMs });
    const durationMs = Date.now() - started;
    const run: SourceRun = {
      hazards: result.hazards,
      meta: { ...base, status: "available", retrievedAt: now.toISOString(), sourceUpdatedAt: result.sourceUpdatedAt, durationMs, count: result.hazards.length },
    };
    if (result.hazards.length > 0) lastGood.set(adapter.id, run);
    return run;
  } catch (e) {
    const durationMs = Date.now() - started;
    const message = errorMessage(e);
    const status: SourceMeta["status"] = message === "timeout" ? "timeout" : "error";
    const previous = lastGood.get(adapter.id);
    const previousAge = previous?.meta.retrievedAt ? now.getTime() - new Date(previous.meta.retrievedAt).getTime() : Infinity;
    if (previous && previousAge <= STALE_MAX_AGE_MS) {
      log.warn("source failed, serving stale snapshot", { source: adapter.id, status, error: message, durationMs, staleMinutes: Math.round(previousAge / 60_000) });
      return { hazards: previous.hazards, meta: { ...previous.meta, status: "stale", durationMs, error: `${message}; serving snapshot from ${previous.meta.retrievedAt}` } };
    }
    log.warn("source failed", { source: adapter.id, status, error: message, durationMs });
    return { hazards: [], meta: { ...base, status, durationMs, count: 0, error: message } };
  }
}

/** Fetch every source concurrently; each fails independently. */
export async function runAdapters(adapters: SourceAdapter[], now: Date, timeoutMs?: number): Promise<SourceRun[]> {
  const settled = await Promise.allSettled(adapters.map((a) => runAdapter(a, now, timeoutMs)));
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : { hazards: [], meta: { id: adapters[i].id, agency: adapters[i].agency, country: adapters[i].country, status: "error", error: errorMessage(s.reason) } },
  );
}
