import type { CountryCode, Hazard, SourceId } from "@nearcast/shared";

export interface AdapterResult {
  hazards: Hazard[];
  /** Freshness declared by the upstream feed, when available. */
  sourceUpdatedAt?: string;
}

export interface AdapterContext {
  now: Date;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface SourceAdapter {
  id: SourceId;
  agency: string;
  country: CountryCode;
  fetch(ctx: AdapterContext): Promise<AdapterResult>;
}

export function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

export function clampText(s: string | undefined, max = 4000): string | undefined {
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
