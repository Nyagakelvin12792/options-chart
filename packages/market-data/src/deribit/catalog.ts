import type { OptionInstrument } from "@options-chart/domain";
import { NormalizationError } from "@options-chart/shared";

import type { DeribitOptionInstrumentPayload } from "./api-schemas";
import { DERIBIT_CATALOG_REFRESH_MS } from "./constants";
import { normalizeDeribitOptionInstrument } from "./production-normalizers";

export interface DeribitInstrumentClient {
  getInstruments(): Promise<readonly DeribitOptionInstrumentPayload[]>;
}

export class DeribitInstrumentCatalog {
  private instrumentsByName = new Map<string, OptionInstrument>();
  private refreshedAt: number | null = null;

  get lastRefreshedAt(): number | null {
    return this.refreshedAt;
  }

  get size(): number {
    return this.instrumentsByName.size;
  }

  get activeInstruments(): readonly OptionInstrument[] {
    return [...this.instrumentsByName.values()].sort((left, right) =>
      left.expiry !== right.expiry
        ? left.expiry - right.expiry
        : left.strike !== right.strike
          ? left.strike - right.strike
          : left.optionType.localeCompare(right.optionType),
    );
  }

  has(instrumentName: string): boolean {
    return this.instrumentsByName.has(instrumentName);
  }

  get(instrumentName: string): OptionInstrument | undefined {
    return this.instrumentsByName.get(instrumentName);
  }

  isStale(now: number, maxAgeMs = DERIBIT_CATALOG_REFRESH_MS): boolean {
    return this.refreshedAt === null || now - this.refreshedAt >= maxAgeMs;
  }

  replace(
    payloads: readonly DeribitOptionInstrumentPayload[],
    receivedTimestamp: number,
  ): readonly OptionInstrument[] {
    const next = new Map<string, OptionInstrument>();
    for (const payload of payloads) {
      const instrument = normalizeDeribitOptionInstrument(
        payload,
        receivedTimestamp,
      );
      if (!instrument.isActive || instrument.expiry <= receivedTimestamp) {
        continue;
      }
      if (next.has(instrument.instrumentName)) {
        throw new NormalizationError(
          "Deribit instrument catalog contains duplicates",
          {
            source: "deribit",
            operation: "replace-instrument-catalog",
            timestamp: receivedTimestamp,
            retryable: false,
            context: { instrumentName: instrument.instrumentName },
          },
        );
      }
      next.set(instrument.instrumentName, instrument);
    }
    this.instrumentsByName = next;
    this.refreshedAt = receivedTimestamp;
    return this.activeInstruments;
  }

  async refresh(
    client: DeribitInstrumentClient,
    receivedTimestamp: number,
  ): Promise<readonly OptionInstrument[]> {
    const payloads = await client.getInstruments();
    return this.replace(payloads, receivedTimestamp);
  }
}
