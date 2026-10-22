import type { AwarenessItem, AwarenessSource, AwarenessSourceId } from "@nearcast/shared";
import { safeWebUrl, validGeometry } from "@nearcast/shared";
import { fetchDocument, isRow, str, number, iso, features, parseRows } from "./feed-utils.ts";

type Row = Record<string, any>;
export interface ParsedItems { items: AwarenessItem[]; rejectedCount: number; notice?: string }
export interface AwarenessAdapter {
  id: AwarenessSourceId;
  name: string;
  coverage: string;
  url: string;
  ttlMs: number;
  fetch: (now: Date, signal: AbortSignal) => Promise<ParsedItems>;
}

const AQHI_URL = "https://api.weather.gc.ca/collections/aqhi-observations-realtime/items?latest=true&f=json&limit=500";
const EVACUATION_LAYER = "https://services6.arcgis.com/ubm4tcTYICKBpist/arcgis/rest/services/Evacuation_Orders_and_Alerts/FeatureServer/0/query";
const ROAD_URL = "https://api.open511.gov.bc.ca/events";
const CAMERA_URL = "https://www.drivebc.ca/api/webcams/";
const EVACUATION_PORTAL = "https://www.emergencyinfobc.gov.bc.ca/";
const AQHI_PORTAL = "https://weather.gc.ca/airquality/pages/index_e.html";

export function parseAirQuality(body: unknown): ParsedItems {
  return parseRows(features(body), (f) => {
    const p = f.properties;
    if (!isRow(p) || !validGeometry(f.geometry) || f.geometry.type !== "Point") return undefined;
    const stationId = str(p.location_id), raw = p.aqhi;
    const n = raw === "10+" ? 11 : number(raw);
    if (!stationId || n === undefined || n < 1 || n > 100) return undefined;
    const aqhi = Math.round(n);
    return {
      id: `eccc-aqhi:${stationId}`, kind: "air-quality", sourceId: "eccc-aqhi", sourceUrl: AQHI_PORTAL,
      title: str(p.location_name_en) || stationId, stationId, geometry: f.geometry,
      aqhi, displayValue: aqhi > 10 ? "10+" : String(aqhi),
      category: aqhi <= 3 ? "Low" : aqhi <= 6 ? "Moderate" : aqhi <= 10 ? "High" : "Very high",
      note: str(p.special_notes_en) || undefined, updatedAt: iso(p.observation_datetime),
    };
  });
}

export function parseEvacuations(body: unknown, now: Date): ParsedItems {
  return parseRows(features(body), (f) => {
    const p = f.properties;
    if (!isRow(p)) return undefined;
    const rawStage = str(p.ORDER_ALERT_STATUS), normalized = rawStage.toLowerCase().replace(/[\s_-]+/g, " ");
    // Check rescission before "order": "Evacuation Order Rescinded" is not an order.
    if (/\b(rescind(?:ed)?|all clear|cancelled|canceled)\b/.test(normalized)) return null;
    const id = str(p.EMRG_OAA_SYSID) || str(p.OBJECTID);
    if (!id || !validGeometry(f.geometry) || !["Polygon", "MultiPolygon"].includes(f.geometry.type)) return undefined;
    const stage = ["order", "evacuation order", "tactical", "tactical evacuation"].includes(normalized) ? "order"
      : ["alert", "evacuation alert"].includes(normalized) ? "alert" : "unknown";
    const updatedAt = iso(p.DATE_MODIFIED) ?? iso(p.EVENT_START_DATE);
    return {
      id: `bc-evacuation:${id}`, kind: "evacuation", sourceId: "bc-evacuations", sourceUrl: EVACUATION_PORTAL,
      title: str(p.ORDER_ALERT_NAME) || str(p.EVENT_NAME) || "Published evacuation notice", geometry: f.geometry,
      stage, rawStage: rawStage || "Not reported", authority: str(p.ISSUING_AGENCY) || "Authority not reported",
      eventType: str(p.EVENT_TYPE) || "Not reported", area: str(p.EVENT_NAME), updatedAt,
      olderRecord: !updatedAt || now.getTime() - new Date(updatedAt).getTime() > 30 * 86400_000,
    };
  });
}

