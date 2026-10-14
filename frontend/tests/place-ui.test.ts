// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { store } from "../src/state/index.ts";
import { initialState, createStore } from "../src/state/store.ts";
import { PlacesPanel } from "../src/components/PlacesPanel.tsx";
import { PlaceDashboard } from "../src/components/PlaceDashboard.tsx";
import { DEMO_PLACE, demoAwareness } from "../src/services/demo-awareness.ts";
import { registerWebMcpTools } from "../src/webmcp/register.ts";

// Inject storage before the singleton is constructed; Node 25 also defines a non-browser localStorage.
const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, clear: () => values.clear() };
});
vi.mock("../src/state/index.ts", async () => {
  const module = await import("../src/state/store.ts");
  return { ...module, store: module.createStore(module.initialState, storage) };
});

beforeEach(() => {
  storage.clear();
  store.set({ ...initialState, places: [], activePlaceId: undefined, pinnedCameraIds: [], mock: true,
    awareness: demoAwareness(), retrievedAt: new Date().toISOString(), persistenceError: undefined });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); delete document.modelContext; });

describe("saved-place user flows", () => {
  it("adds, edits and confirms removing a place through the visible form", () => {
    render(createElement(PlacesPanel));
    fireEvent.click(screen.getByRole("button", { name: "Add place" }));
    fireEvent.change(screen.getByLabelText("Place name"), { target: { value: "Test cabin" } });
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "49.7" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-123.15" } });
    fireEvent.click(screen.getByRole("button", { name: "Save place" }));
    expect(store.getState().places[0].name).toBe("Test cabin");
    fireEvent.click(screen.getByRole("button", { name: "Edit Test cabin" }));
    fireEvent.change(screen.getByLabelText("Watch radius (km)"), { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Save place" }));
    expect(createStore(initialState, storage).getState().places[0].radiusKm).toBe(40);
    fireEvent.click(screen.getByRole("button", { name: "Remove Test cabin" }));
    expect(store.getState().places).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Remove place" }));
    expect(store.getState().places).toHaveLength(0);
  });

  it("pins a camera with a mouse click, persists it across reload, and unpins it", () => {
    store.savePlace(DEMO_PLACE);
    render(createElement(PlaceDashboard));
    fireEvent.click(screen.getByRole("button", { name: "Pin camera" }));
    expect(screen.getByRole("button", { name: "Unpin camera" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: /Pinned cameras/ })).toBeTruthy();
    expect(createStore(initialState, storage).getState().pinnedCameraIds).toEqual(["drivebc-camera:demo"]);
    fireEvent.click(screen.getByRole("button", { name: "Unpin camera" }));
    expect(store.getState().pinnedCameraIds).toEqual([]);
  });

  it("previews a labelled sourced brief and distinguishes missing feeds in comparisons", () => {
    store.savePlace(DEMO_PLACE);
    store.savePlace({ ...DEMO_PLACE, name: "Second test place" });
    const snapshot = demoAwareness();
    snapshot.items = snapshot.items.filter((i) => i.sourceId !== "drivebc-roads");
    snapshot.sources = snapshot.sources.map((s) => s.id === "drivebc-roads" ? { ...s, status: "error", count: 0, error: "Offline" } : s);
    store.setAwareness(snapshot);
    render(createElement(PlaceDashboard));
    fireEvent.click(screen.getByRole("button", { name: "Preview text" }));
    const brief = screen.getByRole("textbox", { name: "Shareable situation brief" }) as HTMLTextAreaElement;
    expect(brief.value).toContain("DEMO — SYNTHETIC DATA");
    expect(brief.value).toContain("https://www.emergencyinfobc.gov.bc.ca/");
    expect(brief.value).toContain("Offline");
    fireEvent.click(screen.getByRole("button", { name: "Compare places" }));
    expect(screen.getAllByRole("cell", { name: "Unavailable" })).toHaveLength(2);
  });
});

it("stops pending WebMCP registration on cleanup without overwriting a subsequent mount", async () => {
  let finish!: () => void;
  const registerTool = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
  document.modelContext = { registerTool, unregisterTool: vi.fn() };
  const testStore = createStore(initialState);
  const stop = registerWebMcpTools(testStore);
  expect(registerTool).toHaveBeenCalledTimes(1);
  stop();
  testStore.setWebmcp("available", ["new-mount-tool"]);
  await act(async () => { finish(); await Promise.resolve(); });
  expect(registerTool).toHaveBeenCalledTimes(1);
  expect(testStore.getState().webmcpTools).toEqual(["new-mount-tool"]);
});
