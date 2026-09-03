import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import type { ApiError, HazardResponse, HazardsResponse, HealthResponse } from "@nearcast/shared";
import type { SourceAdapter } from "../domain/hazard.ts";
import { loadHazards } from "../services/hazard-service.ts";
import { applyFilters, parseFilters } from "../services/filters.ts";
import { computeSummary } from "../services/summary.ts";
import { log, errorMessage } from "../utils/logging.ts";

const CACHE_SECONDS = Number(process.env.CACHE_CONTROL_SECONDS || 60);
const VERSION = process.env.APP_VERSION || "0.1.0";

const BASE_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "content-type",
  "x-content-type-options": "nosniff",
};

function json(status: number, body: unknown, cacheable = true): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: {
      ...BASE_HEADERS,
      "cache-control": cacheable && status === 200
        ? `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS * 2}, stale-while-revalidate=60`
        : "no-store",
    },
    body: JSON.stringify(body),
  };
}

function error(status: number, code: string, message: string, details?: unknown): APIGatewayProxyStructuredResultV2 {
  const body: ApiError = { error: { code, message, details } };
  return json(status, body, false);
}

export interface HandlerDeps { adapters?: SourceAdapter[] }

export function createHandler(deps: HandlerDeps = {}) {
  return async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> {
    const started = Date.now();
    const method = event.requestContext?.http?.method ?? "GET";
    const requestId = event.requestContext?.requestId;
    const path = (event.rawPath || "/").replace(/^\/api(?=\/|$)/, "").replace(/\/+$/, "") || "/";
    const query = event.queryStringParameters ?? {};

    if (method === "OPTIONS") return { statusCode: 204, headers: BASE_HEADERS, body: "" };
    if (method !== "GET" && method !== "HEAD") return error(405, "method_not_allowed", `${method} is not supported`);

    try {
      let result: APIGatewayProxyStructuredResultV2;
      let count: number | undefined;
      let sourceStatus: unknown;

      if (path === "/health") {
        const body: HealthResponse = { status: "ok", service: "nearcast-api", timestamp: new Date().toISOString(), version: VERSION };
        result = json(200, body, false);
      } else if (path === "/hazards") {
        const parsed = parseFilters(query);
        if (!parsed.ok) return error(400, "invalid_request", "One or more query parameters are invalid.", parsed.errors);
        const snap = await loadHazards({ adapters: deps.adapters });
        const { data, total } = applyFilters(snap.hazards, parsed.filters, parsed.regions);
        const body: HazardsResponse = {
          data,
          meta: { generatedAt: new Date().toISOString(), retrievedAt: snap.retrievedAt, sources: snap.sources, filters: parsed.filters, count: data.length, total },
        };
        count = data.length; sourceStatus = snap.sources.map((s) => `${s.id}:${s.status}`);
        result = json(200, body);
      } else if (path === "/hazards/summary") {
        const snap = await loadHazards({ adapters: deps.adapters });
        count = snap.hazards.length; sourceStatus = snap.sources.map((s) => `${s.id}:${s.status}`);
        result = json(200, computeSummary(snap.hazards, snap.sources, snap.retrievedAt));
      } else if (path.startsWith("/hazards/")) {
        const id = decodeURIComponent(path.slice("/hazards/".length));
        if (!id || id.length > 200) return error(400, "invalid_request", "Invalid hazard id.");
        const snap = await loadHazards({ adapters: deps.adapters });
        const hazard = snap.hazards.find((h) => h.id === id);
        if (!hazard) return error(404, "hazard_not_found", `No hazard with id "${id}" in the current data.`);
        const body: HazardResponse = { data: hazard, meta: { generatedAt: new Date().toISOString(), retrievedAt: snap.retrievedAt, sources: snap.sources } };
        result = json(200, body);
      } else {
        return error(404, "not_found", `No route for ${path}`);
      }
      log.info("request", { requestId, route: path, status: result.statusCode, durationMs: Date.now() - started, count, sources: sourceStatus });
      if (method === "HEAD") result.body = "";
      return result;
    } catch (e) {
      log.error("unhandled error", { requestId, route: path, error: errorMessage(e), durationMs: Date.now() - started });
      return error(500, "internal_error", "Unexpected error while building the response.");
    }
  };
}

export const handler = createHandler();
