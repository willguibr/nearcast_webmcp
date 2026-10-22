import type { AwarenessSnapshot, SavedPlace } from "@nearcast/shared";

export const DEMO_PLACE: Omit<SavedPlace, "id"> = { name: "Demo cabin · Squamish", longitude: -123.15, latitude: 49.70, radiusKm: 25 };
export function demoAwareness(now = new Date()): AwarenessSnapshot {
  const updatedAt = now.toISOString();
  return { demo: true, retrievedAt: updatedAt,
    sources: [
      { id: "eccc-aqhi", name: "DEMO · AQHI", coverage: "Synthetic Canadian station", url: "https://weather.gc.ca/airquality/pages/index_e.html" },
      { id: "bc-evacuations", name: "DEMO · BC notices", coverage: "Synthetic BC notice", url: "https://www.emergencyinfobc.gov.bc.ca/" },
      { id: "drivebc-roads", name: "DEMO · DriveBC events", coverage: "Synthetic BC road", url: "https://www.drivebc.ca/" },
      { id: "drivebc-cameras", name: "DEMO · DriveBC cameras", coverage: "Synthetic camera; illustration, not a live image", url: "https://www.drivebc.ca/cameras" },
      { id: "bc-bans", name: "DEMO · fire prohibitions", coverage: "Synthetic prohibition", url: "https://wildfiresituation.nrs.gov.bc.ca/" },
      { id: "bc-restrictions", name: "DEMO · area restrictions", coverage: "Synthetic restriction", url: "https://wildfiresituation.nrs.gov.bc.ca/" },
      { id: "bc-wildfires", name: "DEMO · BC wildfire", coverage: "Synthetic incident", url: "https://wildfiresituation.nrs.gov.bc.ca/" },
      { id: "bc-floods", name: "DEMO · flood advisory", coverage: "Synthetic basin", url: "https://www2.gov.bc.ca/" },
    ].map((s) => ({ ...s, status: "available", checkedAt: updatedAt, retrievedAt: updatedAt, count: 1, rejectedCount: 0 })) as AwarenessSnapshot["sources"],
    items: [
      { id: "demo-ban", kind: "restriction", sourceId: "bc-bans", sourceUrl: "https://wildfiresituation.nrs.gov.bc.ca/", title: "DEMO · Campfire prohibition", restrictionType: "fire-ban", description: "Synthetic campfire prohibition for testing only", fireCentre: "Synthetic Coastal centre", effectiveAt: updatedAt, updatedAt, geometry: {type:"Polygon",coordinates:[[[-123.2,49.65],[-123.1,49.65],[-123.1,49.8],[-123.2,49.8],[-123.2,49.65]]]} },
      { id: "demo-restriction", kind: "restriction", sourceId: "bc-restrictions", sourceUrl: "https://wildfiresituation.nrs.gov.bc.ca/", title: "DEMO · Trail restriction", restrictionType: "area-restriction", description: "Synthetic restricted area", fireCentre: "Synthetic Coastal centre", effectiveAt: updatedAt, updatedAt, geometry: {type:"Polygon",coordinates:[[[-123.12,49.7],[-123.1,49.7],[-123.1,49.75],[-123.12,49.75],[-123.12,49.7]]]} },
      { id: "demo-fire-detail", kind: "wildfire-detail", sourceId: "bc-wildfires", sourceUrl: "https://wildfiresituation.nrs.gov.bc.ca/", title: "DEMO · Ridge fire", fireNumber: "DEMO-001", status: "Under Control", hectares: 12.4, cause: "Synthetic", response: "Demonstration", perimeterAvailable: false, updatedAt, geometry:{type:"Point",coordinates:[-123.17,49.75]} },
      { id: "demo-flood", kind: "flood", sourceId: "bc-floods", sourceUrl: "https://www2.gov.bc.ca/", title: "DEMO · Valley basin", basin: "Fictional basin", level: "High streamflow advisory", comments: "Synthetic advisory for testing, not real conditions", updatedAt, geometry:{type:"Polygon",coordinates:[[[-123.2,49.6],[-123.1,49.6],[-123.1,49.8],[-123.2,49.8],[-123.2,49.6]]]} },
      { id: "demo-aqhi", kind: "air-quality", sourceId: "eccc-aqhi", sourceUrl: "https://weather.gc.ca/airquality/pages/index_e.html", title: "DEMO · Squamish station", stationId: "demo", aqhi: 7, displayValue: "7", category: "High", updatedAt, geometry: { type: "Point", coordinates: [-123.16, 49.71] } },
      { id: "demo-evacuation", kind: "evacuation", sourceId: "bc-evacuations", sourceUrl: "https://www.emergencyinfobc.gov.bc.ca/", title: "DEMO · Valley notice", stage: "alert", rawStage: "Evacuation Alert", authority: "Synthetic demonstration authority", eventType: "Demonstration", area: "Fictional area", olderRecord: false, updatedAt, geometry: { type: "Polygon", coordinates: [[[-123.18,49.68],[-123.12,49.68],[-123.12,49.73],[-123.18,49.73],[-123.18,49.68]]] } },
      { id: "demo-road", kind: "road", sourceId: "drivebc-roads", sourceUrl: "https://www.drivebc.ca/", title: "DEMO · Highway 99", severity: "MAJOR", eventType: "INCIDENT", description: "Synthetic closure for testing the place brief. Not a real road event.", roads: [{ name: "Highway 99", state: "CLOSED" }], intervals: [], updatedAt, geometry: { type: "LineString", coordinates: [[-123.15,49.65],[-123.14,49.80]] } },
      { id: "drivebc-camera:demo", kind: "camera", sourceId: "drivebc-cameras", sourceUrl: "https://www.drivebc.ca/cameras", title: "DEMO · Highway camera", caption: "Illustration only. Open live mode for real DriveBC camera images.", highway: "99", imageUrl: "/demo-camera.svg", markedStale: false, updatedAt, geometry: { type: "Point", coordinates: [-123.14,49.72] } },
    ],
  };
}
