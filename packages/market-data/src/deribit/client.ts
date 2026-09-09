import {
  RateLimitError,
  SchemaValidationError,
  TimeoutError,
  TransportError,
} from "@options-chart/shared";
import type { ZodType } from "zod";

import {
  DeribitBookSummariesSchema,
  DeribitIndexPriceResultSchema,
  DeribitOptionInstrumentsSchema,
  DeribitOptionTickerSchema,
  DeribitRecentOptionTradesQuerySchema,
  DeribitRecentOptionTradesResultSchema,
  DeribitRecentOptionTradesTimeQuerySchema,
  DeribitRpcResponseSchema,
  DeribitTimeResultSchema,
} from "./api-schemas";
import type {
  DeribitBookSummaryPayload,
  DeribitIndexPriceResultPayload,
  DeribitOptionInstrumentPayload,
  DeribitOptionTickerPayload,
  DeribitRecentOptionTradesResult,
} from "./api-schemas";
import { DERIBIT_REST_ENDPOINT, DERIBIT_REST_TIMEOUT_MS } from "./constants";

export interface DeribitRestClientOptions {
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

export interface DeribitRecentOptionTradesOptions {
  readonly count?: number;
  readonly sorting?: "asc" | "desc" | "default";
  readonly startId?: string;
  readonly endId?: string;
  readonly startTimestamp?: number;
  readonly endTimestamp?: number;
}

type RpcParams = Readonly<Record<string, string | number | boolean>>;

const buildRequestUrl = (endpoint: string, method: string): URL => {
  const target = `${endpoint}/${method}`;
  if (/^[a-z][a-z\d+.-]*:/i.test(target)) {
    return new URL(target);
  }
  if (typeof globalThis.location === "undefined") {
    throw new TypeError(
      "A relative Deribit endpoint can only be used in a browser",
    );
  }
  return new URL(target, globalThis.location.origin);
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException
    ? error.name === "AbortError"
    : typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError";

export class DeribitRestClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: DeribitRestClientOptions = {}) {
    this.endpoint = (options.endpoint ?? DERIBIT_REST_ENDPOINT).replace(
      /\/$/,
      "",
    );
    this.timeoutMs = options.timeoutMs ?? DERIBIT_REST_TIMEOUT_MS;
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  }

  async request<T>(
    method: string,
    params: RpcParams,
    resultSchema: ZodType<T>,
  ): Promise<T> {
    const operation = method;
    const url = buildRequestUrl(this.endpoint, method);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, String(value));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;

