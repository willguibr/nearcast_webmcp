import type { Bbox, CountryCode, Hazard, HazardSeverity, HazardType, SourceMeta } from "@nearcast/shared";
import { NORTH_AMERICA_BBOX, bboxContains, meetsMinimumSeverity } from "@nearcast/shared";
import { radiusBounds, validPlace, geometryBbox, usableAwarenessItems, type SavedPlace, type AwarenessSnapshot, type AwarenessKind } from "@nearcast/shared";
import { PLACES_STORAGE_KEY, readPreferences, type PreferenceStorage } from "./preferences.ts";

/** Filters shared by the human UI and the WebMCP tools. */
export interface Filters {
  countries: CountryCode[];
  hazardTypes: HazardType[];
  /** Applies to weather alerts (government-issued severity). */
  minimumSeverity?: HazardSeverity;
  minimumEarthquakeMagnitude?: number;
}

export interface ViewState {
  bounds: Bbox;
  center: [number, number];
  zoom: number;
}

export type CameraRequest =
  | { seq: number; kind: "bounds"; bbox: Bbox; padding?: number }
  | { seq: number; kind: "center"; center: [number, number]; zoom: number };

export interface ActivityEntry {
  id: number;
  at: string;
  tool: string;
  summary: string;
  ok: boolean;
}

export type WebMcpStatus = "pending" | "available" | "emulated" | "unavailable";

export interface AppState {
  places: SavedPlace[];
  activePlaceId?: string;
  pinnedCameraIds: string[];
  persistenceError?: string;
  awareness?: AwarenessSnapshot;
  awarenessLoading: boolean;
  awarenessError?: string;
  awarenessLayers: AwarenessKind[];
  selectedContextId?: string;
  workspaceView: "places" | "explore";
  pickingPlace: boolean;
  pickedCoordinate?: [number, number];
  hazards: Hazard[];
  sources: SourceMeta[];
  retrievedAt?: string;
  loading: boolean;
  error?: string;
  mock: boolean;
  filters: Filters;
  view: ViewState;
  camera: CameraRequest | null;
  selectedHazardId?: string;
  activity: ActivityEntry[];
  webmcp: WebMcpStatus;
  webmcpTools: string[];
}

export const DEFAULT_FILTERS: Filters = { countries: ["CA", "US"], hazardTypes: ["wildfire", "weather", "earthquake"] };

export const initialState: AppState = {
  places: [], pinnedCameraIds: [], awarenessLoading: false,
  awarenessLayers: ["air-quality", "evacuation", "road", "camera"], workspaceView: "places", pickingPlace: false,
  hazards: [],
  sources: [],
  loading: false,
  mock: false,
  filters: DEFAULT_FILTERS,
  view: { bounds: NORTH_AMERICA_BBOX, center: [-110, 50], zoom: 3 },
  camera: null,
  activity: [],
  webmcp: "pending",
  webmcpTools: [],
};

type Listener = () => void;

