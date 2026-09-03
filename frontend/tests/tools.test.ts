import { describe, expect, it } from "vitest";
import type { HazardsResponse } from "@nearcast/shared";
import mock from "../../examples/mock-hazards.json";
import { createStore, initialState } from "../src/state/store.ts";
import { TOOL_SPECS, ToolError, bindTool, createTools, TOOL_NAMES } from "../src/webmcp/tools.ts";

const body = mock as unknown as HazardsResponse;
const spec = (name: string) => TOOL_SPECS.find((t) => t.name === name)!;
function seeded() {
  const s = createStore(initialState);
  s.setData({ hazards: body.data, sources: body.meta.sources, retrievedAt: body.meta.retrievedAt, mock: true });
  return s;
}

describe("tool catalogue", () => {
  it("registers the seven required tools plus the situation context tool with schemas and descriptions", () => {
    expect(TOOL_NAMES).toEqual(["get_current_view", "get_visible_hazards", "set_focus_area", "set_hazard_filters", "focus_hazard", "get_hazard_details", "compare_regions", "create_situation_context"]);
    for (const t of TOOL_SPECS) {
      expect(t.description.length).toBeGreaterThan(60);
      expect(t.inputSchema).toMatchObject({ type: "object" });
    }
    const tools = createTools(seeded());
    expect(tools.map((t) => t.annotations?.readOnlyHint)).toEqual([true, true, false, false, false, true, true, true]);
  });
});

describe("get_current_view reflects human changes", () => {
  it("reports bounds, filters, selection and counts from the shared store", () => {
    const s = seeded();
    s.setView({ bounds: [-130, 48, -114, 60], center: [-122, 54], zoom: 5 });
    s.setFilters({ hazardTypes: ["wildfire"] });
    const fire = body.data.find((h) => h.type === "wildfire" && h.regionCode === "BC")!;
    s.selectHazard(fire.id); // human click
    const { result } = spec("get_current_view").run({}, s) as { result: any };
    expect(result.map.bounds.west).toBe(-130);
    expect(result.filters.hazardTypes).toEqual(["wildfire"]);
    expect(result.selectedHazard.id).toBe(fire.id);
    expect(result.hazardsInView.total).toBeGreaterThan(0);
    expect(result.hazardsInView.weather).toBe(0);
    expect(result.data.demoData).toBe(true);
    expect(result.data.sources.length).toBe(6);
  });
});

describe("mutating tools change the same state the UI uses", () => {
  it("set_hazard_filters updates filters and returns counts", () => {
    const s = seeded();
    const { result } = spec("set_hazard_filters").run({ hazardTypes: ["wildfire", "weather"], minimumSeverity: "severe" }, s) as { result: any };
    expect(s.getState().filters.hazardTypes).toEqual(["wildfire", "weather"]);
    expect(s.getState().filters.minimumSeverity).toBe("severe");
    expect(result.hazardsMatchingFilters).toBeGreaterThan(0);
    spec("set_hazard_filters").run({ minimumSeverity: null }, s);
    expect(s.getState().filters.minimumSeverity).toBeUndefined();
    expect(() => spec("set_hazard_filters").run({ countries: ["MX"] }, s)).toThrow(ToolError);
    expect(() => spec("set_hazard_filters").run({}, s)).toThrow(/Provide at least one/);
  });
  it("set_focus_area fits the union of region bounds", () => {
    const s = seeded();
    const { result } = spec("set_focus_area").run({ regions: ["British Columbia", "WA"] }, s) as { result: any };
    const cam = s.getState().camera!;
    expect(cam.kind).toBe("bounds");
    if (cam.kind === "bounds") {
      expect(cam.bbox[1]).toBeCloseTo(45.5, 1); // WA south
      expect(cam.bbox[3]).toBeCloseTo(60, 1); // BC north
    }
    expect(result.focusedOn.map((r: any) => r.code)).toEqual(["BC", "WA"]);
    spec("set_focus_area").run({ latitude: 49.3, longitude: -123.1, zoom: 10 }, s);
    expect(s.getState().camera).toMatchObject({ kind: "center", zoom: 10 });
    expect(() => spec("set_focus_area").run({ regions: ["Atlantis"] }, s)).toThrow(/Unknown or ambiguous region/);
    expect(() => spec("set_focus_area").run({ bounds: { west: 10, south: 10, east: 0, north: 20 } }, s)).toThrow(/invalid|west<east/);
    expect(() => spec("set_focus_area").run({}, s)).toThrow(ToolError);
  });
  it("focus_hazard selects like a click and moves the camera", () => {
    const s = seeded();
    const quake = body.data.find((h) => h.type === "earthquake")!;
    const { result } = spec("focus_hazard").run({ hazardId: quake.id }, s) as { result: any };
    expect(s.getState().selectedHazardId).toBe(quake.id);
    expect(result.hazard.magnitude).toBe(quake.earthquake?.magnitude);
    expect(() => spec("focus_hazard").run({ hazardId: "usgs:nothing" }, s)).toThrow(/No hazard with id/);
  });
});

