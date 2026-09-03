import type { HazardType } from "@nearcast/shared";
import { TYPE_COLOR } from "../map/style.ts";

export function HazardIcon({ type, size = 16 }: { type: HazardType; size?: number }) {
  const color = TYPE_COLOR[type];
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (type === "wildfire") {
    return <svg {...common}><path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.5.5-2.5 1.5-3.5.2 1.2.8 2 1.5 2.5C11.5 8 11 5.5 12 3z" fill={color} fillOpacity={0.2} /><path d="M8 13.5c-1.5 1.5-2 3-2 4.5a6 6 0 0 0 12 0c0-1.5-.5-3-2-4.5" /></svg>;
  }
  if (type === "weather") {
    return <svg {...common}><path d="M7 15a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.5A3.5 3.5 0 0 1 17 15H7z" fill={color} fillOpacity={0.15} /><path d="M12 15l-2 4h4l-2 4" /></svg>;
  }
  return <svg {...common}><path d="M2 12h3l2-6 3 12 3-9 2 5 2-2h5" /></svg>;
}
