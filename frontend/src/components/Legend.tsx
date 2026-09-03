import { TYPE_COLOR, TYPE_LABEL } from "../map/style.ts";
import type { HazardType } from "@nearcast/shared";

const TYPES: HazardType[] = ["wildfire", "weather", "earthquake"];

export function Legend() {
  return (
    <div className="legend" aria-label="Map legend">
      {TYPES.map((t) => (
        <span key={t} className="legend-item"><span className="swatch" style={{ background: TYPE_COLOR[t] }} />{TYPE_LABEL[t]}</span>
      ))}
      <span className="legend-item"><span className="swatch size-lg" /> larger = higher display significance</span>
      <span className="legend-item"><span className="swatch outline" /> selected</span>
    </div>
  );
}
