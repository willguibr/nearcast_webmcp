import { useEffect, useRef } from "react";
import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, Point } from "geojson";
import type { Hazard, HazardType } from "@nearcast/shared";
import { NORTH_AMERICA_BBOX } from "@nearcast/shared";
import { store, selectFilteredHazards, selectSelectedHazard } from "../state/index.ts";
import { useAppState } from "../hooks/useStore.ts";
import { BASEMAP_STYLE_URL, DATA_ATTRIBUTION, TYPE_COLOR } from "./style.ts";

const TYPES: HazardType[] = ["wildfire", "weather", "earthquake"];
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

function pointFeature(h: Hazard): Feature<Point> {
  return {
    type: "Feature",
    id: h.id,
    geometry: { type: "Point", coordinates: [h.longitude, h.latitude] },
    properties: { id: h.id, type: h.type, significance: h.significance, severity: h.severity, title: h.title },
  };
}

function toCollections(hazards: Hazard[]): { points: Record<HazardType, FeatureCollection>; areas: FeatureCollection } {
  const points: Record<HazardType, FeatureCollection> = {
    wildfire: { type: "FeatureCollection", features: [] },
    weather: { type: "FeatureCollection", features: [] },
    earthquake: { type: "FeatureCollection", features: [] },
  };
  const areas: FeatureCollection = { type: "FeatureCollection", features: [] };
  for (const h of hazards) {
    points[h.type].features.push(pointFeature(h));
    if (h.geometry.type === "Polygon" || h.geometry.type === "MultiPolygon") {
      areas.features.push({ type: "Feature", id: h.id, geometry: h.geometry, properties: { id: h.id, type: h.type, severity: h.severity, significance: h.significance } });
    }
  }
  return { points, areas };
}

function selectionCollection(h: Hazard | undefined): FeatureCollection {
  if (!h) return EMPTY;
  const features: Feature[] = [pointFeature(h)];
  if (h.geometry.type !== "Point") features.push({ type: "Feature", id: `${h.id}:area`, geometry: h.geometry, properties: { id: h.id } });
  return { type: "FeatureCollection", features };
}

const RADIUS_EXPR: maplibregl.ExpressionSpecification = ["match", ["get", "significance"], "high", 9.5, "moderate", 7, 5];

