import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";
import { distanceToGeometryKm, geometryContains, validGeometry } from "@nearcast/shared";
import { createStore, initialState } from "../src/state/store.ts";
import { PLACES_STORAGE_KEY, readPreferences } from "../src/state/preferences.ts";
import { briefText, placeContext } from "../src/state/place-context.ts";
import { DEMO_PLACE, demoAwareness } from "../src/services/demo-awareness.ts";
import { TOOL_SPECS, bindTool } from "../src/webmcp/tools.ts";

const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
const polygon: Geometry = { type: "Polygon", coordinates: [[[-124,49],[-122,49],[-122,51],[-124,51],[-124,49]], [[-123.8,49.2],[-123.6,49.2],[-123.6,49.4],[-123.8,49.4],[-123.8,49.2]]] };
const now = new Date("2026-10-14T12:00:00Z");

describe("place matching uses the published geometry", () => {
  it("includes a place inside a large polygon even when its centre is beyond the watch radius", () => {
    expect(geometryContains([-123.9,50], polygon)).toBe(true);
    expect(distanceToGeometryKm([-123.9,50], polygon)).toBe(0);
  });
  it("excludes polygon holes and measures distance to their boundary", () => {
    expect(geometryContains([-123.7,49.3], polygon)).toBe(false);
    expect(distanceToGeometryKm([-123.7,49.3], polygon)).toBeGreaterThan(5);
    expect(geometryContains([-123.8,49.3], polygon)).toBe(true);
  });
  it("includes separate islands and finds road segments whose endpoints are distant", () => {
    const multi: Geometry = { type: "MultiPolygon", coordinates: [(polygon as Extract<Geometry, { type: "Polygon" }>).coordinates, [[[10,10],[11,10],[11,11],[10,11],[10,10]]]] };
    expect(geometryContains([10.5,10.5], multi)).toBe(true);
    expect(distanceToGeometryKm([0,0.01], { type: "LineString", coordinates: [[-1,0],[1,0]] })).toBeCloseTo(1.112, 2);
  });
  it("handles dateline-crossing polygons without matching the other side of the planet", () => {
    const crossing: Geometry = { type: "Polygon", coordinates: [[[179,10],[-179,10],[-179,12],[179,12],[179,10]]] };
    expect(geometryContains([179.5,11], crossing)).toBe(true);
    expect(geometryContains([-179.5,11], crossing)).toBe(true);
    expect(geometryContains([0,11], crossing)).toBe(false);
  });
  it("rejects malformed geometries instead of fabricating a location", () => {
    expect(validGeometry({ type: "Point", coordinates: [200,49] })).toBe(false);
    expect(validGeometry({ type: "Polygon", coordinates: [[[0,0],[1,0],[0,1]]] })).toBe(false);
    expect(validGeometry(polygon)).toBe(true);
  });
});

describe("saved places and persistence", () => {
  it("adds, edits, selects, reloads and removes through a single store", () => {
    const storage = memory(), store = createStore(initialState, storage);
    const place = store.savePlace(DEMO_PLACE);
    expect(store.getState()).toMatchObject({ activePlaceId: place.id, workspaceView: "places", camera: { kind: "bounds" } });
    store.savePlace({ ...place, name: "Updated cabin", radiusKm: 40 });
    const reloaded = createStore(initialState, storage);
    expect(reloaded.getState().places).toEqual([{ ...place, name: "Updated cabin", radiusKm: 40 }]);
    reloaded.removePlace(place.id);
    expect(createStore(initialState, storage).getState().places).toEqual([]);
    expect(reloaded.getState().activePlaceId).toBeUndefined();
  });
  it("tolerates corrupted/unsupported storage and rejects invalid persisted coordinates", () => {
    const storage = memory(); storage.setItem(PLACES_STORAGE_KEY, "{broken");
    expect(readPreferences(storage).places).toEqual([]);
    storage.setItem(PLACES_STORAGE_KEY, JSON.stringify({ version: 1, places: [{ ...DEMO_PLACE, id: "bad", latitude: 999 }, { ...DEMO_PLACE, id: "valid" }], activePlaceId: "bad" }));
    expect(readPreferences(storage).activePlaceId).toBe("valid");
    storage.setItem(PLACES_STORAGE_KEY, JSON.stringify({ version: 99, places: [{ ...DEMO_PLACE, id: "future" }] }));
    expect(readPreferences(storage).places).toEqual([]);
  });
  it("reports unavailable storage without discarding session changes", () => {
    const store = createStore(initialState, { getItem: () => null, setItem: () => { throw new Error("QuotaExceeded"); } });
    store.savePlace(DEMO_PLACE);
    expect(store.getState().places).toHaveLength(1);
    expect(store.getState().persistenceError).toContain("may not survive");
    expect(() => store.savePlace({ ...DEMO_PLACE, latitude: NaN })).toThrow(/valid coordinates/);
    expect(() => store.savePlace({ ...DEMO_PLACE, radiusKm: 0 })).toThrow();
  });
  it("persists camera pins and supports removing a pin whose source disappeared", () => {
    const storage = memory(), store = createStore(initialState, storage);
    store.setAwareness(demoAwareness(now)); store.pinCamera("drivebc-camera:demo", true);
    const reloaded = createStore(initialState, storage);
    expect(reloaded.getState().pinnedCameraIds).toEqual(["drivebc-camera:demo"]);
    reloaded.pinCamera("drivebc-camera:demo", false);
    expect(reloaded.getState().pinnedCameraIds).toEqual([]);
  });
});

