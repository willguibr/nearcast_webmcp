import type { DisplaySignificance, HazardSeverity } from "./hazard.ts";

export const SEVERITY_ORDER: HazardSeverity[] = ["info", "minor", "moderate", "severe", "extreme"];

/** Rank for comparisons. `unknown` ranks below every issued level. */
export function severityRank(s: HazardSeverity): number {
  const i = SEVERITY_ORDER.indexOf(s);
  return i === -1 ? -1 : i;
}

export function isSeverity(v: unknown): v is HazardSeverity {
  return v === "unknown" || (typeof v === "string" && SEVERITY_ORDER.includes(v as HazardSeverity));
}

export function meetsMinimumSeverity(s: HazardSeverity, min?: HazardSeverity): boolean {
  if (!min || min === "unknown") return true;
  return severityRank(s) >= severityRank(min);
}

/** Significant earthquake threshold used for deterministic counts (M4.0+). */
export const SIGNIFICANT_MAGNITUDE = 4.0;

/** Display significance for earthquakes. Not an official classification. */
export function earthquakeSignificance(magnitude?: number): DisplaySignificance {
  if (magnitude == null) return "low";
  if (magnitude >= 5.0) return "high";
  if (magnitude >= SIGNIFICANT_MAGNITUDE) return "moderate";
  return "low";
}

/** Display significance for wildfires from reported size / status. */
export function wildfireSignificance(areaHectares?: number, statusCode?: string): DisplaySignificance {
  if (statusCode === "OC" && (areaHectares ?? 0) >= 100) return "high";
  if (areaHectares != null && areaHectares >= 1000) return "high";
  if (areaHectares != null && areaHectares >= 100) return "moderate";
  if (statusCode === "OC") return "moderate";
  return "low";
}

/** Display significance for weather alerts mirrors normalized severity. */
export function weatherSignificance(severity: HazardSeverity): DisplaySignificance {
  if (severity === "extreme" || severity === "severe") return "high";
  if (severity === "moderate") return "moderate";
  return "low";
}
