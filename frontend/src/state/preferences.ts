import { validPlace, type SavedPlace } from "@nearcast/shared";

export const PLACES_STORAGE_KEY = "nearcast.places.v1";
export interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface Preferences { places: SavedPlace[]; activePlaceId?: string; pinnedCameraIds: string[] }
export function readPreferences(storage?: PreferenceStorage): Preferences {
  const empty: Preferences = { places: [], pinnedCameraIds: [] };
  if (!storage) return empty;
  try {
    const data = JSON.parse(storage.getItem(PLACES_STORAGE_KEY) ?? "null");
    if (data?.version !== 1 || !Array.isArray(data.places)) return empty;
    const seen = new Set<string>();
    const places = data.places.filter((p: unknown): p is SavedPlace => {
      if (!validPlace(p) || seen.has(p.id)) return false;
      seen.add(p.id); return true;
    }).slice(0, 20).map((p: SavedPlace) => ({ id: p.id, name: p.name.trim(), latitude: p.latitude, longitude: p.longitude, radiusKm: p.radiusKm }));
    return { places, activePlaceId: places.some((p: SavedPlace) => p.id === data.activePlaceId) ? data.activePlaceId : places[0]?.id,
      pinnedCameraIds: Array.isArray(data.pinnedCameraIds) ? [...new Set<string>(data.pinnedCameraIds.filter((id: unknown) => typeof id === "string" && id.startsWith("drivebc-camera:") && id.length <= 100))].slice(0, 30) : [] };
  } catch { return empty; }
}

export function browserStorage(): PreferenceStorage | undefined {
  try { return typeof window !== "undefined" ? window.localStorage : undefined; } catch { return undefined; }
}
