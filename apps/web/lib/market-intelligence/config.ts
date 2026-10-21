import path from "node:path";

import { DEFAULT_JEV_MODEL } from "@options-chart/decision-engine";

const DEFAULT_AUDIT_DIRECTORY = ".data/jev-audit";

export interface JevServerConfig {
  readonly enabled: boolean;
  readonly killSwitch: boolean;
  readonly apiKey: string | null;
  readonly model: string;
  readonly auditDirectory: string;
  readonly timeoutMs: number;
  readonly maxCallsPerHour: number;
  readonly maxCallsPerDay: number;
  readonly maxRequestBytes: number;
  readonly isVercel: boolean;
}

export interface JevServerHealth {
  readonly enabled: boolean;
  readonly killSwitch: boolean;
  readonly ready: boolean;
  readonly keyConfigured: boolean;
  readonly persistence: "filesystem" | "unavailable-on-vercel";
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxCallsPerHour: number;
  readonly maxCallsPerDay: number;
  readonly issues: readonly string[];
}

type Environment = Readonly<Record<string, string | undefined>>;

export class JevConfigurationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "JevConfigurationError";
  }
}

function isTrue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "1";
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new JevConfigurationError(
      "JEV_CONFIGURATION_INVALID",
      `${name} must be an integer`,
    );
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new JevConfigurationError(
      "JEV_CONFIGURATION_INVALID",
      `${name} must be between ${minimum} and ${maximum}`,
    );
  }
  return parsed;
}

function modelName(value: string | undefined): string {
  const model = value?.trim() || DEFAULT_JEV_MODEL;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(model)) {
    throw new JevConfigurationError(
      "JEV_CONFIGURATION_INVALID",
      "JEV_MODEL contains unsupported characters",
    );
  }
  return model;
}

export function readJevServerConfig(
  environment: Environment,
  cwd = process.cwd(),
): JevServerConfig {
  const maxCallsPerHour = boundedInteger(
    environment.JEV_MAX_CALLS_PER_HOUR,
    12,
    1,
    1_000,
    "JEV_MAX_CALLS_PER_HOUR",
  );
  const maxCallsPerDay = boundedInteger(
    environment.JEV_MAX_CALLS_PER_DAY,
    50,
    1,
    10_000,
    "JEV_MAX_CALLS_PER_DAY",
  );
  if (maxCallsPerDay < maxCallsPerHour) {
    throw new JevConfigurationError(
      "JEV_CONFIGURATION_INVALID",
      "JEV_MAX_CALLS_PER_DAY must be at least JEV_MAX_CALLS_PER_HOUR",
    );
  }

  return {
    enabled: isTrue(environment.JEV_SHADOW_ENABLED),
    killSwitch: environment.JEV_KILL_SWITCH?.trim().toLowerCase() !== "false",
    apiKey: environment.TYPESAFE_API_KEY?.trim() || null,
    model: modelName(environment.JEV_MODEL),
    auditDirectory: path.resolve(
      cwd,
      environment.JEV_AUDIT_DIR?.trim() || DEFAULT_AUDIT_DIRECTORY,
    ),
    timeoutMs: boundedInteger(
      environment.JEV_TIMEOUT_MS,
      2_000,
      250,
      10_000,
      "JEV_TIMEOUT_MS",
    ),
    maxCallsPerHour,
    maxCallsPerDay,
    maxRequestBytes: boundedInteger(
      environment.JEV_MAX_REQUEST_BYTES,
      65_536,
      1_024,
      262_144,
      "JEV_MAX_REQUEST_BYTES",
    ),
    isVercel: isTrue(environment.VERCEL),
  };
}

export function getJevServerHealth(config: JevServerConfig): JevServerHealth {
  const issues: string[] = [];
  if (!config.enabled) issues.push("JEV_SHADOW_DISABLED");
  if (config.killSwitch) issues.push("JEV_KILL_SWITCH_ACTIVE");
  if (config.apiKey === null) issues.push("JEV_API_KEY_MISSING");
  if (config.isVercel) issues.push("JEV_DURABLE_STORE_UNAVAILABLE");
  return {
    enabled: config.enabled,
    killSwitch: config.killSwitch,
    ready: issues.length === 0,
    keyConfigured: config.apiKey !== null,
    persistence: config.isVercel ? "unavailable-on-vercel" : "filesystem",
    model: config.model,
    timeoutMs: config.timeoutMs,
    maxCallsPerHour: config.maxCallsPerHour,
    maxCallsPerDay: config.maxCallsPerDay,
    issues,
  };
}

export function assertJevServerReady(config: JevServerConfig): string {
  const health = getJevServerHealth(config);
  if (!health.ready) {
    throw new JevConfigurationError(
      health.issues[0] ?? "JEV_NOT_READY",
      "Jev shadow provider is not ready",
    );
  }
  return config.apiKey as string;
}
