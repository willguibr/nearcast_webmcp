import { describe, expect, it } from "vitest";
import type { HazardsResponse } from "@nearcast/shared";
import mock from "../../examples/mock-hazards.json";
import { createStore, initialState, normalizeFilters, selectFilteredHazards, selectVisibleHazards } from "../src/state/store.ts";

const body = mock as unknown as HazardsResponse;
function seeded() {
  const s = createStore(initialState);
  s.setData({ hazards: body.data, sources: body.meta.sources, retrievedAt: body.meta.retrievedAt, mock: true });
  return s;
}

describe("store filters", () => {
  it("filters by country, type, severity and magnitude", () => {
    const s = seeded();
    expect(selectFilteredHazards(s.getState()).length).toBe(body.data.length);
    s.setFilters({ countries: ["CA"] });
    expect(selectFilteredHazards(s.getState()).every((h) => h.country === "CA")).toBe(true);
    s.setFilters({ hazardTypes: ["earthquake"], minimumEarthquakeMagnitude: 4 });
    const eq = selectFilteredHazards(s.getState());
    expect(eq.length).toBeGreaterThan(0);
    expect(eq.every((h) => h.type === "earthquake" && (h.earthquake?.magnitude ?? 0) >= 4)).toBe(true);
    s.setFilters({ hazardTypes: ["weather", "wildfire"], minimumSeverity: "severe", countries: ["CA", "US"] });
    const f = selectFilteredHazards(s.getState());
    expect(f.some((h) => h.type === "wildfire")).toBe(true); // severity applies to weather only
    expect(f.filter((h) => h.type === "weather").every((h) => h.severity === "severe" || h.severity === "extreme")).toBe(true);
  });
  it("normalizes odd filter input", () => {
    const f = normalizeFilters({ countries: ["CA", "CA", "XX" as never], hazardTypes: ["weather"], minimumSeverity: "unknown", minimumEarthquakeMagnitude: 0 });
    expect(f).toEqual({ countries: ["CA"], hazardTypes: ["weather"], minimumSeverity: undefined, minimumEarthquakeMagnitude: undefined });
  });
  it("memoizes filtered results by reference", () => {
    const s = seeded();
    const a = selectFilteredHazards(s.getState());
    expect(selectFilteredHazards(s.getState())).toBe(a);
    s.setFilters({ countries: ["US"] });
    expect(selectFilteredHazards(s.getState())).not.toBe(a);
  });
});

describe("store view + selection", () => {
  it("visible hazards follow the map bounds set by the human", () => {
    const s = seeded();
    s.setView({ bounds: [-130, 49.2, -114, 60], center: [-122, 54], zoom: 5 }); // BC, north of the US border
    const v = selectVisibleHazards(s.getState());
    expect(v.length).toBeGreaterThan(0);
    expect(v.every((h) => h.longitude >= -130 && h.longitude <= -114)).toBe(true);
    expect(v.some((h) => h.regionCode === "WA")).toBe(false);
  });
  it("focusHazard selects and requests a camera move; unknown ids are ignored", () => {
    const s = seeded();
    const fire = body.data.find((h) => h.type === "wildfire")!;
    expect(s.focusHazard(fire.id)?.id).toBe(fire.id);
    expect(s.getState().selectedHazardId).toBe(fire.id);
    expect(s.getState().camera).toMatchObject({ kind: "center", center: [fire.longitude, fire.latitude] });
    const poly = body.data.find((h) => h.geometry.type === "Polygon")!;
    s.focusHazard(poly.id);
    expect(s.getState().camera?.kind).toBe("bounds");
    expect(s.focusHazard("nope")).toBeUndefined();
    expect(s.getState().selectedHazardId).toBe(poly.id);
  });
  it("drops the selection when new data no longer contains it", () => {
    const s = seeded();
    s.selectHazard(body.data[0].id);
    s.setData({ hazards: body.data.slice(1), sources: [], retrievedAt: "2026-09-02T19:00:00Z", mock: true });
    expect(s.getState().selectedHazardId).toBeUndefined();
  });
  it("keeps a bounded activity log", () => {
    const s = seeded();
    for (let i = 0; i < 60; i++) s.logActivity("t", `${i}`);
    expect(s.getState().activity.length).toBe(50);
    expect(s.getState().activity.at(-1)?.summary).toBe("59");
  });
});
