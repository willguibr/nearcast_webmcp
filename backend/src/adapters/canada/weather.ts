import type { Feature, FeatureCollection, Geometry } from "geojson";
import { representativePoint, roundGeometry, weatherSignificance, type Hazard } from "@nearcast/shared";
import { fetchJson } from "../../utils/fetch.ts";
import { isoFromString } from "../../utils/time.ts";
import { clampText, str, type AdapterContext, type AdapterResult, type SourceAdapter } from "../../domain/hazard.ts";
import { fromEcccAlertType } from "../../domain/severity.ts";
import { regionByCode } from "../../domain/geography.ts";

export const ECCC_ALERTS_URL = "https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=1000";

const SOURCE = { id: "eccc" as const, agency: "Environment and Climate Change Canada (ECCC / MSC)", country: "CA" as const };

interface EcccProps {
  alert_code?: string; alert_type?: string; alert_name_en?: string; alert_short_name_en?: string;
  publication_datetime?: string; expiration_datetime?: string; validity_datetime?: string; event_end_datetime?: string;
  alert_text_en?: string; risk_colour_en?: string | null; confidence_en?: string | null; impact_en?: string | null;
  feature_name_en?: string; province?: string; status_en?: string; feature_id?: string;
}

export function parseEccc(feed: FeatureCollection, now = new Date()): AdapterResult {
  const hazards: Hazard[] = [];
  for (const f of feed.features ?? []) {
    const h = parseFeature(f, now);
    if (h) hazards.push(h);
  }
  return { hazards };
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseFeature(f: Feature, now: Date): Hazard | null {
  const p = (f.properties ?? {}) as EcccProps;
  const id = str(f.id);
  if (!id || !f.geometry) return null;
  if ((p.status_en ?? "").toLowerCase() === "ended") return null;
  const expires = isoFromString(p.expiration_datetime);
  if (expires && new Date(expires).getTime() < now.getTime()) return null;
  const geometry: Geometry = roundGeometry(f.geometry, 3);
  const point = representativePoint(geometry);
  if (!point) return null;
  const region = regionByCode(str(p.province), "CA");
  const severity = fromEcccAlertType(p.alert_type);
  const alertName = str(p.alert_name_en) ? titleCase(p.alert_name_en!) : "Weather alert";
  const extra = [p.impact_en && `Impact: ${p.impact_en}`, p.confidence_en && `Confidence: ${p.confidence_en}`].filter(Boolean).join("\n");
  const description = [str(p.alert_text_en), extra].filter(Boolean).join("\n\n");
  const prov = (str(p.province) ?? "").toLowerCase();
  return {
    id: `eccc:${id}`,
    type: "weather",
    country: "CA",
    regionCode: region?.code,
    regionName: region?.name,
    title: `${alertName} — ${str(p.feature_name_en) ?? "Canada"}`,
    description: clampText(description) || undefined,
    severity,
    rawSeverity: [str(p.alert_type), str(p.risk_colour_en ?? undefined)].filter(Boolean).join(" / ") || undefined,
    significance: weatherSignificance(severity),
    geometry,
    latitude: point[1],
    longitude: point[0],
    locationPrecision: "exact",
    startedAt: isoFromString(p.validity_datetime) ?? isoFromString(p.publication_datetime),
    updatedAt: isoFromString(p.publication_datetime),
    expiresAt: isoFromString(p.event_end_datetime) ?? expires,
    source: { ...SOURCE, url: prov ? `https://weather.gc.ca/warnings/index_e.html?prov=${prov}` : "https://weather.gc.ca/warnings/index_e.html" },
    weather: {
      event: str(p.alert_name_en),
      urgency: undefined,
      certainty: str(p.confidence_en ?? undefined),
      headline: `${alertName} in effect for ${str(p.feature_name_en) ?? "area"}`,
      areaDescription: str(p.feature_name_en),
      sender: "Environment and Climate Change Canada",
      status: str(p.status_en),
    },
  };
}

export const ecccAdapter: SourceAdapter = {
  ...SOURCE,
  async fetch(ctx: AdapterContext) {
    const feed = await fetchJson<FeatureCollection>(ECCC_ALERTS_URL, { signal: ctx.signal, timeoutMs: ctx.timeoutMs });
    return parseEccc(feed, ctx.now);
  },
};
