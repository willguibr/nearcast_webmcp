import { distanceToGeometryKm, validGeometry, type Forecast, type ForecastPeriod, type GaugeSnapshot, type PlaceSearchResult, type RiverGauge } from "@nearcast/shared";
import { fetchDocument, features, isRow, iso, number, str, type Row } from "../adapters/canada/feed-utils.ts";

const USER_AGENT = "Nearcast/0.2 (+https://github.com/willguibr/nearcast_webmcp)";
export class InputError extends Error {}
export function coordinates(query: Record<string, string | undefined>) {
  const latitude = number(query.lat), longitude = number(query.lon), radiusKm = number(query.radiusKm ?? "25");
  if (latitude === undefined || Math.abs(latitude) > 85 || longitude === undefined || Math.abs(longitude) > 180
    || radiusKm === undefined || radiusKm < 1 || radiusKm > 120) throw new InputError("Supply lat (-85…85), lon (-180…180) and radiusKm (1…120).");
  return { latitude: Math.round(latitude * 1000) / 1000, longitude: Math.round(longitude * 1000) / 1000, radiusKm };
}

export function parseForecast(body: unknown, latitude: number, longitude: number, now = new Date()): Forecast {
  const props = isRow(body) ? body.properties : undefined;
  if (!isRow(props) || !Array.isArray(props.timeseries) || !iso(props.meta?.updated_at)) throw new Error("Unexpected forecast schema");
  if (props.meta?.units?.air_temperature !== "celsius" || props.meta?.units?.wind_speed !== "m/s" || props.meta?.units?.precipitation_amount !== "mm") throw new Error("Unrecognized forecast units");
  const periods: ForecastPeriod[] = [];
  for (const entry of props.timeseries) {
    const time = iso(entry?.time), detail = entry?.data?.instant?.details;
    const temperatureC = number(detail?.air_temperature);
    if (!time || temperatureC === undefined || Date.parse(time) < now.getTime() - 3600_000 || Date.parse(time) > now.getTime() + 72 * 3600_000) continue;
    const hours = entry.data.next_1_hours ? 1 : entry.data.next_6_hours ? 6 : undefined;
    const next = hours ? entry.data[`next_${hours}_hours`] : undefined;
    const wind = number(detail?.wind_speed);
    periods.push({ time, temperatureC, windKmh: wind === undefined ? undefined : Math.round(wind * 3.6),
      precipitationMm: number(next?.details?.precipitation_amount), precipitationHours: hours, symbol: str(next?.summary?.symbol_code) || undefined });
  }
  if (!periods.length) throw new Error("No current forecast periods available");
  return { latitude, longitude, periods: periods.slice(0, 72), updatedAt: iso(props.meta.updated_at)!, retrievedAt: now.toISOString(),
    sourceUrl: "https://www.met.no/en", attribution: "Forecast data: MET Norway, CC BY 4.0. Wind converted to km/h; periods limited to 72 hours.", demo: false };
}

