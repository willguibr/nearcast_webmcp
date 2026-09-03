import type { Feature, FeatureCollection, Point } from "geojson";
import { earthquakeSignificance, type Hazard } from "@nearcast/shared";
import { fetchJson } from "../../utils/fetch.ts";
import { isoFromEpochMs } from "../../utils/time.ts";
import { num, str, type AdapterContext, type AdapterResult, type SourceAdapter } from "../../domain/hazard.ts";
import { classifyPlace } from "../../domain/geography.ts";

export const USGS_FEED_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";

const SOURCE = { id: "usgs" as const, agency: "U.S. Geological Survey (USGS)", country: "US" as const };

/** Parse a USGS GeoJSON summary feed into normalized US earthquakes. Canadian events are left to NRCan. */
export function parseUsgs(feed: FeatureCollection, opts: { includeCanada?: boolean } = {}): AdapterResult {
  const hazards: Hazard[] = [];
  for (const f of feed.features ?? []) {
    const h = parseFeature(f as Feature<Point>, opts.includeCanada ?? false);
    if (h) hazards.push(h);
  }
  const generated = (feed as { metadata?: { generated?: number } }).metadata?.generated;
  return { hazards, sourceUpdatedAt: isoFromEpochMs(generated) };
}

function parseFeature(f: Feature<Point>, includeCanada: boolean): Hazard | null {
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const coords = f.geometry?.coordinates;
  if (!coords || coords.length < 2 || p.type !== "earthquake") return null;
  const [lon, lat, depth] = coords;
  const id = str(f.id) ?? (str(p.code) ? `${p.net}${p.code}` : undefined);
  if (!id) return null;
  const placement = classifyPlace(str(p.place), lon, lat);
  if (!placement) return null;
  if (placement.country === "CA" && !includeCanada) return null;
  const magnitude = num(p.mag);
  return {
    id: `usgs:${id}`,
    type: "earthquake",
    country: placement.country,
    regionCode: placement.region?.code,
    regionName: placement.region?.name,
    title: str(p.title) ?? `M ${magnitude ?? "?"} - ${str(p.place) ?? "unknown location"}`,
    description: str(p.place),
    severity: "unknown",
    rawSeverity: str(p.alert) ? `PAGER ${p.alert}` : undefined,
    significance: earthquakeSignificance(magnitude),
    geometry: { type: "Point", coordinates: [lon, lat] },
    latitude: lat,
    longitude: lon,
    locationPrecision: "exact",
    startedAt: isoFromEpochMs(p.time),
    updatedAt: isoFromEpochMs(p.updated),
    source: { ...SOURCE, url: str(p.url) ?? "https://earthquake.usgs.gov/earthquakes/map/" },
    earthquake: {
      magnitude,
      magnitudeType: str(p.magType),
      depthKm: num(depth),
      feltReports: num(p.felt),
      alertLevel: str(p.alert),
      tsunami: p.tsunami === 1,
      reviewStatus: str(p.status),
    },
  };
}

export const usgsAdapter: SourceAdapter = {
  ...SOURCE,
  async fetch(ctx: AdapterContext) {
    const feed = await fetchJson<FeatureCollection>(USGS_FEED_URL, { signal: ctx.signal, timeoutMs: ctx.timeoutMs });
    return parseUsgs(feed);
  },
};
