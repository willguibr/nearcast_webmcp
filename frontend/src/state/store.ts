import type { Bbox, CountryCode, Hazard, HazardSeverity, HazardType, SourceMeta } from "@nearcast/shared";
import { NORTH_AMERICA_BBOX, bboxContains, meetsMinimumSeverity } from "@nearcast/shared";

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
export function createStore(init: AppState = initialState) {
  let state = init;
  const listeners = new Set<Listener>();
  let seq = 0;
  let activityId = 0;

  const set = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
    const next = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };

  const api = {
    getState: () => state,
    subscribe: (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; },
    set,

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

    selectHazard(id: string | undefined) { set({ selectedHazardId: id }); },
    /** Select + move the camera — the same path a human click uses, plus a camera move. */
    focusHazard(id: string): Hazard | undefined {
      const h = state.hazards.find((x) => x.id === id);
      if (!h) return undefined;
      set({ selectedHazardId: id, camera: cameraForHazard(h, ++seq) });
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
