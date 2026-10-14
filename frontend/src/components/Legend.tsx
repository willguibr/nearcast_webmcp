import { TYPE_COLOR, TYPE_LABEL } from "../map/style.ts";
import type { HazardType } from "@nearcast/shared";

const TYPES: HazardType[] = ["wildfire", "weather", "earthquake"];

export function Legend() {
  return (
    <details className="legend" aria-label="Map legend"><summary>Map key</summary><div className="legend-items">
      {TYPES.map((t) => (
        <span key={t} className="legend-item"><span className="swatch" style={{ background: TYPE_COLOR[t] }} />{TYPE_LABEL[t]}</span>
      ))}
      {[["#b42318", "Evacuation order"], ["#b86c0a", "Evacuation alert"], ["#64748b", "Older / unknown notice"], ["#147d75", "AQHI station"], ["#8551a4", "Road event"], ["#36688c", "Camera"], ["#143e58", "Saved place / radius"]].map(([color, label]) => (
        <span key={label} className="legend-item"><span className="swatch" style={{ background: color }} />{label}</span>
      ))}
      <span className="legend-item"><span className="swatch size-lg" /> larger = higher display significance</span>
      <span className="legend-item"><span className="swatch outline" /> selected</span>
    </div></details>
  );
}
