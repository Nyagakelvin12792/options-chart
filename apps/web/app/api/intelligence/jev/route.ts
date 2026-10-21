import { parseDecisionContext } from "@options-chart/decision-engine";
import { NextResponse } from "next/server";

import { getDashboardAccess } from "@/lib/auth";
import { createJevAuditStore } from "@/lib/market-intelligence/audit-store-factory";
import {
  getJevServerHealth,
  JevConfigurationError,
  readJevServerConfig,
} from "@/lib/market-intelligence/config";
import {
  JevShadowServiceError,
  runJevShadowAssessment,
} from "@/lib/market-intelligence/jev-service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStoreHeaders = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

async function authorize(): Promise<NextResponse | null> {
  const access = await getDashboardAccess();
  return access.authorized ? null : json({ error: "Unauthorized" }, 401);
}

export async function GET() {
  const unauthorized = await authorize();
  if (unauthorized !== null) return unauthorized;
  try {
    const config = readJevServerConfig(process.env);
    return json({ provider: "jev-v1", ...getJevServerHealth(config) });
  } catch (error) {
    return json(
      {
        provider: "jev-v1",
        ready: false,
        error:
          error instanceof JevConfigurationError
            ? error.code
            : "JEV_CONFIGURATION_INVALID",
      },
      503,
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = await authorize();
  if (unauthorized !== null) return unauthorized;

  let config;
  try {
    config = readJevServerConfig(process.env);
  } catch (error) {
    return json(
      {
        error:
          error instanceof JevConfigurationError
            ? error.code
            : "JEV_CONFIGURATION_INVALID",
      },
      503,
    );
  }
  const health = getJevServerHealth(config);
  if (!health.ready) return json({ error: health.issues[0] }, 503);

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > config.maxRequestBytes
  ) {
    return json({ error: "JEV_REQUEST_TOO_LARGE" }, 413);
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (Buffer.byteLength(body, "utf8") > config.maxRequestBytes) {
      return json({ error: "JEV_REQUEST_TOO_LARGE" }, 413);
    }
    payload = JSON.parse(body);
  } catch {
    return json({ error: "JEV_REQUEST_INVALID_JSON" }, 400);
  }
  let context;
  try {
    context = parseDecisionContext(payload);
  } catch {
    return json({ error: "JEV_CONTEXT_SCHEMA_INVALID" }, 400);
  }

  try {
    const result = await runJevShadowAssessment(
      context,
      {
        config,
        store: createJevAuditStore(config),
      },
      { signal: request.signal },
    );
    return json(result);
  } catch (error) {
    if (error instanceof JevShadowServiceError) {
      return json({ error: error.code }, error.httpStatus);
    }
    if (error instanceof JevConfigurationError) {
      return json({ error: error.code }, 503);
    }
    return json({ error: "JEV_SHADOW_REQUEST_FAILED" }, 500);
  }
}
