/** Minimal local HTTP server that adapts Node requests to the Lambda handler. */
import http from "node:http";
import { handler } from "./handlers/api.ts";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const port = Number(process.env.PORT || 8787);

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const event = {
    version: "2.0",
    routeKey: "$default",
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""])),
    requestContext: { http: { method: req.method ?? "GET", path: url.pathname }, requestId: `local-${Date.now()}` },
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyEventV2;
  const out = await handler(event);
  res.writeHead(out.statusCode ?? 200, out.headers as Record<string, string>);
  res.end(out.body ?? "");
}).listen(port, () => console.log(`nearcast-api dev server listening on http://localhost:${port}/api/health`));
