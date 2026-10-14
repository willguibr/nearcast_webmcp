import type { AwarenessSnapshot } from "@nearcast/shared";
import { demoAwareness } from "./demo-awareness.ts";
export async function fetchAwareness(demo: boolean, signal?: AbortSignal): Promise<AwarenessSnapshot> {
  if (demo) return demoAwareness();
  const response = await fetch("/api/awareness", { signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Nearcast place feeds responded with HTTP ${response.status}`);
  const body = await response.json() as AwarenessSnapshot;
  if (!Array.isArray(body.items) || !Array.isArray(body.sources) || typeof body.retrievedAt !== "string" || body.demo !== false) throw new Error("Unexpected place feed response");
  return body;
}
