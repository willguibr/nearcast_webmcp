import type { CountryCode, Hazard, HazardSeverity, HazardType, SourceMeta } from "./hazard.ts";

export interface HazardFilters {
  type?: HazardType[];
  country?: CountryCode[];
  region?: string[];
  minSeverity?: HazardSeverity;
  minMagnitude?: number;
  bbox?: [number, number, number, number];
  limit?: number;
}

export interface HazardsResponse {
  data: Hazard[];
  meta: {
    generatedAt: string;
    retrievedAt: string;
    sources: SourceMeta[];
    filters: HazardFilters;
    count: number;
    /** Total matching before `limit` was applied. */
    total: number;
    mock?: boolean;
  };
}

export interface HazardResponse {
  data: Hazard;
  meta: { generatedAt: string; retrievedAt: string; sources: SourceMeta[] };
}

export interface CountrySummary {
  wildfires: number;
  weatherAlerts: number;
  earthquakes: number;
  significantEarthquakes: number;
  wildfiresOutOfControl?: number;
  wildfireHectaresReported?: number;
}

export interface SummaryResponse {
  generatedAt: string;
  retrievedAt: string;
  countries: Record<CountryCode, CountrySummary>;
  regions: Record<string, CountrySummary>;
  sources: SourceMeta[];
  mock?: boolean;
}

export interface HealthResponse {
  status: "ok";
  service: "nearcast-api";
  timestamp: string;
  version?: string;
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
