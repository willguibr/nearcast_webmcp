import { useEffect, useState } from "react";
import { useAppState } from "../hooks/useStore.ts";
import { relativeTime } from "../services/time.ts";

export function Header({ onRefresh }: { onRefresh: () => void }) {
  const retrievedAt = useAppState((s) => s.retrievedAt);
  const loading = useAppState((s) => s.loading);
  const mock = useAppState((s) => s.mock);
  const webmcp = useAppState((s) => s.webmcp);
  const toolCount = useAppState((s) => s.webmcpTools.length);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 15_000); return () => clearInterval(t); }, []);

  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <h1>Nearcast</h1>
          <p>Cross-Border Hazard Awareness</p>
        </div>
      </div>
      {mock && <span className="badge badge-demo" title="Synthetic fixtures — not live government information">DEMO DATA</span>}
      <div className="header-status">
        <div className={`webmcp-indicator webmcp-${webmcp}`} title="WebMCP exposes this app's map, filters and hazard data as structured tools to AI agents">
          <span className="dot" aria-hidden="true" />
          <span className="label">WebMCP</span>
          <span className="value">
            {webmcp === "available" ? `Available · ${toolCount} tools` : webmcp === "emulated" ? `Emulated host (dev) · ${toolCount} tools` : webmcp === "pending" ? "Detecting…" : "Browser support not detected"}
          </span>
        </div>
        <div className="refresh">
          <span className="muted">Last refreshed {relativeTime(retrievedAt)}</span>
          <button type="button" onClick={onRefresh} disabled={loading} aria-busy={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>
    </header>
  );
}
