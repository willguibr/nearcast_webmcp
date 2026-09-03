import type { Store } from "../state/store.ts";
import type { ModelContext } from "../types/webmcp.d.ts";
import { createTools, TOOL_NAMES } from "./tools.ts";
import type { ModelContextToolDefinition } from "../types/webmcp.d.ts";

/** The exact tool objects handed to the browser host, so the UI can invoke them for manual testing. */
export const registeredTools: Record<string, ModelContextToolDefinition> = {};
import { installEmulatedHost, isEmulatedHost } from "./emulator.ts";

/** Chrome ships the API on document.modelContext; older previews used navigator.modelContext. */
export function detectModelContext(): ModelContext | undefined {
  if (typeof document !== "undefined" && document.modelContext?.registerTool) return document.modelContext;
  if (typeof navigator !== "undefined" && navigator.modelContext?.registerTool) return navigator.modelContext;
  return undefined;
}

/** Register all Nearcast tools. Returns a cleanup that unregisters them. */
export function registerWebMcpTools(store: Store): () => void {
  installEmulatedHost();
  const ctx = detectModelContext();
  if (!ctx) {
    store.setWebmcp("unavailable", TOOL_NAMES);
    return () => {};
  }
  const controller = new AbortController();
  const tools = createTools(store);
  for (const t of tools) registeredTools[t.name] = t;
  (async () => {
    const registered: string[] = [];
    for (const tool of tools) {
      try {
        await ctx.registerTool(tool, { signal: controller.signal });
        registered.push(tool.name);
      } catch (e) {
        console.warn(`WebMCP: failed to register ${tool.name}`, e);
      }
    }
    store.setWebmcp(registered.length ? (isEmulatedHost() ? "emulated" : "available") : "unavailable", registered.length ? registered : TOOL_NAMES);
  })();
  return () => {
    controller.abort();
    for (const t of tools) { try { ctx.unregisterTool?.(t.name); } catch { /* ignore */ } }
  };
}
