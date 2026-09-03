import type { DisplaySignificance, HazardSeverity, HazardType } from "@nearcast/shared";

/** OpenFreeMap "Positron" — OpenStreetMap-based vector basemap, no API token required. */
export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
export const BASEMAP_HOSTS = ["https://tiles.openfreemap.org"];
export const DATA_ATTRIBUTION = "Hazard data: ECCC · NRCan CWFIS · Earthquakes Canada · NWS · NIFC · USGS";

export const TYPE_COLOR: Record<HazardType, string> = {
  wildfire: "#d9531e",
  weather: "#2f6fcf",
  earthquake: "#7a4fbf",
};
export const TYPE_LABEL: Record<HazardType, string> = { wildfire: "Wildfire", weather: "Weather alert", earthquake: "Earthquake" };

export const SEVERITY_LABEL: Record<HazardSeverity, string> = {
  info: "Info", minor: "Minor", moderate: "Moderate", severe: "Severe", extreme: "Extreme", unknown: "Not rated by agency",
};
export const SIGNIFICANCE_LABEL: Record<DisplaySignificance, string> = { low: "Low", moderate: "Moderate", high: "High" };

export const SIGNIFICANCE_RADIUS: Record<DisplaySignificance, number> = { low: 5, moderate: 7, high: 9.5 };
