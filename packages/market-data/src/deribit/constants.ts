export const DERIBIT_REST_ENDPOINT = "https://www.deribit.com/api/v2";
export const DERIBIT_WS_ENDPOINT = "wss://www.deribit.com/ws/api/v2";

export const DERIBIT_CURRENCY = "BTC" as const;
export const DERIBIT_INDEX_NAME = "btc_usd" as const;
export const DERIBIT_MARK_PRICE_CHANNEL =
  `markprice.options.${DERIBIT_INDEX_NAME}` as const;
export const DERIBIT_INDEX_CHANNEL =
  `deribit_price_index.${DERIBIT_INDEX_NAME}` as const;
export const DERIBIT_REQUIRED_CHANNELS = [
  DERIBIT_MARK_PRICE_CHANNEL,
  DERIBIT_INDEX_CHANNEL,
] as const;

export const DERIBIT_REST_TIMEOUT_MS = 10_000;
export const DERIBIT_BOOK_SUMMARY_REFRESH_MS = 30_000;
export const DERIBIT_OI_STALE_AFTER_MS = 90_000;
export const DERIBIT_MARK_STALE_AFTER_MS = 15_000;
export const DERIBIT_MARK_HARD_STALE_AFTER_MS = 30_000;
export const DERIBIT_CATALOG_REFRESH_MS = 60 * 60_000;
export const DERIBIT_HEARTBEAT_INTERVAL_SECONDS = 30;
export const DERIBIT_CLIENT_RECONNECT_CLOSE_CODE = 4_000;
export const DERIBIT_CLOCK_SYNC_SAMPLES = 5;
export const DERIBIT_CLOCK_RESYNC_MS = 15 * 60_000;
export const DERIBIT_CLOCK_DEGRADED_OFFSET_MS = 5_000;
export const DERIBIT_CLOCK_REJECT_OFFSET_MS = 60_000;
export const DERIBIT_RECOVERY_VALID_MESSAGES = 3;
export const DERIBIT_RECOVERY_HEALTHY_MS = 5_000;
export const DERIBIT_POLL_RECOVERY_DELAY_MS = 5_000;
export const DERIBIT_BACKOFF_MIN_MS = 1_000;
export const DERIBIT_BACKOFF_MAX_MS = 30_000;
export const DERIBIT_BACKOFF_MULTIPLIER = 2;
export const DERIBIT_BACKOFF_JITTER_RATIO = 0.2;

export const deribitReconnectDelay = (
  attempt: number,
  random: () => number = Math.random,
): number => {
  const boundedAttempt = Math.max(0, Math.floor(attempt));
  const base = Math.min(
    DERIBIT_BACKOFF_MAX_MS,
    DERIBIT_BACKOFF_MIN_MS * DERIBIT_BACKOFF_MULTIPLIER ** boundedAttempt,
  );
  const centeredRandom = Math.min(1, Math.max(0, random())) * 2 - 1;
  const jitter = base * DERIBIT_BACKOFF_JITTER_RATIO * centeredRandom;
  return Math.round(
    Math.min(DERIBIT_BACKOFF_MAX_MS, Math.max(0, base + jitter)),
  );
};
