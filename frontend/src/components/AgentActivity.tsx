import { useAppState } from "../hooks/useStore.ts";
import { clock } from "../services/time.ts";
import { registeredTools } from "../webmcp/register.ts";

const SCENARIOS: { label: string; tool: string; input: Record<string, unknown> }[] = [
  { label: "What is in view?", tool: "get_current_view", input: {} },
  { label: "Focus BC + WA", tool: "set_focus_area", input: { regions: ["BC", "WA"] } },
  { label: "Wildfires + severe weather", tool: "set_hazard_filters", input: { hazardTypes: ["wildfire", "weather"], minimumSeverity: "severe" } },
  { label: "Show everything", tool: "set_hazard_filters", input: { hazardTypes: ["wildfire", "weather", "earthquake"], minimumSeverity: null, minimumEarthquakeMagnitude: null } },
  { label: "Compare BC vs WA", tool: "compare_regions", input: { regions: ["BC", "WA"] } },
  { label: "Situation context", tool: "create_situation_context", input: { maxPerType: 3 } },
];

async function runScenario(s: { tool: string; input: Record<string, unknown> }) {
  const tool = registeredTools[s.tool];
  if (!tool) return;
  const out = (await tool.execute(s.input)) as { content?: { text?: string }[] };
  const text = out?.content?.[0]?.text;
  if (text) console.log(`[Nearcast tool runner] ${s.tool}`, JSON.parse(text));
}

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
      {(webmcp === "available" || webmcp === "emulated") && (
        <div className="tool-runner">
          <p className="muted small">Try the tools yourself — each button invokes the same tool object registered with the browser. Full JSON results go to the console.</p>
          <div className="tool-buttons">
            {SCENARIOS.map((s) => <button key={s.label} type="button" onClick={() => void runScenario(s)} title={`${s.tool} ${JSON.stringify(s.input)}`}>{s.label}</button>)}
          </div>
        </div>
      )}
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
