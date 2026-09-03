import { useAppState } from "../hooks/useStore.ts";
import { clock } from "../services/time.ts";

export function AgentActivity() {
  const activity = useAppState((s) => s.activity);
  const webmcp = useAppState((s) => s.webmcp);
  const tools = useAppState((s) => s.webmcpTools);
  const entries = [...activity].reverse();
  return (
    <section className="panel activity-panel" aria-labelledby="activity-title" aria-live="polite">
      <h2 id="activity-title">Agent Activity <span className="count">{activity.length}</span></h2>
      {webmcp === "unavailable" && <p className="muted">WebMCP not detected in this browser. Open Nearcast in ChatGPT's in-app browser or Chrome with WebMCP enabled to let an agent use the tools below.</p>}
      {(webmcp === "available" || webmcp === "emulated") && activity.length === 0 && <p className="muted">Waiting for an agent. Tools registered: {tools.join(", ")}.</p>}
      <ol className="activity">
        {entries.map((e) => (
          <li key={e.id} className={e.ok ? "" : "failed"}>
            <span className="time">{clock(e.at)}</span>
            <span className="tool">{e.tool}</span>
            <span className="summary">{e.summary}</span>
          </li>
        ))}
      </ol>
      {webmcp !== "available" && webmcp !== "emulated" && tools.length > 0 && <p className="muted small">Tools: {tools.join(", ")}</p>}
    </section>
  );
}