/** Tiny external store (useSyncExternalStore-compatible). One state for humans and agents. */
export function createStore(init: AppState = initialState, storage?: PreferenceStorage) {
  let state = storage ? { ...init, ...readPreferences(storage) } : init;
  const listeners = new Set<Listener>();
  let seq = 0;
  let activityId = 0;

  const set = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
    const next = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };

  const persist = () => {
    try {
      if (!storage) throw new Error("Storage is unavailable");
      const { places, activePlaceId, pinnedCameraIds } = state;
      storage.setItem(PLACES_STORAGE_KEY, JSON.stringify({ version: 1, places, activePlaceId, pinnedCameraIds }));
      set({ persistenceError: undefined });
    } catch { set({ persistenceError: "Browser storage is unavailable. Changes work for this session but may not survive a reload." }); }
  };

  const api = {
    getState: () => state,
    subscribe: (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; },
    set,

    savePlace(input: Omit<SavedPlace, "id"> & { id?: string }): SavedPlace {
      if (input.id && !state.places.some((p) => p.id === input.id)) throw new Error("Place not found");
      const place = { id: input.id ?? crypto.randomUUID(), name: typeof input.name === "string" ? input.name.trim() : "",
        latitude: input.latitude, longitude: input.longitude, radiusKm: input.radiusKm };
      if (!validPlace(place)) throw new Error("Enter a name (1–80 characters), valid coordinates (latitude ±85, longitude ±180), and a radius of 1–250 km.");
      if (!input.id && state.places.length >= 20) throw new Error("You can save up to 20 places. Remove a place before adding another.");
      set({ places: input.id ? state.places.map((p) => p.id === place.id ? place : p) : [...state.places, place] });
      api.activatePlace(place.id);
      return place;
    },
    removePlace(id: string) {
      const places = state.places.filter((p) => p.id !== id);
      const activePlaceId = state.activePlaceId === id ? places[0]?.id : state.activePlaceId;
      set({ places, activePlaceId, selectedContextId: undefined });
      if (activePlaceId) api.activatePlace(activePlaceId); else persist();
    },
    activatePlace(id: string) {
      const place = state.places.find((p) => p.id === id);
      if (!place) throw new Error("Place not found");
      set({ activePlaceId: id, workspaceView: "places", selectedContextId: undefined, selectedHazardId: undefined,
        camera: { seq: ++seq, kind: "bounds", bbox: radiusBounds(place.longitude, place.latitude, place.radiusKm), padding: 45 } });
      persist();
    },
    setAwareness(snapshot: AwarenessSnapshot) { set({ awareness: snapshot, awarenessLoading: false, awarenessError: undefined }); },
    setAwarenessError(message: string) { set({ awarenessError: message, awarenessLoading: false }); },
    toggleAwarenessLayer(kind: AwarenessKind) {
      set({ awarenessLayers: state.awarenessLayers.includes(kind) ? state.awarenessLayers.filter((k) => k !== kind) : [...state.awarenessLayers, kind] });
    },
    focusContext(id: string) {
      const item = usableAwarenessItems(state.awareness, state.mock).find((x) => x.id === id);
      if (!item) throw new Error("This item is no longer in the loaded snapshot. Refresh the place context.");
      const bbox = geometryBbox(item.geometry);
      const camera: CameraRequest | null = bbox
        ? bbox[0] === bbox[2] && bbox[1] === bbox[3]
          ? { seq: ++seq, kind: "center", center: [bbox[0], bbox[1]], zoom: 11 }
          : { seq: ++seq, kind: "bounds", bbox, padding: 60 } : null;
      set({ selectedContextId: id, selectedHazardId: undefined, camera,
        awarenessLayers: state.awarenessLayers.includes(item.kind) ? state.awarenessLayers : [...state.awarenessLayers, item.kind] });
      return item;
    },
    pinCamera(id: string, pinned: boolean) {
      if (!state.awareness?.items.some((i) => i.kind === "camera" && i.id === id) && pinned) throw new Error("Camera not found");
      const next = pinned ? [...new Set([...state.pinnedCameraIds, id])] : state.pinnedCameraIds.filter((x) => x !== id);
      if (next.length > 30) throw new Error("You can pin up to 30 cameras");
      set({ pinnedCameraIds: next }); persist();
    },

    setData(data: { hazards: Hazard[]; sources: SourceMeta[]; retrievedAt: string; mock: boolean }) {
      set((s) => ({
        ...data, loading: false, error: undefined,
        selectedHazardId: s.selectedHazardId && data.hazards.some((h) => h.id === s.selectedHazardId) ? s.selectedHazardId : undefined,
      }));
    },
    setLoading(loading: boolean) { set({ loading }); },
    setError(error: string | undefined) { set({ error, loading: false }); },

    setFilters(patch: Partial<Filters>) {
      set((s) => ({ filters: normalizeFilters({ ...s.filters, ...patch }) }));
    },
    resetFilters() { set({ filters: DEFAULT_FILTERS }); },

    /** Called by the map after the human (or a camera request) moves it. */
    setView(view: ViewState) { set({ view }); },

    focusBounds(bbox: Bbox, padding = 40) { set({ camera: { seq: ++seq, kind: "bounds", bbox, padding } }); },
    focusPoint(center: [number, number], zoom: number) { set({ camera: { seq: ++seq, kind: "center", center, zoom } }); },

    selectHazard(id: string | undefined) { set({ selectedHazardId: id, selectedContextId: undefined }); },
    /** Select + move the camera — the same path a human click uses, plus a camera move. */
    focusHazard(id: string): Hazard | undefined {
      const h = state.hazards.find((x) => x.id === id);
      if (!h) return undefined;
      set({ selectedHazardId: id, selectedContextId: undefined, camera: cameraForHazard(h, ++seq) });
      return h;
    },

    logActivity(tool: string, summary: string, ok = true) {
      const entry: ActivityEntry = { id: ++activityId, at: new Date().toISOString(), tool, summary, ok };
      set((s) => ({ activity: [...s.activity.slice(-49), entry] }));
    },
    setWebmcp(status: WebMcpStatus, tools: string[] = []) { set({ webmcp: status, webmcpTools: tools }); },
  };
  return api;
}