describe("read-only tools", () => {
  it("get_visible_hazards honours limit and type", () => {
    const s = seeded();
    const { result } = spec("get_visible_hazards").run({ limit: 3, hazardType: "wildfire" }, s) as { result: any };
    expect(result.returned).toBe(3);
    expect(result.hazards.every((h: any) => h.type === "wildfire")).toBe(true);
    expect(result.hazards[0]).toHaveProperty("source");
  });
  it("get_hazard_details returns attribution without geometry blobs", () => {
    const s = seeded();
    const wx = body.data.find((h) => h.type === "weather")!;
    const { result } = spec("get_hazard_details").run({ hazardId: wx.id }, s) as { result: any };
    expect(result.attribution.agency).toBe(wx.source.agency);
    expect(result.geometry).toBeUndefined();
    expect(result.geometryType).toBe(wx.geometry.type);
    expect(s.getState().selectedHazardId).toBeUndefined(); // no UI mutation
  });
  it("compare_regions is deterministic and ignores UI filters", () => {
    const s = seeded();
    s.setFilters({ hazardTypes: ["earthquake"] });
    const { result } = spec("compare_regions").run({ regions: ["BC", "WA"] }, s) as { result: any };
    const bc = result.comparison[0], wa = result.comparison[1];
    expect(bc.code).toBe("BC");
    expect(bc.wildfires).toBe(body.data.filter((h) => h.type === "wildfire" && h.regionCode === "BC").length);
    expect(bc.wildfiresOutOfControl).toBeGreaterThan(0);
    expect(wa.weatherAlerts).toBe(body.data.filter((h) => h.type === "weather" && h.regionCode === "WA").length);
    expect(wa.significantEarthquakes).toBe(1);
    expect(() => spec("compare_regions").run({ regions: ["BC"] }, s)).toThrow(/at least 2/);
  });
  it("create_situation_context lists top hazards for the view or regions", () => {
    const s = seeded();
    const { result } = spec("create_situation_context").run({ regions: ["Alberta"], maxPerType: 2 }, s) as { result: any };
    expect(result.area).toContain("Alberta");
    expect(result.wildfires.length).toBeLessThanOrEqual(2);
    expect(result.counts.wildfires).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("safe");
  });
});

describe("bound tools never throw and log activity", () => {
  it("returns MCP-style content and structured errors", async () => {
    const s = seeded();
    const tool = bindTool(spec("focus_hazard"), s);
    const ok = (await tool.execute({ hazardId: body.data[0].id })) as any;
    expect(ok.content[0].type).toBe("text");
    expect(JSON.parse(ok.content[0].text).ok).toBe(true);
    const bad = (await tool.execute({ hazardId: "x:y" })) as any;
    expect(bad.isError).toBe(true);
    expect(JSON.parse(bad.content[0].text).error.code).toBe("hazard_not_found");
    expect(s.getState().activity.map((a) => a.ok)).toEqual([true, false]);
    expect(s.getState().activity[1].summary).toContain("hazard_not_found");
  });
  it("reports data_unavailable before data loads", async () => {
    const s = createStore(initialState);
    const out = (await bindTool(spec("get_visible_hazards"), s).execute({})) as any;
    expect(JSON.parse(out.content[0].text).error.code).toBe("data_unavailable");
  });
});
