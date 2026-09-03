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

/** Run one adapter, never throwing: failures become `SourceMeta.status`. */
export async function runAdapter(adapter: SourceAdapter, now: Date, timeoutMs = DEFAULT_SOURCE_TIMEOUT_MS): Promise<SourceRun> {
  const started = Date.now();
  const base = { id: adapter.id, agency: adapter.agency, country: adapter.country };
  try {
    const result = await adapter.fetch({ now, timeoutMs });
    const durationMs = Date.now() - started;
    return {
      hazards: result.hazards,
      meta: { ...base, status: "available", retrievedAt: now.toISOString(), sourceUpdatedAt: result.sourceUpdatedAt, durationMs, count: result.hazards.length },
    };
  } catch (e) {
    const durationMs = Date.now() - started;
    const message = errorMessage(e);
    const status: SourceMeta["status"] = message === "timeout" ? "timeout" : "error";
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