    try {
      response = await this.fetcher(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new TimeoutError(`Deribit ${method} timed out`, {
          source: "deribit",
          operation,
          timestamp: Date.now(),
          retryable: true,
          context: { timeoutMs: this.timeoutMs },
          cause: error,
        });
      }
      throw new TransportError(`Deribit ${method} transport failed`, {
        source: "deribit",
        operation,
        timestamp: Date.now(),
        retryable: true,
        context: { endpoint: this.endpoint },
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) {
      throw new RateLimitError(`Deribit ${method} rate limit`, {
        source: "deribit",
        operation,
        timestamp: Date.now(),
        retryable: true,
        context: { status: response.status },
      });
    }
    if (!response.ok) {
      throw new TransportError(
        `Deribit ${method} returned HTTP ${response.status}`,
        {
          source: "deribit",
          operation,
          timestamp: Date.now(),
          retryable: response.status >= 500,
          context: { status: response.status },
        },
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new SchemaValidationError(
        `Deribit ${method} returned invalid JSON`,
        {
          source: "deribit",
          operation,
          timestamp: Date.now(),
          retryable: true,
          cause: error,
        },
      );
    }

    const envelope = DeribitRpcResponseSchema.safeParse(payload);
    if (!envelope.success) {
      throw new SchemaValidationError(
        `Deribit ${method} JSON-RPC envelope is invalid`,
        {
          source: "deribit",
          operation,
          timestamp: Date.now(),
          retryable: false,
          context: { issues: envelope.error.issues },
        },
      );
    }
    if (envelope.data.error !== undefined) {
      const ErrorType =
        envelope.data.error.code === 10028 ? RateLimitError : TransportError;
      throw new ErrorType(`Deribit ${method}: ${envelope.data.error.message}`, {
        source: "deribit",
        operation,
        timestamp: Date.now(),
        retryable: true,
        context: {
          rpcCode: envelope.data.error.code,
          rpcData: envelope.data.error.data,
        },
      });
    }

    const result = resultSchema.safeParse(envelope.data.result);
    if (!result.success) {
      throw new SchemaValidationError(`Deribit ${method} result is invalid`, {
        source: "deribit",
        operation,
        timestamp: Date.now(),
        retryable: false,
        context: { issues: result.error.issues },
      });
    }
    return result.data;
  }

  getInstruments(): Promise<readonly DeribitOptionInstrumentPayload[]> {
    return this.request(
      "public/get_instruments",
      { currency: "BTC", kind: "option", expired: false },
      DeribitOptionInstrumentsSchema,
    );
  }

  getBookSummary(): Promise<readonly DeribitBookSummaryPayload[]> {
    return this.request(
      "public/get_book_summary_by_currency",
      { currency: "BTC", kind: "option" },
      DeribitBookSummariesSchema,
    );
  }

  getIndexPrice(): Promise<number> {
    return this.getIndexReference().then((result) => result.index_price);
  }

  getIndexReference(): Promise<DeribitIndexPriceResultPayload> {
    return this.request(
      "public/get_index_price",
      { index_name: "btc_usd" },
      DeribitIndexPriceResultSchema,
    );
  }

  async getOptionTicker(
    instrumentName: string,
  ): Promise<DeribitOptionTickerPayload> {
    if (!/^BTC-[A-Z0-9]+-[0-9]+-[CP]$/.test(instrumentName)) {
      throw new SchemaValidationError("Invalid Deribit BTC option instrument", {
        source: "deribit",
        operation: "public/ticker",
        timestamp: Date.now(),
        retryable: false,
        context: { instrumentName },
      });
    }
    return this.request(
      "public/ticker",
      { instrument_name: instrumentName },
      DeribitOptionTickerSchema,
    );
  }

  async getRecentOptionTrades(
    options: DeribitRecentOptionTradesOptions = {},
  ): Promise<DeribitRecentOptionTradesResult> {
    const hasTimestampWindow =
      options.startTimestamp !== undefined || options.endTimestamp !== undefined;
    const hasIdWindow =
      options.startId !== undefined || options.endId !== undefined;
    const queryInput = {
      ...(options.count === undefined ? {} : { count: options.count }),
      ...(options.sorting === undefined ? {} : { sorting: options.sorting }),
      ...(options.startId === undefined ? {} : { start_id: options.startId }),
      ...(options.endId === undefined ? {} : { end_id: options.endId }),
      ...(options.startTimestamp === undefined
        ? {}
        : { start_timestamp: options.startTimestamp }),
      ...(options.endTimestamp === undefined
        ? {}
        : { end_timestamp: options.endTimestamp }),
    };
    if (hasTimestampWindow && hasIdWindow) {
      throw new SchemaValidationError(
        "Deribit recent option trade query cannot mix ID and time windows",
        {
          source: "deribit",
          operation: "recent-option-trades",
          timestamp: Date.now(),
          retryable: false,
        },
      );
    }

    // Deribit reports the public trade direction from the taker's perspective.
    // Option amount is BTC base coin; neither field identifies opening/closing.
    if (hasTimestampWindow) {
      const query =
        DeribitRecentOptionTradesTimeQuerySchema.safeParse(queryInput);
      if (!query.success) {
        throw new SchemaValidationError(
          "Deribit recent option trade time query is invalid",
          {
            source: "deribit",
            operation: "public/get_last_trades_by_currency_and_time",
            timestamp: Date.now(),
            retryable: false,
            context: { issues: query.error.issues },
          },
        );
      }
      return this.request(
        "public/get_last_trades_by_currency_and_time",
        {
          currency: "BTC",
          kind: "option",
          count: query.data.count,
          sorting: query.data.sorting,
          ...(query.data.start_timestamp === undefined
            ? {}
            : { start_timestamp: query.data.start_timestamp }),
          ...(query.data.end_timestamp === undefined
            ? {}
            : { end_timestamp: query.data.end_timestamp }),
        },
        DeribitRecentOptionTradesResultSchema,
      );
    }

    const query = DeribitRecentOptionTradesQuerySchema.safeParse(queryInput);
    if (!query.success) {
      throw new SchemaValidationError(
        "Deribit recent option trade query is invalid",
        {
          source: "deribit",
          operation: "public/get_last_trades_by_currency",
          timestamp: Date.now(),
          retryable: false,
          context: { issues: query.error.issues },
        },
      );
    }
    return this.request(
      "public/get_last_trades_by_currency",
      {
        currency: "BTC",
        kind: "option",
        count: query.data.count,
        sorting: query.data.sorting,
        ...(query.data.start_id !== undefined
          ? { start_id: query.data.start_id }
          : {}),
        ...(query.data.end_id !== undefined
          ? { end_id: query.data.end_id }
          : {}),
      },
      DeribitRecentOptionTradesResultSchema,
    );
  }

  getTime(): Promise<number> {
    return this.request("public/get_time", {}, DeribitTimeResultSchema);
  }
}
