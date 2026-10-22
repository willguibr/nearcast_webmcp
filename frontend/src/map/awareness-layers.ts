import type * as maplibregl from "maplibre-gl";
import type { GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection } from "geojson";
import { radiusRing, usableAwarenessItems } from "@nearcast/shared";
import type { AppState } from "../state/store.ts";
import { nearPlace } from "../state/place-context.ts";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };
export const CONTEXT_LAYERS = ["context-points", "context-lines", "context-areas"];
const COLOR: maplibregl.ExpressionSpecification = ["case", ["any", ["==", ["get", "old"], true], ["==", ["get", "stage"], "unknown"]], "#64748b",
  ["==", ["get", "stage"], "order"], "#b42318", ["==", ["get", "stage"], "alert"], "#b86c0a",
  ["==", ["get", "kind"], "air-quality"], "#147d75", ["==", ["get", "kind"], "road"], "#8551a4", "#36688c"];

export function addAwarenessLayers(map: maplibregl.Map) {
  map.addSource("place-context", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "context-areas", type: "fill", source: "place-context", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": COLOR, "fill-opacity": 0.23 } });
  map.addLayer({ id: "context-lines", type: "line", source: "place-context", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": COLOR, "line-width": ["case", ["==", ["get", "selected"], true], 6, 3], "line-opacity": 0.85 } });
  map.addLayer({ id: "context-points", type: "circle", source: "place-context", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": COLOR, "circle-radius": ["case", ["==", ["get", "selected"], true], 11, 6], "circle-stroke-width": 2, "circle-stroke-color": "#fff" } });
  map.addSource("saved-places", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "watch-radius-fill", type: "fill", source: "saved-places", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#143e58", "fill-opacity": 0.035 } });
  map.addLayer({ id: "watch-radius-line", type: "line", source: "saved-places", filter: ["==", ["geometry-type"], "Polygon"], paint: { "line-color": "#143e58", "line-width": 2, "line-dasharray": [3, 2] } });
  map.addLayer({ id: "saved-place-points", type: "circle", source: "saved-places", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#143e58", "circle-radius": 8, "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
}

export function updateAwarenessLayers(map: maplibregl.Map, state: AppState) {
  const place = state.places.find((p) => p.id === state.activePlaceId);
  const all = usableAwarenessItems(state.awareness, state.mock);
  const visible = place ? nearPlace(all, place).map((e) => e.item) : all;
  // A selected pinned camera may be outside the active radius.
  const selected = all.find((i) => i.id === state.selectedContextId);
  if (selected && !visible.includes(selected)) visible.push(selected);
  const features: FeatureCollection = { type: "FeatureCollection", features: visible.filter((i) => state.awarenessLayers.includes(i.kind)).map((i) => ({
    type: "Feature", id: i.id, geometry: i.geometry,
    properties: { id: i.id, kind: i.kind, stage: i.kind === "evacuation" ? i.stage : "", old: i.kind === "evacuation" && i.olderRecord, selected: i.id === state.selectedContextId },
  })) };
  (map.getSource("place-context") as GeoJSONSource).setData(features);
  const places: FeatureCollection = { type: "FeatureCollection", features: state.places.map((p) => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.longitude, p.latitude] }, properties: { id: p.id, name: p.name } })) };
  if (place) places.features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [radiusRing(place.longitude, place.latitude, place.radiusKm)] }, properties: {} });
  if (state.pickedCoordinate) places.features.push({ type: "Feature", geometry: { type: "Point", coordinates: state.pickedCoordinate }, properties: {} });
  (map.getSource("saved-places") as GeoJSONSource).setData(places);
}