function addLayers(map: maplibregl.Map) {
  for (const t of TYPES) {
    const color = TYPE_COLOR[t];
    map.addSource(`${t}-points`, { type: "geojson", data: EMPTY, cluster: true, clusterMaxZoom: 9, clusterRadius: 42, promoteId: "id" });
    map.addLayer({
      id: `${t}-clusters`, type: "circle", source: `${t}-points`, filter: ["has", "point_count"],
      paint: {
        "circle-color": color, "circle-opacity": 0.82,
        "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 50, 23, 200, 28],
        "circle-stroke-width": 2, "circle-stroke-color": "#ffffff",
      },
    });
    map.addLayer({
      id: `${t}-cluster-count`, type: "symbol", source: `${t}-points`, filter: ["has", "point_count"],
      layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true },
      paint: { "text-color": "#ffffff" },
    });
    map.addLayer({
      id: `${t}-point`, type: "circle", source: `${t}-points`, filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": color, "circle-radius": RADIUS_EXPR,
        "circle-opacity": ["match", ["get", "significance"], "high", 0.95, "moderate", 0.85, 0.7],
        "circle-stroke-width": 1.5, "circle-stroke-color": "#ffffff",
      },
    });
  }
  map.addSource("weather-areas", { type: "geojson", data: EMPTY, promoteId: "id" });
  map.addLayer({
    id: "weather-area-fill", type: "fill", source: "weather-areas",
    paint: { "fill-color": TYPE_COLOR.weather, "fill-opacity": ["match", ["get", "severity"], "extreme", 0.28, "severe", 0.22, "moderate", 0.16, 0.1] },
  }, `wildfire-clusters`);
  map.addLayer({ id: "weather-area-line", type: "line", source: "weather-areas", paint: { "line-color": TYPE_COLOR.weather, "line-width": 1, "line-opacity": 0.6 } }, `wildfire-clusters`);

  map.addSource("selected", { type: "geojson", data: EMPTY });
  map.addLayer({ id: "selected-area", type: "line", source: "selected", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#111827", "line-width": 2.5, "line-dasharray": [2, 1.5] } });
  map.addLayer({ id: "selected-ring", type: "circle", source: "selected", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 16, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#111827", "circle-stroke-width": 3 } });
}

export function HazardMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const readyRef = useRef(false);
  const filtered = useAppState(selectFilteredHazards);
  const selected = useAppState(selectSelectedHazard);
  const camera = useAppState((s) => s.camera);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE_URL,
      bounds: [[NORTH_AMERICA_BBOX[0], NORTH_AMERICA_BBOX[1]], [NORTH_AMERICA_BBOX[2], NORTH_AMERICA_BBOX[3]]],
      fitBoundsOptions: { padding: 16 },
      attributionControl: { compact: false, customAttribution: DATA_ATTRIBUTION },
      maxZoom: 15,
      minZoom: 1.5,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __nearcastMap?: maplibregl.Map }).__nearcastMap = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");

    const publishView = () => {
      const b = map.getBounds();
      const c = map.getCenter();
      // At low zoom the viewport can wrap past the antimeridian; clamp to valid longitudes.
      store.setView({ bounds: [Math.max(-180, b.getWest()), b.getSouth(), Math.min(180, b.getEast()), b.getNorth()], center: [c.lng, c.lat], zoom: map.getZoom() });
    };
    const clickPoint = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      const id = f?.properties?.id as string | undefined;
      if (id) store.selectHazard(id);
    };
    const clickCluster = (t: HazardType) => async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) return;
      const source = map.getSource(`${t}-points`) as GeoJSONSource;
      const zoom = await source.getClusterExpansionZoom(f.properties?.cluster_id as number);
      map.easeTo({ center: (f.geometry as Point).coordinates as [number, number], zoom: Math.min(zoom + 0.5, 13) });
    };

    map.on("load", () => {
      addLayers(map);
      readyRef.current = true;
      const { points, areas } = toCollections(selectFilteredHazards(store.getState()));
      for (const t of TYPES) (map.getSource(`${t}-points`) as GeoJSONSource).setData(points[t]);
      (map.getSource("weather-areas") as GeoJSONSource).setData(areas);
      (map.getSource("selected") as GeoJSONSource).setData(selectionCollection(selectSelectedHazard(store.getState())));
      for (const t of TYPES) {
        map.on("click", `${t}-point`, clickPoint);
        map.on("click", `${t}-clusters`, clickCluster(t));
        for (const l of [`${t}-point`, `${t}-clusters`]) {
          map.on("mouseenter", l, () => { map.getCanvas().style.cursor = "pointer"; });
          map.on("mouseleave", l, () => { map.getCanvas().style.cursor = ""; });
        }
      }
      publishView();
    });
    map.on("moveend", publishView);
    map.on("error", (e) => console.warn("map error", e.error?.message ?? e));

    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { points, areas } = toCollections(filtered);
    for (const t of TYPES) (map.getSource(`${t}-points`) as GeoJSONSource).setData(points[t]);
    (map.getSource("weather-areas") as GeoJSONSource).setData(areas);
  }, [filtered]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource("selected") as GeoJSONSource).setData(selectionCollection(selected));
  }, [selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !camera) return;
    const apply = () => {
      if (camera.kind === "bounds") {
        map.fitBounds([[camera.bbox[0], camera.bbox[1]], [camera.bbox[2], camera.bbox[3]]], { padding: camera.padding ?? 40, duration: 1200, maxZoom: 11 });
      } else {
        map.flyTo({ center: camera.center, zoom: camera.zoom, duration: 1400, essential: true });
      }
    };
    // map.loaded() is false while tiles stream in, so gate on style readiness instead.
    if (readyRef.current) apply(); else map.once("load", apply);
  }, [camera]);

  return <div ref={containerRef} className="map" role="region" aria-label="Hazard map" />;
}
