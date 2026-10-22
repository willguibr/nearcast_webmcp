import { validPlace, type SavedPlace } from "@nearcast/shared";

export const PLACES_STORAGE_KEY = "nearcast.places.v1";
export interface PreferenceStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface Preferences { places: SavedPlace[]; activePlaceId?: string; pinnedCameraIds: string[] }
export function parsePlaceBackup(text: string): Preferences {
  if (text.length > 100_000) throw new Error("Backup is too large (maximum 100 KB).");
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("Choose a valid Nearcast JSON backup."); }
  if (data?.version !== 1 || !Array.isArray(data.places) || data.places.length > 20 || !data.places.every(validPlace)
    || new Set(data.places.map((p: SavedPlace) => p.id)).size !== data.places.length
    || !Array.isArray(data.pinnedCameraIds) || data.pinnedCameraIds.length > 30
    || !data.pinnedCameraIds.every((id: unknown) => typeof id === "string" && id.startsWith("drivebc-camera:") && id.length <= 100))
    throw new Error("Invalid backup. Expected version 1, up to 20 valid places and up to 30 camera pins.");
  return readPreferences({ getItem: () => text, setItem: () => {} });
}
export function exportPlaceBackup(preferences: Preferences): string {
  return JSON.stringify({ version: 1, places: preferences.places, activePlaceId: preferences.activePlaceId, pinnedCameraIds: preferences.pinnedCameraIds }, null, 2);
}
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
