import type { Hazard } from "@nearcast/shared";
import { store, selectVisibleHazards } from "../state/index.ts";
import { useAppState } from "../hooks/useStore.ts";
import { HazardIcon } from "./Icons.tsx";
import { SEVERITY_LABEL } from "../map/style.ts";

export function hazardMetric(h: Hazard): string {
  if (h.type === "earthquake") return h.earthquake?.magnitude != null ? `M ${h.earthquake.magnitude.toFixed(1)}` : "magnitude n/a";
  if (h.type === "wildfire") {
    const parts = [h.wildfire?.status, h.wildfire?.areaHectares != null ? `${formatNumber(h.wildfire.areaHectares)} ha` : undefined, h.wildfire?.containmentPercent != null ? `${h.wildfire.containmentPercent}% contained` : undefined];
    return parts.filter(Boolean).join(" · ") || "details n/a";
  }
  return h.severity === "unknown" ? (h.rawSeverity ?? "severity n/a") : SEVERITY_LABEL[h.severity];
}

export function formatNumber(n: number): string {
  return n >= 100 ? Math.round(n).toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function HazardList() {
  const visible = useAppState(selectVisibleHazards);
  const selectedId = useAppState((s) => s.selectedHazardId);
  const loading = useAppState((s) => s.loading);
  const loaded = useAppState((s) => s.hazards.length);
  const shown = visible.slice(0, 150);
  return (
    <section className="panel list-panel" aria-labelledby="list-title">
      <h2 id="list-title">In view <span className="count">{visible.length}</span></h2>
      {visible.length === 0 && (
        <p className="muted">{loading && loaded === 0 ? "Loading hazards…" : "No matching active hazards were returned by the currently available sources for this view."}</p>
      )}
      <ul className="hazard-list">
        {shown.map((h) => (
          <li key={h.id}>
            <button type="button" className={`hazard-row sig-${h.significance}${h.id === selectedId ? " selected" : ""}`} onClick={() => store.focusHazard(h.id)} aria-pressed={h.id === selectedId}>
              <HazardIcon type={h.type} />
              <span className="row-main">
                <span className="row-title">{h.title}</span>
                <span className="row-meta">{[h.regionCode ?? h.country, hazardMetric(h)].join(" · ")}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {visible.length > shown.length && <p className="muted">Showing {shown.length} of {visible.length}. Zoom in or refine filters.</p>}
    </section>
  );
}
