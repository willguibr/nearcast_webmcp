import { validPlace } from "@nearcast/shared";
import type { Store } from "../state/store.ts";
import { contextForAgent, placeContext, briefText } from "../state/place-context.ts";
import { ToolError, type ToolSpec } from "./tools.ts";

function findPlace(input: unknown, store: Store) {
  const id = input === undefined ? store.getState().activePlaceId : input;
  if (typeof id !== "string" || !id) throw new ToolError("invalid_input", "Choose a saved place with set_active_place or supply its placeId from get_saved_places.");
  const place = store.getState().places.find((p) => p.id === id);
  if (!place) throw new ToolError("place_not_found", "No saved place has that id. Call get_saved_places for current ids.");
  return place;
}
const placeId = { type: "string", description: "Saved place id. Omit to use the active place." };
const schema = (properties: Record<string, unknown>, required?: string[]) => ({ type: "object", properties, ...(required ? { required } : {}), additionalProperties: false });
export function getPlaceBrief(input: { placeId?: unknown }, store: Store) {
  const context = placeContext(store.getState(), findPlace(input.placeId, store));
  return { ...contextForAgent(context), shareableText: briefText(context) };
}

export const PLACE_TOOL_SPECS: ToolSpec<any>[] = [
  {
    name: "get_saved_places", readOnly: true, inputSchema: schema({}),
    description: "Lists the user's saved places and active place from the same browser-local state as the UI. Names and coordinates are personal data; use them only for the user's requested place-awareness task.",
    run: (_, store) => ({ result: { places: store.getState().places, activePlaceId: store.getState().activePlaceId ?? null, storage: "this browser only", persistenceWarning: store.getState().persistenceError ?? null }, summary: `${store.getState().places.length} saved places` }),
  },
  {
    name: "save_place", readOnly: false,
    inputSchema: schema({ id: { type: "string", description: "Existing place id for editing; omit to add." }, name: { type: "string", minLength: 1, maxLength: 80 }, latitude: { type: "number", minimum: -85, maximum: 85 }, longitude: { type: "number", minimum: -180, maximum: 180 }, radiusKm: { type: "number", minimum: 1, maximum: 250 } }, ["name", "latitude", "longitude", "radiusKm"]),
    description: "Saves or edits a named place with a watch radius in the user's browser, then selects it and moves the map. Only save locations the user has asked to save; do not infer a home address. Does not enable monitoring or notifications.",
    run: (input, store) => {
      if (!validPlace({ ...input, id: input.id ?? "new" })) throw new ToolError("invalid_input", "Provide a name, numeric coordinates, and radiusKm between 1 and 250.");
      try {
        const place = store.savePlace(input);
        return { result: { ok: true, place, persistenceWarning: store.getState().persistenceError ?? null }, summary: `Saved ${place.name}` };
      } catch (e) { throw new ToolError("save_failed", (e as Error).message); }
    },
  },
  {
    name: "set_active_place", readOnly: false, inputSchema: schema({ placeId }, ["placeId"]),
    description: "Selects a saved place, opens its personal dashboard and fits the map to its watch radius, exactly like selecting the place in the UI. Use get_saved_places to discover current ids.",
    run: (input, store) => {
      const place = findPlace(input.placeId, store); store.activatePlace(place.id);
      return { result: { ok: true, place }, summary: `Focused ${place.name}` };
    },
  },
  {
    name: "get_place_context", readOnly: true, inputSchema: schema({ placeId }),
    description: "Returns nearby hazards, Canadian AQHI stations, published BC evacuation notices, BC road events and cameras for a saved place. Includes geometry-based distances, coverage, timestamps, source failures and a shareable brief. Never infer an all-clear or safe route.",
    run: (input, store) => { const result = getPlaceBrief(input, store); return { result, summary: `Place context · ${result.place.name}` }; },
  },
  {
    name: "compare_saved_places", readOnly: true,
    inputSchema: schema({ placeIds: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 5, uniqueItems: true } }, ["placeIds"]),
    description: "Compares two to five saved places using the same geometry matching as the personal dashboard. Returns independent sourced briefs and coverage warnings. Counts are affected by watch radii and source coverage; do not rank places as safer.",
    run: (input, store) => {
      if (!Array.isArray(input.placeIds) || input.placeIds.length < 2 || input.placeIds.length > 5 || new Set(input.placeIds).size !== input.placeIds.length) throw new ToolError("invalid_input", "Supply two to five distinct saved place ids.");
      const result = input.placeIds.map((id: unknown) => getPlaceBrief({ placeId: findPlace(id, store).id }, store));
      return { result: { places: result, interpretation: "Published nearby conditions, not safety rankings or route recommendations." }, summary: `Compared ${result.length} places` };
    },
  },
  {
    name: "get_travel_conditions", readOnly: true, inputSchema: schema({ placeId }),
    description: "Lists published DriveBC road events and nearby highway cameras for a saved place, including road states, schedules, observation times and source availability. Covers BC only; it does not plan a route or establish that travel is safe.",
    run: (input, store) => {
      const c = getPlaceBrief(input, store);
      return { result: { place: c.place, demo: c.demo, roads: c.roads, cameras: c.cameras, counts: { roads: c.counts.roads, cameras: c.counts.cameras }, limitPerCategory: c.limitPerCategory,
        warnings: c.warnings, coverage: c.coverage, sourceStatus: c.sourceStatus.filter((s) => s.id.startsWith("drivebc")), generatedAt: c.generatedAt }, summary: `Travel conditions · ${c.place.name}` };
    },
  },
  {
    name: "focus_context_item", readOnly: false,
    inputSchema: schema({ itemId: { type: "string", description: "Item id from get_place_context or get_travel_conditions." } }, ["itemId"]),
    description: "Highlights an AQHI station, published evacuation area, road event or camera, opens its details and moves the shared map. Uses loaded item ids and the same selection path as the human UI.",
    run: (input, store) => {
      if (typeof input.itemId !== "string" || !input.itemId) throw new ToolError("invalid_input", "Supply an itemId from a place context response.");
      try { const item = store.focusContext(input.itemId); return { result: { ok: true, itemId: item.id, title: item.title }, summary: `Focused ${item.title}` }; }
      catch (e) { throw new ToolError("item_not_found", (e as Error).message); }
    },
  },
];
