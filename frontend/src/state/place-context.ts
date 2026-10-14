import { distanceToGeometryKm, geometryContains, usableAwarenessItems, type AwarenessItem, type Hazard, type SavedPlace } from "@nearcast/shared";
import { bySignificance, type AppState } from "./store.ts";

export interface Nearby<T> { item: T; distanceKm: number; coversPlace: boolean }
export function nearPlace<T extends { geometry: Hazard["geometry"] }>(items: T[], place: SavedPlace): Nearby<T>[] {
  const point = [place.longitude, place.latitude];
  return items.map((item) => ({ item, distanceKm: distanceToGeometryKm(point, item.geometry), coversPlace: geometryContains(point, item.geometry) }))
    .filter((entry) => entry.distanceKm <= place.radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function placeContext(state: AppState, place: SavedPlace, now = new Date()) {
  const awareness = state.awareness;
  const matchingMode = awareness?.demo === state.mock;
  const ageMs = awareness ? now.getTime() - Date.parse(awareness.retrievedAt) : Infinity;
  const expiredSnapshot = !!awareness && !awareness.demo && ageMs > 30 * 60_000;
  const items = usableAwarenessItems(awareness, state.mock, now.getTime());
  const referenceTime = state.mock && state.retrievedAt ? Date.parse(state.retrievedAt) : now.getTime();
  // Personal context deliberately ignores exploratory map filters: hiding a layer is not an all-clear.
  const hazards = nearPlace(state.hazards.filter((h) => !h.expiresAt || Date.parse(h.expiresAt) > referenceTime), place)
    .sort((a, b) => bySignificance(a.item, b.item) || a.distanceKm - b.distanceKm);
  const nearby = nearPlace<AwarenessItem>(items, place);
  const warnings: string[] = [];
  if (!state.retrievedAt) warnings.push("Core hazard data has not loaded.");
  if (state.error) warnings.push(`Core hazard refresh failed: ${state.error}. Any retained data may be stale.`);
  if (state.awarenessError) warnings.push(`Place feed refresh failed: ${state.awarenessError}. Any retained data may be stale.`);
  if (!awareness || !matchingMode) warnings.push("Additional place feeds have not loaded for this data mode.");
  if (expiredSnapshot) warnings.push("Additional feed snapshot is over 30 minutes old and has been withheld. Refresh to try again.");
  const sourceStatus = [...state.sources.map((s) => ({ id: s.id, name: s.agency, status: s.status, retrievedAt: s.retrievedAt, coverage: "Existing Canada / US hazard feed", error: s.error })),
    ...(matchingMode ? awareness?.sources ?? [] : [])];
  for (const source of sourceStatus) {
    if (source.status !== "available") warnings.push(`${source.name}: ${source.status}${source.error ? ` — ${source.error}` : ""}`);
    if (!state.mock && awareness?.sources.some((s) => s.id === source.id) && source.retrievedAt && now.getTime() - Date.parse(source.retrievedAt) > 1800_000)
      warnings.push(`${source.name}: records retrieved over 30 minutes ago have been withheld. Refresh to try again.`);
  }
  return {
    place, generatedAt: now.toISOString(), demo: state.mock, hazards, nearby, warnings, sourceStatus,
    coreRetrievedAt: state.retrievedAt, awarenessRetrievedAt: matchingMode && !expiredSnapshot ? awareness?.retrievedAt : undefined,
    coverage: "Evacuation notices, road events and cameras: BC only. AQHI: Canadian reporting stations. Other areas may have no coverage; an empty result is not an all-clear.",
    matching: "All loaded hazard categories within the saved radius, using distance to published geometry. Independent of map filters. Distances are approximate, not travel distances.",
  };
}

export type PlaceContext = ReturnType<typeof placeContext>;

export function contextForAgent(context: PlaceContext, limit = 10) {
  const { hazards, nearby, ...rest } = context;
  const slim = (entries: Nearby<Hazard | AwarenessItem>[]) => entries.slice(0, limit).map(({ item, distanceKm, coversPlace }) => {
    const { geometry: _geometry, ...record } = item;
    return { ...record, distanceKm: Math.round(distanceKm * 10) / 10, coversPlace,
      ...("kind" in item ? { observationWarning: observationWarning(item, context.demo, Date.parse(context.generatedAt)) } : {}) };
  });
  const ofKind = (kind: AwarenessItem["kind"]) => nearby.filter((e) => e.item.kind === kind);
  const counts = { hazards: hazards.length, evacuations: ofKind("evacuation").length, airQuality: ofKind("air-quality").length,
    roads: ofKind("road").length, cameras: ofKind("camera").length };
  return { ...rest, counts, limitPerCategory: limit,
    truncated: Object.values(counts).some((count) => count > limit),
    hazards: slim(hazards), evacuations: slim(ofKind("evacuation")), airQuality: slim(ofKind("air-quality")),
    roads: slim(ofKind("road")), cameras: slim(ofKind("camera")) };
}

export function describeItem(item: AwarenessItem): string {
  switch (item.kind) {
    case "air-quality": return `AQHI ${item.displayValue} · ${item.category} · station observation`;
    case "evacuation": return `${item.rawStage} · ${item.authority}${item.olderRecord ? " · older or undated record — verify status" : ""}${item.stage === "unknown" ? " · unrecognized stage — verify status" : ""}`;
    case "road": return `${item.severity} · ${item.eventType} · ${item.roads.map((r) => `${r.name}: ${r.state}`).join("; ")}`;
    case "camera": return `Highway ${item.highway || "not reported"}${item.markedStale ? " · image marked stale/delayed by DriveBC" : ""}`;
  }
}

/** Feed retrieval time never substitutes for the time of a station reading or camera image. */
export function observationWarning(item: AwarenessItem, demo: boolean, now = Date.now()): string | undefined {
  if (demo || (item.kind !== "air-quality" && item.kind !== "camera")) return undefined;
  const limit = item.kind === "air-quality" ? 3 * 3600_000 : 30 * 60_000;
  if (!item.updatedAt || !Number.isFinite(Date.parse(item.updatedAt)) || now - Date.parse(item.updatedAt) > limit)
    return "Observation is old or undated. Check the official source.";
  return undefined;
}

export function briefText(context: PlaceContext): string {
  const { place, hazards, nearby } = context;
  const lines = [
    `${context.demo ? "DEMO — SYNTHETIC DATA\n" : ""}Nearcast · ${place.name} · ${place.radiusKm} km watch radius`,
    `Prepared ${context.generatedAt}`, context.coverage, context.matching,
    `Core data retrieved: ${context.coreRetrievedAt ?? "not loaded"}. Place feeds retrieved: ${context.awarenessRetrievedAt ?? "not loaded"}.`,
    ...context.warnings.map((w) => `DATA NOTICE: ${w}`), "",
  ];
  for (const { item, distanceKm, coversPlace } of hazards.slice(0, 10)) {
    lines.push(`${item.title} — ${coversPlace ? "published area contains place" : `${distanceKm.toFixed(1)} km away`}; ${item.type === "weather" ? `severity: ${item.severity}` : item.type}; updated ${item.updatedAt ?? "unknown"}`,
      `${item.source.agency}: ${item.source.url ?? "Official source link unavailable"}`);
  }
  for (const kind of ["evacuation", "air-quality", "road", "camera"] as const) {
    const entries = nearby.filter((e) => e.item.kind === kind);
    for (const { item, distanceKm, coversPlace } of entries.slice(0, 5)) {
      lines.push(`${item.title} — ${describeItem(item)}; ${coversPlace ? "published area contains place" : `${distanceKm.toFixed(1)} km away`}; updated ${item.updatedAt ?? "unknown"}`, item.sourceUrl);
      const warning = observationWarning(item, context.demo, Date.parse(context.generatedAt));
      if (warning) lines.push(warning);
    }
    if (entries.length > 5) lines.push(`${entries.length - 5} additional ${kind} records omitted from this brief.`);
  }
  if (hazards.length > 10) lines.push(`${hazards.length - 10} additional hazards omitted from this brief.`);
  if (!hazards.length && !nearby.length) lines.push("No matching records in the loaded data. This does not establish safe conditions.");
  lines.push("", "Independent situational awareness. Follow official instructions. No evacuation routing, safety recommendation, or continuous monitoring is provided.");
  return lines.join("\n");
}
