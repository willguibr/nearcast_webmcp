import type { Geometry, Point } from "geojson";

export interface SavedPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
}

export type AwarenessKind = "air-quality" | "evacuation" | "road" | "camera" | "restriction" | "wildfire-detail" | "flood";
export type AwarenessSourceId = "eccc-aqhi" | "bc-evacuations" | "drivebc-roads" | "drivebc-cameras" | "bc-bans" | "bc-restrictions" | "bc-wildfires" | "bc-floods";

export interface AwarenessSource {
  id: AwarenessSourceId;
  name: string;
  coverage: string;
  url: string;
  status: "available" | "partial" | "stale" | "error";
  checkedAt: string;
  retrievedAt?: string;
  count: number;
  rejectedCount: number;
  error?: string;
}

interface ContextItem {
  id: string;
  kind: AwarenessKind;
  title: string;
  geometry: Geometry;
  sourceId: AwarenessSourceId;
  sourceUrl: string;
  /** Agency observation/update time. Missing timestamps remain unknown. */
  updatedAt?: string;
}

export interface AirQualityObservation extends ContextItem {
  kind: "air-quality";
  geometry: Point;
  stationId: string;
  aqhi: number;
  displayValue: string;
  category: "Low" | "Moderate" | "High" | "Very high";
  note?: string;
}

export interface EvacuationNotice extends ContextItem {
  kind: "evacuation";
  stage: "order" | "alert" | "unknown";
  rawStage: string;
  authority: string;
  eventType: string;
  area: string;
  /** Older than 30 days or undated; never silently treated as a current instruction. */
  olderRecord: boolean;
}

export interface RoadEvent extends ContextItem {
  kind: "road";
  severity: string;
  eventType: string;
  description: string;
  roads: Array<{ name: string; state: string; direction?: string }>;
  /** Published schedule text, not an inferred current road state. */
  intervals: string[];
}

export interface HighwayCamera extends ContextItem {
  kind: "camera";
  geometry: Point;
  imageUrl: string;
  caption: string;
  highway: string;
  markedStale: boolean;
}

export interface FireRestriction extends ContextItem {
  kind: "restriction";
  restrictionType: "fire-ban" | "area-restriction";
  description: string;
  fireCentre: string;
  effectiveAt?: string;
}
export interface WildfireDetail extends ContextItem {
  kind: "wildfire-detail";
  fireNumber: string;
  status: string;
  hectares?: number;
  cause: string;
  response: string;
  perimeterAvailable: boolean;
}
export interface FloodNotice extends ContextItem {
  kind: "flood";
  level: "High streamflow advisory" | "Flood watch" | "Flood warning";
  basin: string;
  comments: string;
}
export type AwarenessItem = AirQualityObservation | EvacuationNotice | RoadEvent | HighwayCamera | FireRestriction | WildfireDetail | FloodNotice;
export interface AwarenessSnapshot {
  items: AwarenessItem[];
  sources: AwarenessSource[];
  retrievedAt: string;
  demo: boolean;
}

/** Use each provider's retrieval time so repeated failures cannot extend an old cache's lifetime. */
export function usableAwarenessItems(snapshot: AwarenessSnapshot | undefined, demo: boolean, now = Date.now()): AwarenessItem[] {
  if (!snapshot || snapshot.demo !== demo) return [];
  if (demo) return snapshot.items;
  const fresh = (time?: string) => !!time && Number.isFinite(Date.parse(time)) && now - Date.parse(time) <= 30 * 60_000;
  if (!fresh(snapshot.retrievedAt)) return [];
  const sources = new Set(snapshot.sources.filter((s) => s.status !== "error" && fresh(s.retrievedAt)).map((s) => s.id));
  return snapshot.items.filter((item) => sources.has(item.sourceId));
}

export const AWARENESS_LABELS: Record<AwarenessKind, string> = {
  "air-quality": "Air quality", evacuation: "Evacuation notices", road: "Road events", camera: "Highway cameras",
  restriction: "Fire bans and area restrictions", "wildfire-detail": "BC wildfire details", flood: "Flood advisories",
};

export function validPlace(input: unknown): input is SavedPlace {
  if (!input || typeof input !== "object") return false;
  const p = input as SavedPlace;
  return typeof p.id === "string" && p.id.length > 0 && p.id.length <= 100
    && typeof p.name === "string" && p.name.trim().length > 0 && p.name.length <= 80
    && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 85
    && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180
    && Number.isFinite(p.radiusKm) && p.radiusKm >= 1 && p.radiusKm <= 250;
}

/** Upstream URLs are data, never executable protocols. */
export function safeWebUrl(value: unknown, base?: string): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value, base);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}
