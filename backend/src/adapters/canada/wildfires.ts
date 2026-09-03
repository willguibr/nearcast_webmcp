import type { Feature, FeatureCollection } from "geojson";
import { regionForPoint, wildfireSignificance, type Hazard } from "@nearcast/shared";
import { fetchJson } from "../../utils/fetch.ts";
import { isoFromString } from "../../utils/time.ts";
import { num, str, type AdapterContext, type AdapterResult, type SourceAdapter } from "../../domain/hazard.ts";
import { fromStageOfControl } from "../../domain/severity.ts";
import { regionByCode } from "../../domain/geography.ts";

const SOURCE = { id: "cwfis" as const, agency: "Natural Resources Canada — CWFIS/CWFIF", country: "CA" as const };

/** CWFIF national active fires. Rows are temporal; only rows still valid "now" and not OUT are current. */
export function cwfifUrl(now: Date): string {
  const nowIso = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const cql = `record_end > '${nowIso}' AND stage_of_control_status <> 'OUT'`;
  const params = [
    "service=WFS", "version=2.0.0", "request=GetFeature",
    "typeNames=public:cwfif_national_activefires",
    "outputFormat=application/json", "count=3000",
    `cql_filter=${encodeURIComponent(cql)}`,
  ];
  return `https://geoserver.cwfif.nrcan.gc.ca/geoserver/wfs?${params.join("&")}`;
}

const CAUSE: Record<string, string> = { N: "Lightning (natural)", H: "Human", U: "Unknown", L: "Lightning (natural)" };

export function parseCwfif(feed: FeatureCollection): AdapterResult {
  const hazards: Hazard[] = [];
  const seen = new Set<string>();
  for (const f of feed.features ?? []) {
    const h = parseFeature(f);
    if (h && !seen.has(h.id)) { seen.add(h.id); hazards.push(h); }
  }
  return { hazards, sourceUpdatedAt: isoFromString((feed as { timeStamp?: string }).timeStamp) };
}

function parseFeature(f: Feature): Hazard | null {
  const p = (f.properties ?? {}) as Record<string, unknown>;
  // Source geometry is EPSG:3978; the feed also carries WGS84 lat/lon attributes.
  const lat = num(p.latitude), lon = num(p.longitude);
  if (lat == null || lon == null) return null;
  const id = str(p.national_fire_id) ?? str(p.agency_fire_id);
  if (!id) return null;
  const status = fromStageOfControl(p.stage_of_control_status);
  if (status.code === "OUT") return null;
  const agency = str(p.agency_code);
  const region = regionByCode(agency, "CA") ?? regionForPoint(lon, lat, "CA") ?? undefined;
  const size = num(p.fire_size);
  const contained = num(p.percent_contained);
  const fireLabel = str(p.agency_fire_id) ?? id;
  return {
    id: `cwfis:${id}`,
    type: "wildfire",
    country: "CA",
    regionCode: region?.code,
    regionName: region?.name,
    title: `Fire ${fireLabel}${agency ? ` (${agency})` : ""}`,
    description: `${status.label} · ${size != null ? `${size} ha` : "size not reported"} · reported by ${agency === "PC" ? "Parks Canada" : agency ?? "agency"}`,
    severity: status.severity,
    rawSeverity: status.code ? `stage_of_control=${status.code}` : undefined,
    significance: wildfireSignificance(size, status.code),
    geometry: { type: "Point", coordinates: [lon, lat] },
    latitude: lat,
    longitude: lon,
    locationPrecision: "exact",
    startedAt: undefined,
    updatedAt: isoFromString(p.status_date) ?? isoFromString(p.situation_report_date),
    source: { ...SOURCE, url: "https://cwfis.cfs.nrcan.gc.ca/interactive-map" },
    wildfire: {
      status: status.label,
      statusCode: status.code,
      areaHectares: size,
      containmentPercent: contained != null && contained >= 0 ? contained : undefined,
      agency: agency === "PC" ? "Parks Canada" : agency,
      cause: CAUSE[str(p.national_fire_cause)?.toUpperCase() ?? ""] ?? str(p.national_fire_cause),
      behaviour: str(p.response_type) ? `Response: ${p.response_type}` : undefined,
    },
  };
}

export const cwfisAdapter: SourceAdapter = {
  ...SOURCE,
  async fetch(ctx: AdapterContext) {
    const feed = await fetchJson<FeatureCollection>(cwfifUrl(ctx.now), { signal: ctx.signal, timeoutMs: ctx.timeoutMs ?? 8000 });
    return parseCwfif(feed);
  },
};
