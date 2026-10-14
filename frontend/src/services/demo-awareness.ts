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
    ].map((s) => ({ ...s, status: "available", checkedAt: updatedAt, retrievedAt: updatedAt, count: 1, rejectedCount: 0 })) as AwarenessSnapshot["sources"],
    items: [
      { id: "demo-aqhi", kind: "air-quality", sourceId: "eccc-aqhi", sourceUrl: "https://weather.gc.ca/airquality/pages/index_e.html", title: "DEMO · Squamish station", stationId: "demo", aqhi: 7, displayValue: "7", category: "High", updatedAt, geometry: { type: "Point", coordinates: [-123.16, 49.71] } },
      { id: "demo-evacuation", kind: "evacuation", sourceId: "bc-evacuations", sourceUrl: "https://www.emergencyinfobc.gov.bc.ca/", title: "DEMO · Valley notice", stage: "alert", rawStage: "Evacuation Alert", authority: "Synthetic demonstration authority", eventType: "Demonstration", area: "Fictional area", olderRecord: false, updatedAt, geometry: { type: "Polygon", coordinates: [[[-123.18,49.68],[-123.12,49.68],[-123.12,49.73],[-123.18,49.73],[-123.18,49.68]]] } },
      { id: "demo-road", kind: "road", sourceId: "drivebc-roads", sourceUrl: "https://www.drivebc.ca/", title: "DEMO · Highway 99", severity: "MAJOR", eventType: "INCIDENT", description: "Synthetic closure for testing the place brief. Not a real road event.", roads: [{ name: "Highway 99", state: "CLOSED" }], intervals: [], updatedAt, geometry: { type: "LineString", coordinates: [[-123.15,49.65],[-123.14,49.80]] } },
      { id: "drivebc-camera:demo", kind: "camera", sourceId: "drivebc-cameras", sourceUrl: "https://www.drivebc.ca/cameras", title: "DEMO · Highway camera", caption: "Illustration only. Open live mode for real DriveBC camera images.", highway: "99", imageUrl: "/demo-camera.svg", markedStale: false, updatedAt, geometry: { type: "Point", coordinates: [-123.14,49.72] } },
    ],
  };
}
