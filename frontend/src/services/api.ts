import type { Hazard, HazardsResponse, SourceMeta } from "@nearcast/shared";

export interface HazardData { hazards: Hazard[]; sources: SourceMeta[]; retrievedAt: string; mock: boolean }

export function isMockMode(): boolean {
  if (import.meta.env.VITE_USE_MOCK_DATA === "true") return true;
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search);
    if (q.get("demo") === "true" || q.get("mock") === "true") return true;
  }
  return false;
}

export async function loadMockHazards(): Promise<HazardData> {
  const mod = await import("../../../examples/mock-hazards.json");
  const body = (mod.default ?? mod) as unknown as HazardsResponse;
  return { hazards: body.data, sources: body.meta.sources, retrievedAt: body.meta.retrievedAt, mock: true };
}

export async function fetchLiveHazards(signal?: AbortSignal): Promise<HazardData> {
  const res = await fetch("/api/hazards?limit=2000", { signal, headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`Nearcast API responded with HTTP ${res.status}`);
  const body = (await res.json()) as HazardsResponse;
  if (!Array.isArray(body.data)) throw new Error("Unexpected API response shape");
  return { hazards: body.data, sources: body.meta.sources, retrievedAt: body.meta.retrievedAt, mock: false };
}

export async function fetchHazards(mock: boolean, signal?: AbortSignal): Promise<HazardData> {
  return mock ? loadMockHazards() : fetchLiveHazards(signal);
}
