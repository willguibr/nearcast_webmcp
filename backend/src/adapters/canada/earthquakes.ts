import { earthquakeSignificance, type Hazard } from "@nearcast/shared";
import { fetchText } from "../../utils/fetch.ts";
import { daysAgoDate, isoFromString } from "../../utils/time.ts";
import { num, str, type AdapterContext, type AdapterResult, type SourceAdapter } from "../../domain/hazard.ts";
import { classifyPlace } from "../../domain/geography.ts";

const SOURCE = { id: "nrcan" as const, agency: "Natural Resources Canada — Earthquakes Canada", country: "CA" as const };

export function nrcanUrl(now: Date): string {
  const params = new URLSearchParams({
    format: "text", starttime: daysAgoDate(now, 7), minmagnitude: "2.0",
    minlatitude: "41", maxlatitude: "84.5", minlongitude: "-141.5", maxlongitude: "-50",
  });
  return `https://www.earthquakescanada.nrcan.gc.ca/fdsnws/event/1/query?${params.toString()}`;
}

/** `#EventID|Time|Latitude|Longitude|Depth/km|MagType|Magnitude|EventLocationName` */
export function parseNrcan(text: string): AdapterResult {
  const hazards: Hazard[] = [];
  for (const line of text.split("\n")) {
    const h = parseLine(line);
    if (h) hazards.push(h);
  }
  return { hazards };
}

function parseLine(line: string): Hazard | null {
  if (!line || line.startsWith("#")) return null;
  const parts = line.split("|");
  if (parts.length < 8) return null;
  const [eventId, time, latS, lonS, depthS, magType, magS, locationRaw] = parts;
  const lat = num(latS), lon = num(lonS), magnitude = num(magS);
  if (lat == null || lon == null || !str(eventId)) return null;
  const location = locationRaw.split("/")[0].trim();
  const placement = classifyPlace(location, lon, lat);
  if (!placement || placement.country !== "CA") return null; // US-side events come from USGS
  const isMining = /mining event/i.test(location);
  return {
    id: `nrcan:${eventId.trim()}`,
    type: "earthquake",
    country: "CA",
    regionCode: placement.region?.code,
    regionName: placement.region?.name,
    title: `M ${magnitude ?? "?"} - ${location}`,
    description: isMining ? `${location} (mining-related event as classified by Earthquakes Canada)` : location,
    severity: "unknown",
    significance: earthquakeSignificance(magnitude),
    geometry: { type: "Point", coordinates: [lon, lat] },
    latitude: lat,
    longitude: lon,
    locationPrecision: "exact",
    startedAt: isoFromString(time),
    updatedAt: isoFromString(time),
    source: { ...SOURCE, url: "https://www.earthquakescanada.nrcan.gc.ca/recent/index-en.php" },
    earthquake: { magnitude, magnitudeType: str(magType), depthKm: num(depthS) },
  };
}

export const nrcanAdapter: SourceAdapter = {
  ...SOURCE,
  async fetch(ctx: AdapterContext) {
    const text = await fetchText(nrcanUrl(ctx.now), { signal: ctx.signal, timeoutMs: ctx.timeoutMs, headers: { Accept: "text/plain" } });
    return parseNrcan(text);
  },
};
