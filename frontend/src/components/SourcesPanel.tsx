import { useAppState } from "../hooks/useStore.ts";
import { relativeTime } from "../services/time.ts";

const SHORT: Record<string, string> = { eccc: "ECCC", cwfis: "NRCan CWFIS", nrcan: "Earthquakes Canada", nws: "NWS", nifc: "NIFC", usgs: "USGS", mock: "Mock" };

export function SourcesPanel() {
  const sources = useAppState((s) => s.sources);
  const error = useAppState((s) => s.error);
  return (
    <section className="panel" aria-labelledby="sources-title">
      <h2 id="sources-title">Sources</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {sources.length === 0 && !error && <p className="muted">Loading source status…</p>}
      <ul className="sources">
        {sources.map((s) => (
          <li key={s.id} className={`source source-${s.status}`} title={s.agency + (s.error ? ` — ${s.error}` : "")}>
            <span className="dot" aria-hidden="true" />
            <span className="name">{SHORT[s.id] ?? s.id}</span>
            <span className="meta">
              {s.status === "available" ? `${s.count ?? 0} · ${relativeTime(s.retrievedAt)}` : s.status === "timeout" ? "timed out" : "temporarily unavailable"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