export function parseRoads(body: unknown): ParsedItems {
  if (!isRow(body) || !Array.isArray(body.events)) throw new Error("Unexpected DriveBC road response");
  return parseRows(body.events, (p) => {
    if (p.status === "ARCHIVED") return null;
    if (p.status !== "ACTIVE") return undefined;
    const id = str(p.id);
    if (!id || !validGeometry(p.geography)) return undefined;
    const roads = (Array.isArray(p.roads) ? p.roads : []).filter(isRow).map((r: Row) => ({
      name: str(r.name), state: str(r.state) || "UNKNOWN", direction: str(r.direction) || undefined,
    }));
    return {
      id: `drivebc-road:${id}`, kind: "road", sourceId: "drivebc-roads",
      sourceUrl: "https://www.drivebc.ca/",
      title: roads.map((r: { name: string }) => r.name).filter(Boolean).join(" / ") || str(p.headline) || "Road event",
      geometry: p.geography, severity: str(p.severity) || "UNKNOWN", eventType: str(p.event_type) || "UNKNOWN",
      description: str(p.description).slice(0, 12000), roads, updatedAt: iso(p.updated) ?? iso(p.created),
      intervals: Array.isArray(p.schedule?.intervals) ? p.schedule.intervals.filter((s: unknown) => typeof s === "string").slice(0, 20) : [],
    };
  });
}

export function parseCameras(body: unknown): ParsedItems {
  if (!Array.isArray(body)) throw new Error("Unexpected DriveBC camera response");
  return parseRows(body, (p) => {
    if (p.is_on === false || p.should_appear === false) return null;
    const id = str(p.id), title = str(p.name);
    const imageUrl = safeWebUrl(p.links?.imageDisplay, "https://www.drivebc.ca");
    // Only embed DriveBC images; provider data must not introduce tracking/unsafe URLs.
    if (!id || !title || !imageUrl || new URL(imageUrl).hostname !== "www.drivebc.ca"
      || !validGeometry(p.location) || p.location.type !== "Point") return undefined;
    return {
      id: `drivebc-camera:${id}`, kind: "camera", sourceId: "drivebc-cameras",
      sourceUrl: `https://www.drivebc.ca/cameras/${encodeURIComponent(id)}`, title, geometry: p.location,
      imageUrl, caption: str(p.caption), highway: str(p.highway_display) || str(p.highway),
      // An attempted update is not evidence that an image was updated successfully.
      updatedAt: iso(p.last_update_modified), markedStale: p.marked_stale === true || p.marked_delayed === true,
    };
  });
}

async function fetchAirQuality(_now: Date, signal: AbortSignal): Promise<ParsedItems> {
  const all: Row[] = [];
  let url: string | undefined = AQHI_URL;
  for (let page = 0; url && page < 10; page++) {
    const body: Row = await fetchDocument(url, signal);
    all.push(...features(body));
    const next: unknown = Array.isArray(body.links) ? body.links.find((l: Row) => l.rel === "next")?.href : undefined;
    url = next ? safeWebUrl(next, AQHI_URL) : undefined;
    if (next && (!url || new URL(url).origin !== new URL(AQHI_URL).origin)) throw new Error("Unexpected AQHI pagination URL");
  }
  if (url) throw new Error("AQHI pagination limit reached; incomplete snapshot rejected");
  return parseAirQuality({ type: "FeatureCollection", features: all });
}

async function fetchEvacuations(now: Date, signal: AbortSignal): Promise<ParsedItems> {
  const all: Row[] = [];
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ where: "1=1", outFields: "*", returnGeometry: "true", outSR: "4326",
      resultRecordCount: "1000", resultOffset: String(page * 1000), orderByFields: "OBJECTID", f: "geojson" });
    const body = await fetchDocument(`${EVACUATION_LAYER}?${query}`, signal);
    const rows = features(body);
    all.push(...rows);
    if (!(body.exceededTransferLimit || body.properties?.exceededTransferLimit) && rows.length < 1000) {
      return parseEvacuations({ type: "FeatureCollection", features: all }, now);
    }
  }
  throw new Error("Evacuation pagination limit reached; incomplete snapshot rejected");
}

