import { safeWebUrl, validGeometry, type AwarenessItem } from "@nearcast/shared";
import type { AwarenessAdapter, ParsedItems } from "./awareness.ts";
import { fetchDocument, features, isRow, str, number, iso, parseRows, type Row } from "./feed-utils.ts";

const BCWS = "https://wildfiresituation.nrs.gov.bc.ca/";
const RFC = "https://www2.gov.bc.ca/gov/content/environment/air-land-water/water/drought-flooding-dikes-dams/river-forecast-centre";
const ARCGIS = "https://services6.arcgis.com/ubm4tcTYICKBpist/arcgis/rest/services/";
const MAP = "https://delivery.maps.gov.bc.ca/arcgis/rest/services/mpcm/bcgwpub/MapServer/";
const polygon = (g: unknown) => validGeometry(g) && (g.type === "Polygon" || g.type === "MultiPolygon");

/** Fail closed on incomplete pagination; a partial basin map must not look like complete coverage. */
async function arcgis(layer: string, signal: AbortSignal, where = "1=1"): Promise<Row> {
  const all: Row[] = [];
  for (let page = 0; page < 10; page++) {
    const query = new URLSearchParams({ where, outFields: "*", returnGeometry: "true", outSR: "4326",
      resultRecordCount: "1000", resultOffset: String(page * 1000), orderByFields: "OBJECTID", f: "geojson", maxAllowableOffset: "0.005" });
    const body = await fetchDocument(`${layer}/query?${query}`, signal);
    const rows = features(body); all.push(...rows);
    if (!(body.exceededTransferLimit || body.properties?.exceededTransferLimit) && rows.length < 1000)
      return { type: "FeatureCollection", features: all };
  }
  throw new Error("Source pagination limit reached; incomplete snapshot withheld");
}

export function parseRestrictions(body: unknown, area = false): ParsedItems {
  return parseRows(features(body), (f) => {
    const p = f.properties;
    if (!isRow(p) || !str(p.OBJECTID) || !polygon(f.geometry)) return undefined;
    return { id: `bc-${area ? "restriction" : "ban"}:${p.OBJECTID}`, kind: "restriction",
      sourceId: area ? "bc-restrictions" : "bc-bans", sourceUrl: safeWebUrl(p.BULLETIN_URL) ?? BCWS,
      title: str(area ? p.NAME : p.TYPE) || (area ? "Area restriction" : "Fire prohibition"), geometry: f.geometry,
      restrictionType: area ? "area-restriction" : "fire-ban", fireCentre: str(p.FIRE_CENTRE_NAME),
      description: [str(p.CATEGORY), str(p.ACCESS_PROHIBITION_DESCRIPTION)].filter(Boolean).join(" · "),
      effectiveAt: iso(p.ACCESS_STATUS_EFFECTIVE_DATE),
      // An effective date is not the time the agency last checked this restriction.
      updatedAt: iso(p.DATE_MODIFIED),
    };
  });
}

export function parseFloods(body: unknown): ParsedItems {
  return parseRows(features(body), (f) => {
    const p = f.properties;
    if (!isRow(p)) return undefined;
    const code = number(p.Advisory);
    if (code === 1) return null;
    const level = code === 2 ? "High streamflow advisory" : code === 3 ? "Flood watch" : code === 4 ? "Flood warning" : undefined;
    if (!level || !str(p.OBJECTID) || !polygon(f.geometry)) return undefined;
    return { id: `bc-flood:${p.OBJECTID}`, kind: "flood", sourceId: "bc-floods", sourceUrl: RFC,
      title: [str(p.Major_Basin), str(p.Sub_Basin)].filter(Boolean).join(" · ") || "BC flood advisory",
      level, basin: str(p.Major_Basin), comments: str(p.Comments), geometry: f.geometry, updatedAt: iso(p.Date_Modified) };
  });
}

export function parseWildfires(body: unknown, perimeters: unknown, now: Date): ParsedItems {
  const shapes = new Map<string, Row>();
  for (const f of features(perimeters)) {
    const p = f.properties;
    if (isRow(p) && polygon(f.geometry)) shapes.set(str(p.FIRE_NUMBER), f);
  }
  return parseRows(features(body), (f): AwarenessItem | null | undefined => {
    const p = f.properties;
    if (!isRow(p)) return undefined;
    const status = str(p.FIRE_STATUS), out = iso(p.FIRE_OUT_DATE);
    if (status.toLowerCase() === "out" && (!out || now.getTime() - Date.parse(out) > 3 * 86400_000)) return null;
    const fireNumber = str(p.FIRE_NUMBER), lat = number(p.LATITUDE), lon = number(p.LONGITUDE);
    const point = { type: "Point" as const, coordinates: [lon, lat] };
    if (!fireNumber || !validGeometry(point)) return undefined;
    const shape = shapes.get(fireNumber);
    return { id: `bc-wildfire:${fireNumber}`, kind: "wildfire-detail", sourceId: "bc-wildfires", sourceUrl: safeWebUrl(p.FIRE_URL) ?? BCWS,
      title: str(p.INCIDENT_NAME) || str(p.GEOGRAPHIC_DESCRIPTION) || fireNumber, fireNumber, status: status || "Unknown",
      hectares: number(p.CURRENT_SIZE), cause: str(p.FIRE_CAUSE) || "Not reported", response: str(p.RESPONSE_TYPE_DESC) || "Not reported",
      geometry: shape?.geometry ?? point, perimeterAvailable: !!shape,
      updatedAt: iso(p.DATE_MODIFIED) ?? iso(p.LAST_UPDATED) };
  });
}

export const EXTENDED_ADAPTERS: AwarenessAdapter[] = [
  { id: "bc-bans", name: "BC fire prohibitions", coverage: "Provincial BC fire bans; local bylaws may add restrictions. Read the official bulletin.", url: BCWS, ttlMs: 600_000,
    fetch: async (_now, signal) => parseRestrictions(await arcgis(`${MAP}758`, signal)) },
  { id: "bc-restrictions", name: "BC area restrictions", coverage: "Published BC wildfire area restrictions. Boundaries are generalized for display.", url: BCWS, ttlMs: 600_000,
    fetch: async (_now, signal) => parseRestrictions(await arcgis(`${MAP}810`, signal), true) },
  { id: "bc-floods", name: "BC River Forecast Centre", coverage: "BC basin advisories, not property inundation maps or evacuation instructions.", url: RFC, ttlMs: 600_000,
    fetch: async (_now, signal) => parseFloods(await arcgis(`${ARCGIS}BC_Flood_Advisory_and_Warning_Notifications_(Public_View)/FeatureServer/0`, signal, "Advisory>=2")) },
  { id: "bc-wildfires", name: "BC Wildfire Service details", coverage: "BC fire status, size, cause and published perimeters. Complements national incidents; counts can overlap.", url: BCWS, ttlMs: 600_000,
    fetch: async (now, signal) => {
      const [points, shapes] = await Promise.all([
        fetchDocument("https://openmaps.gov.bc.ca/geo/pub/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=pub:WHSE_LAND_AND_NATURAL_RESOURCE.PROT_CURRENT_FIRE_PNTS_SP&outputFormat=application/json&count=5000", signal),
        arcgis(`${ARCGIS}BCWS_FirePerimeters_PublicView/FeatureServer/0`, signal),
      ]);
      if (features(points).length >= 5000 || Number(points.numberMatched) > features(points).length) throw new Error("Incomplete wildfire point snapshot");
      return parseWildfires(points, shapes, now);
    } },
];
