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
  DeribitRpcResponseSchema,
  DeribitTimeResultSchema,
} from "./api-schemas";
import type {
  DeribitBookSummaryPayload,
  DeribitOptionInstrumentPayload,
} from "./api-schemas";
import { DERIBIT_REST_ENDPOINT, DERIBIT_REST_TIMEOUT_MS } from "./constants";

export interface DeribitRestClientOptions {
  readonly endpoint?: string;
  readonly timeoutMs?: number;
  readonly fetcher?: typeof fetch;
}

type RpcParams = Readonly<Record<string, string | number | boolean>>;

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
    const url = new URL(`${this.endpoint}/${method}`);
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
    return this.request(
      "public/get_index_price",
      { index_name: "btc_usd" },
      DeribitIndexPriceResultSchema,
    ).then((result) => result.index_price);
  }

  getTime(): Promise<number> {
    return this.request("public/get_time", {}, DeribitTimeResultSchema);
  }
}
