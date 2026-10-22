import type { Forecast, GaugeSnapshot, PlaceSearchResult, SavedPlace } from "@nearcast/shared";
import type { Store } from "../state/store.ts";

export const extrasKey = (place: SavedPlace, demo: boolean) => `${demo}:${place.latitude},${place.longitude},${Math.min(120, place.radiusKm)}`;
async function request<T>(path: string): Promise<T> {
  const r = await fetch(path, { signal: AbortSignal.timeout(25000), headers: { accept: "application/json" } });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message ?? `Source request failed (${r.status})`);
  return data as T;
}
export async function searchPlaces(q: string, demo = false): Promise<PlaceSearchResult[]> {
  if (q.trim().length < 3) throw new Error("Enter at least three characters.");
  if (demo) return [{ name: "DEMO · Squamish, BC", latitude: 49.7, longitude: -123.15, precision: "SYNTHETIC LOCALITY" }];
  const data = await request<{results: PlaceSearchResult[]}>(`/api/places/search?q=${encodeURIComponent(q)}`);
  if (!Array.isArray(data.results)) throw new Error("Unexpected search response");
  return data.results;
}
export async function loadPlaceExtra(store: Store, place: SavedPlace, kind: "forecast" | "gauges") {
  const demo = store.getState().mock, key = extrasKey(place, demo);
  if (store.getState().placeExtras[key]?.[`${kind}Loading`]) return;
  const patch = (value: object) => store.set((s) => ({ placeExtras: {
    ...Object.fromEntries(Object.entries(s.placeExtras).slice(-39)), [key]: { ...s.placeExtras[key], ...value },
  } }));
  patch({ [`${kind}Loading`]: true, [`${kind}Error`]: undefined });
  try {
    const now = new Date().toISOString();
    const data = demo ? kind === "forecast" ? {
      latitude: place.latitude, longitude: place.longitude, updatedAt: now, retrievedAt: now, demo: true,
      sourceUrl: "https://www.met.no/en", attribution: "Synthetic demonstration forecast; not a prediction.",
      periods: Array.from({length: 24}, (_, i) => ({ time: new Date(Date.now()+i*3600_000).toISOString(), temperatureC: 12+Math.round(3*Math.sin(i/4)), windKmh: 14, precipitationMm: 0.2, precipitationHours: 1, symbol: "cloudy" })),
    } as Forecast : {
      demo: true, retrievedAt: now, truncated: false, rejectedCount: 0, gauges: [{ id: "demo", name: "DEMO · Valley river", latitude: place.latitude, longitude: place.longitude,
        observedAt: now, levelMetres: 1.45, dischargeCMS: 22, changeMetres: 0.08, windowHours: 24, sourceUrl: "https://wateroffice.ec.gc.ca/" }],
    } as GaugeSnapshot : await request<Forecast | GaugeSnapshot>(`/api/${kind}?${new URLSearchParams({lat: place.latitude.toFixed(3), lon: place.longitude.toFixed(3), radiusKm: String(Math.min(120, place.radiusKm))})}`);
    if (data.demo !== demo || !("retrievedAt" in data) || (kind === "forecast" ? !Array.isArray((data as Forecast).periods) : !Array.isArray((data as GaugeSnapshot).gauges))) throw new Error("Unexpected place response");
    patch({ [kind]: data }); return data;
  } catch (e) { patch({ [`${kind}Error`]: (e as Error).message }); throw e; }
  finally { patch({ [`${kind}Loading`]: false }); }
}