export type Store = ReturnType<typeof createStore>;

export function normalizeFilters(f: Filters): Filters {
  const countries = [...new Set(f.countries)].filter((c): c is CountryCode => c === "CA" || c === "US");
  const hazardTypes = [...new Set(f.hazardTypes)].filter((t): t is HazardType => t === "wildfire" || t === "weather" || t === "earthquake");
  return {
    countries,
    hazardTypes,
    minimumSeverity: f.minimumSeverity && f.minimumSeverity !== "unknown" ? f.minimumSeverity : undefined,
    minimumEarthquakeMagnitude:
      f.minimumEarthquakeMagnitude != null && Number.isFinite(f.minimumEarthquakeMagnitude) && f.minimumEarthquakeMagnitude > 0
        ? f.minimumEarthquakeMagnitude : undefined,
  };
}

export function cameraForHazard(h: Hazard, seq: number): CameraRequest {
  if (h.geometry.type === "Polygon" || h.geometry.type === "MultiPolygon") {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    const rings = h.geometry.type === "Polygon" ? h.geometry.coordinates : h.geometry.coordinates.flat();
    for (const ring of rings) for (const [x, y] of ring) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    if (Number.isFinite(w)) return { seq, kind: "bounds", bbox: [w, s, e, n], padding: 80 };
  }
  return { seq, kind: "center", center: [h.longitude, h.latitude], zoom: h.type === "earthquake" ? 7 : 9 };
}

/** Hazard passes the shared filters (ignores map bounds). */
export function matchesFilters(h: Hazard, f: Filters): boolean {
  if (!f.countries.includes(h.country)) return false;
  if (!f.hazardTypes.includes(h.type)) return false;
  if (h.type === "weather" && f.minimumSeverity && !meetsMinimumSeverity(h.severity, f.minimumSeverity)) return false;
  if (h.type === "earthquake" && f.minimumEarthquakeMagnitude != null && (h.earthquake?.magnitude ?? -Infinity) < f.minimumEarthquakeMagnitude) return false;
  return true;
}

const SIG = { high: 2, moderate: 1, low: 0 } as const;
export function bySignificance(a: Hazard, b: Hazard): number {
  return SIG[b.significance] - SIG[a.significance] || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.id.localeCompare(b.id);
}

let filteredCache: { hazards: Hazard[]; filters: Filters; result: Hazard[] } | null = null;
/** Hazards after filters — what the map renders. Memoized on reference identity. */
export function selectFilteredHazards(s: AppState): Hazard[] {
  if (filteredCache && filteredCache.hazards === s.hazards && filteredCache.filters === s.filters) return filteredCache.result;
  const result = s.hazards.filter((h) => matchesFilters(h, s.filters)).sort(bySignificance);
  filteredCache = { hazards: s.hazards, filters: s.filters, result };
  return result;
}

let visibleCache: { filtered: Hazard[]; view: ViewState; result: Hazard[] } | null = null;
/** Filtered hazards whose representative point lies inside the current map bounds. */
export function selectVisibleHazards(s: AppState): Hazard[] {
  const filtered = selectFilteredHazards(s);
  if (visibleCache && visibleCache.filtered === filtered && visibleCache.view === s.view) return visibleCache.result;
  const result = filtered.filter((h) => bboxContains(s.view.bounds, h.longitude, h.latitude));
  visibleCache = { filtered, view: s.view, result };
  return result;
}

export function selectSelectedHazard(s: AppState): Hazard | undefined {
  return s.selectedHazardId ? s.hazards.find((h) => h.id === s.selectedHazardId) : undefined;
}
