import {
  JevAuditStoreError,
  type JevAuditStorePort,
  NdjsonJevAuditStore,
} from "./audit-store";
import type { JevServerConfig } from "./config";
import { PostgresJevAuditStore } from "./postgres-audit-store";

export function createJevAuditStore(
  config: JevServerConfig,
): JevAuditStorePort {
  if (config.auditStore === "filesystem") {
    return new NdjsonJevAuditStore(config.auditDirectory);
  }
  if (config.databaseUrl === null) {
    throw new JevAuditStoreError(
      "JEV_DATABASE_URL_MISSING",
      "Postgres audit storage requires DATABASE_URL",
    );
  }
  return new PostgresJevAuditStore(config.databaseUrl);
}
