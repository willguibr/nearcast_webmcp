import type { AwarenessItem } from "@nearcast/shared";
import { USER_AGENT } from "../../utils/fetch.ts";
import type { ParsedItems } from "./awareness.ts";
export type Row = Record<string, any>;
export async function fetchDocument(url: string, signal: AbortSignal): Promise<Row> {
  // The caller's deadline covers pagination AND response-body consumption.
  const response = await fetch(url, { signal, headers: { "User-Agent": USER_AGENT, accept: "application/json, application/geo+json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${new URL(url).hostname}`);
  return await response.json() as Row;
}
export const isRow = (value: unknown): value is Row => !!value && typeof value === "object" && !Array.isArray(value);
export const str = (v: unknown): string => typeof v === "string" ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : "";
export const number = (v: unknown): number | undefined => {
  if (typeof v !== "number" && (typeof v !== "string" || !v.trim())) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
export function iso(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (value === "" || value === 0) return undefined;
  const t = new Date(value);
  return Number.isFinite(t.getTime()) ? t.toISOString() : undefined;
}
export function features(body: unknown): Row[] {
  if (!isRow(body) || body.type !== "FeatureCollection" || !Array.isArray(body.features)) throw new Error("Unexpected GeoJSON response");
  return body.features;
}
export function parseRows(rows: unknown[], parse: (row: Row) => AwarenessItem | null | undefined): ParsedItems {
  const items: AwarenessItem[] = [], ids = new Set<string>();
  let rejectedCount = 0;
  for (const row of rows) {
    const item = isRow(row) ? parse(row) : undefined;
    // null means deliberately excluded by documented status, undefined means malformed.
    if (item === undefined) { rejectedCount++; continue; }
    if (item && !ids.has(item.id)) { ids.add(item.id); items.push(item); }
  }
  if (rows.length > 0 && rejectedCount === rows.length) throw new Error("No records could be parsed; response may have changed");
  return { items, rejectedCount };
}

