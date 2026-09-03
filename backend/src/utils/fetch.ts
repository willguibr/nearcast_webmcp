export const USER_AGENT =
  process.env.USER_AGENT ||
  "Nearcast-WebMCP/0.1 (https://nearcast.securitygeek.io; nearcast@securitygeek.io)";

export const DEFAULT_SOURCE_TIMEOUT_MS = Number(process.env.SOURCE_TIMEOUT_MS || 5000);

export interface FetchOptions {
  timeoutMs?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export class UpstreamError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
  }
}

/** fetch() with a hard per-request timeout via AbortController. */
export async function fetchWithTimeout(url: string, opts: FetchOptions = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_SOURCE_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "AbortError")), timeoutMs);
  const onOuterAbort = () => controller.abort(opts.signal?.reason);
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, application/geo+json;q=0.9, text/plain;q=0.8", ...opts.headers },
      redirect: "follow",
    });
    if (!res.ok) throw new UpstreamError(`HTTP ${res.status} from ${new URL(url).host}`, res.status);
    return res;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}

export async function fetchJson<T = unknown>(url: string, opts?: FetchOptions): Promise<T> {
  const res = await fetchWithTimeout(url, opts);
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
  const res = await fetchWithTimeout(url, opts);
  return res.text();
}