async function fetchRoads(_now: Date, signal: AbortSignal): Promise<ParsedItems> {
  const all: Row[] = [];
  for (let page = 0; page < 10; page++) {
    const body = await fetchDocument(`${ROAD_URL}?status=ACTIVE&format=json&limit=500&offset=${page * 500}`, signal);
    if (!Array.isArray(body.events)) throw new Error("Unexpected DriveBC road response");
    all.push(...body.events);
    if (body.events.length < 500 && !body.pagination?.next) return parseRoads({ events: all });
  }
  throw new Error("DriveBC pagination limit reached; incomplete snapshot rejected");
}

/** Official DriveBC website API. closed=false supplies no affirmative open-road state. */
export function parseWebsiteRoads(body: unknown): ParsedItems {
  if (!Array.isArray(body)) throw new Error("Unexpected DriveBC website response");
  return parseRows(body, (p) => {
    if (p.status === "INACTIVE" || p.status === "ARCHIVED") return null;
    if (p.status !== "ACTIVE" || !str(p.id) || !validGeometry(p.location)) return undefined;
    return { id: `drivebc-road:${p.id}`, kind: "road", sourceId: "drivebc-roads", sourceUrl: "https://www.drivebc.ca/",
      title: str(p.route_display) || "Road event", geometry: p.location, severity: str(p.severity) || "UNKNOWN",
      eventType: str(p.event_type) || "UNKNOWN", description: str(p.description).slice(0,12000),
      roads: [{ name: str(p.route_display), state: p.closed === true ? "CLOSED" : "NOT SPECIFIED (check event)", direction: str(p.direction_display) || undefined }],
      updatedAt: iso(p.last_updated), intervals: Array.isArray(p.schedule?.intervals) ? p.schedule.intervals.filter((s: unknown) => typeof s === "string").slice(0,20) : [] };
  });
}
async function fetchRoadsWithFallback(now: Date, signal: AbortSignal): Promise<ParsedItems> {
  try { return await fetchRoads(now, AbortSignal.any([signal, AbortSignal.timeout(8000)])); }
  catch {
    if (signal.aborted) throw new Error("Road source deadline exceeded");
    const data = parseWebsiteRoads(await fetchDocument("https://www.drivebc.ca/api/events/", signal));
    return { ...data, notice: "Open511 unavailable; using the official DriveBC website event feed. Non-closure road states are not specified by this feed." };
  }
}

export const AWARENESS_ADAPTERS: AwarenessAdapter[] = [
  { id: "eccc-aqhi", name: "ECCC AQHI", coverage: "Canadian reporting stations; station observations, not an address-level measurement", url: AQHI_PORTAL, ttlMs: 180_000, fetch: fetchAirQuality },
  { id: "bc-evacuations", name: "BC evacuation notices", coverage: "British Columbia only; published records may retain older notices. Confirm with the issuing authority", url: EVACUATION_PORTAL, ttlMs: 180_000, fetch: fetchEvacuations },
  { id: "drivebc-roads", name: "DriveBC road events", coverage: "BC provincial highways; published events and schedules, not routing or a guarantee that a road is open", url: "https://www.drivebc.ca/", ttlMs: 180_000, fetch: fetchRoadsWithFallback },
  { id: "drivebc-cameras", name: "DriveBC cameras", coverage: "Available BC highway cameras; image age can differ from catalogue retrieval time", url: "https://www.drivebc.ca/cameras", ttlMs: 900_000, fetch: async (_now, signal) => parseCameras(await fetchDocument(CAMERA_URL, signal)) },
];

export function sourceInfo(adapter: AwarenessAdapter): Pick<AwarenessSource, "id" | "name" | "coverage" | "url"> {
  const { id, name, coverage, url } = adapter;
  return { id, name, coverage, url };
}
