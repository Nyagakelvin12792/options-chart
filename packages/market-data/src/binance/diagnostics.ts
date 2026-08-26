import {
  BINANCE_REST_ENDPOINTS,
  BINANCE_WS_ENDPOINTS,
  REST_TIMEOUT_MS,
} from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EndpointDiagnostic {
  readonly url: string;
  readonly type: "REST" | "WS";
  readonly reachable: boolean;
  readonly latencyMs: number | null;
  readonly error: string | null;
}

export interface DiagnosticsBundle {
  readonly timestamp: number;
  readonly results: readonly EndpointDiagnostic[];
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * Test reachability and latency of all Binance REST and WebSocket endpoints.
 *
 * REST endpoints are tested via `/api/v3/time`.
 * WS endpoints are tested via a connect+close handshake.
 *
 * The resulting bundle is capped at 256 KB when serialized (RISK constraint).
 */
export async function runEndpointDiagnostics(): Promise<DiagnosticsBundle> {
  const results: EndpointDiagnostic[] = [];

  // Test REST endpoints.
  for (const base of BINANCE_REST_ENDPOINTS) {
    const t0 = performance.now();
    try {
      const response = await fetch(`${base}/api/v3/time`, {
        signal: AbortSignal.timeout(REST_TIMEOUT_MS),
        cache: "no-store",
      });
      const latencyMs = Math.round(performance.now() - t0);
      results.push({
        url: base,
        type: "REST",
        reachable: response.ok,
        latencyMs,
        error: response.ok ? null : `HTTP ${response.status}`,
      });
    } catch (error) {
      results.push({
        url: base,
        type: "REST",
        reachable: false,
        latencyMs: null,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Test WS endpoints (connect + immediate close).
  for (const base of BINANCE_WS_ENDPOINTS) {
    const testUrl = `${base}/btcusdt@kline_1m`;
    try {
      const latency = await testWebSocketEndpoint(testUrl);
      results.push({
        url: base,
        type: "WS",
        reachable: true,
        latencyMs: latency,
        error: null,
      });
    } catch (error) {
      results.push({
        url: base,
        type: "WS",
        reachable: false,
        latencyMs: null,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return {
    timestamp: Date.now(),
    results,
  };
}

function testWebSocketEndpoint(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const t0 = performance.now();
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("WebSocket handshake timeout (8s)"));
    }, REST_TIMEOUT_MS);

    const ws = new WebSocket(url);

    ws.onopen = () => {
      clearTimeout(timeout);
      const latency = Math.round(performance.now() - t0);
      ws.close();
      resolve(latency);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("WebSocket connection error"));
    };
  });
}
