import type { Geometry } from "geojson";

export type HazardType = "wildfire" | "weather" | "earthquake";

export type CountryCode = "CA" | "US";

/**
 * Normalized severity. For weather alerts this is translated from the issuing
 * agency's own classification (see `rawSeverity`). Wildfire agencies and USGS
 * do not issue a comparable severity; those hazards usually carry "unknown"
 * and expose their own measures (hectares, containment, magnitude) instead.
 */
export type HazardSeverity = "info" | "minor" | "moderate" | "severe" | "extreme" | "unknown";

/**
 * Display-only significance bucket used for map styling and "important"
 * filtering. It is computed by Nearcast (e.g. from magnitude or fire size)
 * and is NOT a government-issued classification.
 */
export type DisplaySignificance = "low" | "moderate" | "high";

export type SourceId = "usgs" | "nws" | "eccc" | "cwfis" | "nrcan" | "nifc" | "mock";

export interface HazardSource {
  id: SourceId;
  agency: string;
  country: CountryCode;
  url?: string;
}

export interface WildfireAttributes {
  /** Agency-reported control status, e.g. "Out of control", "Being held". */
  status?: string;
  /** Raw agency status code when it differs from the label (e.g. "OC"). */
  statusCode?: string;
  areaHectares?: number;
  /** Size as reported by US sources (acres). `areaHectares` is derived from it. */
  areaAcres?: number;
  containmentPercent?: number;
  /** Responsible or protecting agency as reported by the source. */
  agency?: string;
  behaviour?: string;
  cause?: string;
}

export interface EarthquakeAttributes {
  magnitude?: number;
  magnitudeType?: string;
  depthKm?: number;
  feltReports?: number;
  /** USGS PAGER alert level when present (green/yellow/orange/red). */
  alertLevel?: string;
  tsunami?: boolean;
  reviewStatus?: string;
}

export interface WeatherAttributes {
  event?: string;
  urgency?: string;
  certainty?: string;
  instruction?: string;
  headline?: string;
  areaDescription?: string;
  /** Sender / issuing office as reported by the source. */
  sender?: string;
  status?: string;
}

export interface Hazard {
  /** Deterministic id: `<source>:<source-event-id>` */
  id: string;
  type: HazardType;
  country: CountryCode;
  /** Province/territory or state code, e.g. "BC", "WA". */
  regionCode?: string;
  regionName?: string;

  title: string;
  description?: string;

  severity: HazardSeverity;
  /** The issuing agency's own severity/type text, untranslated. */
  rawSeverity?: string;
  significance: DisplaySignificance;

  geometry: Geometry;
  latitude: number;
  longitude: number;
  /**
   * "exact" when the source supplied a point/polygon; "approximate" when
   * Nearcast placed the hazard at a representative point (e.g. a county
   * centroid for a zone-based weather alert).
   */
  locationPrecision: "exact" | "approximate";

  startedAt?: string;
  updatedAt?: string;
  expiresAt?: string;

  source: HazardSource;

  wildfire?: WildfireAttributes;
  earthquake?: EarthquakeAttributes;
  weather?: WeatherAttributes;
}

/** "stale" = the live fetch failed and Nearcast is serving the last successful snapshot from this source. */
export type SourceStatus = "available" | "stale" | "error" | "timeout" | "disabled";

export interface SourceMeta {
  id: SourceId;
  agency: string;
  country: CountryCode;
  status: SourceStatus;
  /** When the upstream data was retrieved by Nearcast (for "stale", when the served snapshot was retrieved). */
  retrievedAt?: string;
  /** Upstream-declared freshness when the feed provides one. */
  sourceUpdatedAt?: string;
  durationMs?: number;
  count?: number;
  error?: string;
}