export function parseGauges(body: unknown, latitude: number, longitude: number, radiusKm: number, now = new Date()): GaugeSnapshot {
  const groups = new Map<string, RiverGauge[]>(); let rejectedCount = 0;
  for (const f of features(body)) {
    const p = f.properties, observedAt = iso(p?.DATETIME);
    if (!isRow(p) || !str(p.STATION_NUMBER) || !observedAt || !validGeometry(f.geometry) || f.geometry.type !== "Point"
      || (number(p.LEVEL) === undefined && number(p.DISCHARGE) === undefined)) { rejectedCount++; continue; }
    if (Date.parse(observedAt) > now.getTime() + 5 * 60_000 || Date.parse(observedAt) < now.getTime() - 30 * 3600_000
      || distanceToGeometryKm([longitude, latitude], f.geometry) > radiusKm) continue;
    const id = str(p.STATION_NUMBER);
    const row: RiverGauge = { id, name: str(p.STATION_NAME) || id, observedAt,
      longitude: f.geometry.coordinates[0], latitude: f.geometry.coordinates[1], levelMetres: number(p.LEVEL), dischargeCMS: number(p.DISCHARGE),
      sourceUrl: `https://wateroffice.ec.gc.ca/report/real_time_e.html?stn=${encodeURIComponent(id)}` };
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  if (features(body).length && rejectedCount === features(body).length) throw new Error("No gauge records could be parsed");
  const gauges = [...groups.values()].map((rows) => {
    rows.sort((a,b) => a.observedAt.localeCompare(b.observedAt));
    const last = rows[rows.length - 1], first = rows.find((r) => r.levelMetres !== undefined);
    if (last.levelMetres !== undefined && first && first.observedAt < last.observedAt) {
      last.changeMetres = last.levelMetres - first.levelMetres!;
      last.windowHours = (Date.parse(last.observedAt) - Date.parse(first.observedAt)) / 3600_000;
    }
    return last;
  }).sort((a,b) => a.name.localeCompare(b.name));
  return { gauges, retrievedAt: now.toISOString(), truncated: false, rejectedCount, demo: false };
}

/** Small bounded cache + request coalescing. No address or coordinates are logged. */
export function createPlaceServices() {
  const cache = new Map<string, { value: unknown; expires: number; modified?: string }>();
  const pending = new Map<string, Promise<any>>();
  async function cached<T>(key: string, load: (old?: { value: unknown; expires: number; modified?: string }) => Promise<{ value: T; expires: number; modified?: string }>): Promise<T> {
    const old = cache.get(key);
    if (old && old.expires > Date.now()) return old.value as T;
    if (pending.has(key)) return pending.get(key);
    const work = load(old).then((entry) => {
      if (cache.size >= 256) cache.delete(cache.keys().next().value!);
      cache.set(key, entry); return entry.value;
    }).finally(() => pending.delete(key));
    pending.set(key, work); return work;
  }
  return {
    async search(query: string): Promise<PlaceSearchResult[]> {
      const q = query.trim();
      if (q.length < 3 || q.length > 200) throw new InputError("Enter a BC address or place name between 3 and 200 characters.");
      return cached(`search:${q.toLowerCase()}`, async () => {
        const url = new URL("https://geocoder.api.gov.bc.ca/addresses.json");
        url.search = new URLSearchParams({ addressString: q, maxResults: "5", outputSRS: "4326" }).toString();
        const body = await fetchDocument(url.href, AbortSignal.timeout(8000));
        const value = features(body).flatMap((f): PlaceSearchResult[] => validGeometry(f.geometry) && f.geometry.type === "Point" && str(f.properties?.fullAddress)
          ? [{ name: str(f.properties.fullAddress), latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0], precision: str(f.properties.matchPrecision) }] : []);
        return { value, expires: Date.now() + 86400_000 };
      });
    },
    async forecast(query: Record<string, string | undefined>): Promise<Forecast> {
      const { latitude, longitude } = coordinates(query);
      return cached(`forecast:${latitude},${longitude}`, async (old) => {
        const response = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${latitude}&lon=${longitude}`, {
          signal: AbortSignal.timeout(10000), headers: { "User-Agent": USER_AGENT, ...(old?.modified ? { "If-Modified-Since": old.modified } : {}) },
        });
        if (!response.ok && response.status !== 304) throw new Error(`Forecast provider HTTP ${response.status}`);
        const value = response.status === 304 && old ? old.value as Forecast : parseForecast(await response.json(), latitude, longitude);
        return { value, expires: Math.max(Date.now() + 60_000, Date.parse(response.headers.get("Expires") ?? "") || Date.now() + 3600_000), modified: response.headers.get("Last-Modified") ?? old?.modified };
      });
    },
    async gauges(query: Record<string, string | undefined>): Promise<GaugeSnapshot> {
      const { latitude, longitude, radiusKm } = coordinates(query);
      return cached(`gauges:${latitude},${longitude},${radiusKm}`, async () => {
        const now = new Date(), dy = radiusKm / 110.5, dx = dy / Math.max(0.08, Math.cos(latitude * Math.PI / 180));
        const bbox = [Math.max(-180, longitude-dx), Math.max(-90, latitude-dy), Math.min(180, longitude+dx), Math.min(90, latitude+dy)].map((n) => n.toFixed(4)).join(",");
        const all: Row[] = []; let truncated = false;
        const signal = AbortSignal.timeout(18000);
        for (let page = 0; page < 5; page++) {
          const q = new URLSearchParams({ bbox, datetime: `${new Date(now.getTime()-30*3600_000).toISOString()}/..`, limit: "2000", offset: String(page*2000), sortby: "-DATETIME", f: "json" });
          const body = await fetchDocument(`https://api.weather.gc.ca/collections/hydrometric-realtime/items?${q}`, signal);
          const rows = features(body); all.push(...rows);
          const next = body.links?.some((l: Row) => l.rel === "next");
          truncated = !!next || Number(body.numberMatched) > all.length;
          if (!truncated || rows.length === 0) break;
        }
        const value = { ...parseGauges({ type: "FeatureCollection", features: all }, latitude, longitude, radiusKm, now), truncated };
        return { value, expires: Date.now()+10*60_000 };
      });
    },
  };
}
export const placeServices = createPlaceServices();
