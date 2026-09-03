import type { Feature, FeatureCollection, Point } from "geojson";
import { wildfireSignificance, type Hazard } from "@nearcast/shared";
import { fetchJson } from "../../utils/fetch.ts";
import { isoFromEpochMs } from "../../utils/time.ts";
import { num, str, type AdapterContext, type AdapterResult, type SourceAdapter } from "../../domain/hazard.ts";
import { regionByCode } from "../../domain/geography.ts";

const BASE = "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/WFIGS_Incident_Locations_Current/FeatureServer/0/query";
const FIELDS = [
  "IncidentName", "UniqueFireIdentifier", "IrwinID", "IncidentSize", "DiscoveryAcres", "PercentContained",
  "FireDiscoveryDateTime", "ModifiedOnDateTime_dt", "POOState", "POOCounty", "POOProtectingAgency",
  "IncidentTypeCategory", "FireBehaviorGeneral", "IncidentShortDescription", "FireCause", "ContainmentDateTime", "FireOutDateTime",
];
export const NIFC_URL = `${BASE}?where=${encodeURIComponent("IncidentTypeCategory='WF' AND FireOutDateTime IS NULL")}&outFields=${FIELDS.join(",")}&f=geojson&resultRecordCount=2000&orderByFields=${encodeURIComponent("ModifiedOnDateTime_dt DESC")}`;

const SOURCE = { id: "nifc" as const, agency: "National Interagency Fire Center (NIFC) — WFIGS", country: "US" as const };
const ACRE_TO_HA = 0.40468564224;

export function parseNifc(feed: FeatureCollection): AdapterResult {
  const hazards: Hazard[] = [];
  for (const f of feed.features ?? []) {
    const h = parseFeature(f as Feature<Point>);
    if (h) hazards.push(h);
  }
  return { hazards };
}

function parseFeature(f: Feature<Point>): Hazard | null {
  const p = (f.properties ?? {}) as Record<string, unknown>;
  const coords = f.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  if (p.IncidentTypeCategory !== "WF" || p.FireOutDateTime != null) return null;
  const id = str(p.UniqueFireIdentifier) ?? str(p.IrwinID);
  if (!id) return null;
  const [lon, lat] = coords;
  const stateCode = str(p.POOState)?.replace(/^US-/, "");
  const region = regionByCode(stateCode, "US");
  const acres = num(p.IncidentSize) ?? num(p.DiscoveryAcres);
  const hectares = acres != null ? Math.round(acres * ACRE_TO_HA * 10) / 10 : undefined;
  const name = str(p.IncidentName) ?? id;
  return {
    id: `nifc:${id}`,
    type: "wildfire",
    country: "US",
    regionCode: region?.code,
    regionName: region?.name,
    title: `${name} Fire`,
    description: str(p.IncidentShortDescription),
    severity: "unknown",
    rawSeverity: str(p.FireBehaviorGeneral),
    significance: wildfireSignificance(hectares),
    geometry: { type: "Point", coordinates: [lon, lat] },
    latitude: lat,
    longitude: lon,
    locationPrecision: "exact",
    startedAt: isoFromEpochMs(p.FireDiscoveryDateTime),
    updatedAt: isoFromEpochMs(p.ModifiedOnDateTime_dt),
    source: { ...SOURCE, url: "https://data-nifc.opendata.arcgis.com/datasets/nifc::wfigs-current-wildland-fire-locations" },
    wildfire: {
      status: str(p.FireBehaviorGeneral) ? `Fire behaviour: ${p.FireBehaviorGeneral}` : undefined,
      areaAcres: acres,
      areaHectares: hectares,
      containmentPercent: num(p.PercentContained),
      agency: str(p.POOProtectingAgency),
      behaviour: str(p.FireBehaviorGeneral),
      cause: str(p.FireCause),
    },
  };
}

export const nifcAdapter: SourceAdapter = {
  ...SOURCE,
  async fetch(ctx: AdapterContext) {
    const feed = await fetchJson<FeatureCollection>(NIFC_URL, { signal: ctx.signal, timeoutMs: ctx.timeoutMs });
    return parseNifc(feed);
  },
};