function seeded() {
  const store = createStore({ ...initialState, mock: true, retrievedAt: now.toISOString() }, memory());
  store.setAwareness(demoAwareness(now));
  const place = store.savePlace(DEMO_PLACE);
  return { store, place };
}
describe("personal briefs and WebMCP share semantics", () => {
  it("uses geometry matching for the UI, tool and brief, preserves sources and demo labeling", async () => {
    const { store, place } = seeded();
    const context = placeContext(store.getState(), place, now);
    expect(context.nearby).toHaveLength(8);
    expect(context.nearby.find((e) => e.item.kind === "evacuation")?.coversPlace).toBe(true);
    const tool = TOOL_SPECS.find((t) => t.name === "get_place_context")!;
    const result = (await tool.run({ placeId: place.id }, store)).result as any;
    expect(result.counts).toMatchObject({ evacuations: 1, airQuality: 1, roads: 1, cameras: 1 });
    expect(result.evacuations[0].coversPlace).toBe(true);
    expect(result.evacuations[0].geometry).toBeUndefined();
    const text = briefText(context);
    expect(text).toContain("DEMO — SYNTHETIC DATA"); expect(text).toContain("https://www.emergencyinfobc.gov.bc.ca/");
    expect(text).toContain("BC only"); expect(text).toContain(now.toISOString());
  });
  it("does not mix demo/live feeds, misrepresent empty coverage, or retain expired snapshots", () => {
    const { store, place } = seeded();
    store.set({ mock: false });
    expect(placeContext(store.getState(), place, now).nearby).toEqual([]);
    const live = { ...demoAwareness(now), demo: false };
    store.setAwareness(live);
    const context = placeContext(store.getState(), place, new Date(now.getTime() + 1800_001));
    expect(context.nearby).toEqual([]); expect(context.warnings.join(" ")).toContain("withheld");
    expect(briefText(context)).toContain("does not establish safe conditions");
  });
  it("reports endpoint failure even when previously loaded records remain", () => {
    const { store, place } = seeded(); store.setAwarenessError("offline");
    const context = placeContext(store.getState(), place, now);
    expect(context.nearby).toHaveLength(8); expect(context.warnings.join(" ")).toContain("may be stale");
  });
  it("does not reset an old provider's lifetime when another provider refreshes", () => {
    const { store, place } = seeded();
    const later = new Date(now.getTime() + 31 * 60_000);
    const snapshot = { ...demoAwareness(later), demo: false };
    snapshot.sources = snapshot.sources.map((s) => s.id === "drivebc-roads" ? { ...s, status: "stale", retrievedAt: now.toISOString() } : s);
    store.set({ mock: false, awareness: snapshot });
    const context = placeContext(store.getState(), place, later);
    expect(context.nearby.some((e) => e.item.kind === "road")).toBe(false);
    expect(context.nearby).toHaveLength(7);
    expect(context.warnings.join(" ")).toContain("withheld");
  });
  it("compares places without changing focus and rejects repeated/missing place ids", async () => {
    const { store, place } = seeded();
    const far = store.savePlace({ name: "Toronto", latitude: 43.65, longitude: -79.38, radiusKm: 25 });
    const tool = TOOL_SPECS.find((t) => t.name === "compare_saved_places")!;
    const result = (await tool.run({ placeIds: [place.id, far.id] }, store)).result as any;
    expect(result.places[0].counts.roads).toBe(1); expect(result.places[1].counts.roads).toBe(0);
    expect(store.getState().activePlaceId).toBe(far.id);
    expect(() => tool.run({ placeIds: [far.id, far.id] }, store)).toThrow(/distinct/);
  });
  it("routes agent mutations to the UI state and returns structured errors", async () => {
    const { store, place } = seeded();
    const focus = TOOL_SPECS.find((t) => t.name === "focus_context_item")!;
    focus.run({ itemId: "demo-road" }, store);
    expect(store.getState()).toMatchObject({ selectedContextId: "demo-road", camera: { kind: "bounds" } });
    const context = (await TOOL_SPECS.find((t) => t.name === "create_situation_context")!.run({ placeId: place.id }, store)).result as any;
    expect(context.counts.roads).toBe(1);
    const bound = bindTool(focus, store);
    expect(await bound.execute({ itemId: "missing" })).toMatchObject({ isError: true });
  });
});
