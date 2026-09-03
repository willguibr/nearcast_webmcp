import type { Feature, FeatureCollection, Geometry } from "geojson";
import { representativePoint, roundGeometry, weatherSignificance, type Hazard } from "@nearcast/shared";
import { fetchJson } from "../../utils/fetch.ts";
import { isoFromString } from "../../utils/time.ts";
import { clampText, str, type AdapterContext, type AdapterResult, type SourceAdapter } from "../../domain/hazard.ts";
import { fromCapSeverity } from "../../domain/severity.ts";
import { regionByCode } from "../../domain/geography.ts";
import countyCentroids from "./county-centroids.json" with { type: "json" };

export const NWS_ALERTS_URL = "https://api.weather.gov/alerts/active?status=actual&message_type=alert,update";

const SOURCE = { id: "nws" as const, agency: "U.S. National Weather Service (NWS)", country: "US" as const };
const CENTROIDS = countyCentroids as unknown as Record<string, [number, number]>;

interface NwsProps {
  id?: string; event?: string; severity?: string; certainty?: string; urgency?: string; status?: string;
  headline?: string; description?: string; instruction?: string; areaDesc?: string; senderName?: string;
  effective?: string; onset?: string; expires?: string; ends?: string; sent?: string;
  geocode?: { SAME?: string[]; UGC?: string[] };
}

export function parseNws(feed: FeatureCollection, now = new Date()): AdapterResult {
  const hazards: Hazard[] = [];
  for (const f of feed.features ?? []) {
    const h = parseFeature(f, now);
    if (h) hazards.push(h);
  }
  return { hazards, sourceUpdatedAt: isoFromString((feed as { updated?: string }).updated) };
}

/** Mean of county centroids for zone-based alerts without polygon geometry. */
export function approximatePoint(sameCodes: string[] | undefined): [number, number] | null {
  let lat = 0, lon = 0, n = 0;
  for (const code of sameCodes ?? []) {
    const c = CENTROIDS[code.length === 6 ? code.slice(1) : code];
    if (c) { lat += c[0]; lon += c[1]; n++; }
  }
  return n ? [lon / n, lat / n] : null;
}

function parseFeature(f: Feature, now: Date): Hazard | null {
  const p = (f.properties ?? {}) as NwsProps;
  const id = str(p.id);
  if (!id || p.status !== "Actual" || p.event === "Test Message") return null;
  const expires = isoFromString(p.ends) ?? isoFromString(p.expires);
  if (expires && new Date(expires).getTime() < now.getTime()) return null;

  let geometry: Geometry | null = null;
  let point: [number, number] | null = null;
  let precision: Hazard["locationPrecision"] = "exact";
  if (f.geometry && f.geometry.type !== "GeometryCollection") {
    geometry = roundGeometry(f.geometry, 3);
    point = representativePoint(geometry);
  }
  if (!point) {
    point = approximatePoint(p.geocode?.SAME);
    if (!point) return null; // marine zones etc. without county codes
    geometry = { type: "Point", coordinates: point };
    precision = "approximate";
  }
  const ugcState = p.geocode?.UGC?.[0]?.slice(0, 2);
  const descState = /,\s*([A-Z]{2})(;|$)/.exec(p.areaDesc ?? "")?.[1];
  const region = regionByCode(ugcState, "US") ?? regionByCode(descState, "US");
  const severity = fromCapSeverity(p.severity);
  return {
    id: `nws:${id}`,
    type: "weather",
    country: "US",
    regionCode: region?.code,
    regionName: region?.name,
    title: str(p.event) ?? "Weather alert",
    description: clampText(str(p.description)),
    severity,
    rawSeverity: str(p.severity),
    significance: weatherSignificance(severity),
    geometry: geometry as Geometry,
    latitude: point[1],
    longitude: point[0],
    locationPrecision: precision,
    startedAt: isoFromString(p.onset) ?? isoFromString(p.effective) ?? isoFromString(p.sent),
    updatedAt: isoFromString(p.sent) ?? isoFromString(p.effective),
    expiresAt: expires,
    source: { ...SOURCE, url: id.startsWith("http") ? id : `https://api.weather.gov/alerts/${encodeURIComponent(id)}` },
    weather: {
      event: str(p.event),
      urgency: str(p.urgency),
      certainty: str(p.certainty),
      instruction: clampText(str(p.instruction), 2000),
      headline: str(p.headline),
      areaDescription: clampText(str(p.areaDesc), 500),
      sender: str(p.senderName),
      status: str(p.status),
    },
  };
}

export const nwsAdapter: SourceAdapter = {
  ...SOURCE,
  async fetch(ctx: AdapterContext) {
    const feed = await fetchJson<FeatureCollection>(NWS_ALERTS_URL, {
      signal: ctx.signal, timeoutMs: ctx.timeoutMs, headers: { Accept: "application/geo+json" },
    });
    return parseNws(feed, ctx.now);
  },
};
