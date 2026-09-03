import type { ModelContext, ModelContextToolDefinition } from "../types/webmcp.d.ts";

/**
 * Dev/test-only emulated WebMCP host. Enabled with `?webmcp=emulate` when no real
 * host is present. It only exposes the registered tools on `window.__webmcpTools`
 * so they can be exercised from the console / automated tests. Never a substitute
 * for a real agent host; the UI labels it "emulated".
 */
export function installEmulatedHost(): boolean {
  if (typeof window === "undefined") return false;
  const q = new URLSearchParams(window.location.search);
  if (q.get("webmcp") !== "emulate") return false;
  if (document.modelContext?.registerTool || navigator.modelContext?.registerTool) return false;
  const tools: Record<string, ModelContextToolDefinition> = {};
  const ctx: ModelContext & { emulated: true } = {
    emulated: true,
    registerTool(tool, options) {
      tools[tool.name] = tool;
      options?.signal?.addEventListener("abort", () => { delete tools[tool.name]; }, { once: true });
    },
    unregisterTool(name) { delete tools[name]; },
  };
  document.modelContext = ctx;
  (window as unknown as { __webmcpTools: typeof tools }).__webmcpTools = tools;
  return true;
}

export function isEmulatedHost(): boolean {
  return Boolean((document.modelContext as { emulated?: boolean } | undefined)?.emulated);
}
