import type { OptionsChainSnapshot } from "@options-chart/domain";

import type { DeribitMarkUpdate } from "./types";

export interface MarkApplicationResult {
  readonly snapshot: OptionsChainSnapshot | null;
  readonly applied: number;
  readonly unknownInstrumentNames: readonly string[];
}

export class DeribitOptionsStore {
  private currentSnapshot: OptionsChainSnapshot | null = null;
  private lastValidSnapshot: OptionsChainSnapshot | null = null;

  get snapshot(): OptionsChainSnapshot | null {
    return this.currentSnapshot;
  }

  get cachedSnapshot(): OptionsChainSnapshot | null {
    return this.lastValidSnapshot;
  }

  replace(snapshot: OptionsChainSnapshot): OptionsChainSnapshot {
    this.currentSnapshot = snapshot;
    this.lastValidSnapshot = snapshot;
    return snapshot;
  }

  restoreLastValid(): OptionsChainSnapshot | null {
    this.currentSnapshot = this.lastValidSnapshot;
    return this.currentSnapshot;
  }

  applyMarkUpdates(
    updates: readonly DeribitMarkUpdate[],
  ): MarkApplicationResult {
    if (this.currentSnapshot === null) {
      return {
        snapshot: null,
        applied: 0,
        unknownInstrumentNames: updates.map((update) => update.instrumentName),
      };
    }

    const updatesByName = new Map(
      updates.map((update) => [update.instrumentName, update]),
    );
    const knownNames = new Set(
      this.currentSnapshot.instruments.map(
        (item) => item.instrument.instrumentName,
      ),
    );
    let applied = 0;
    const instruments = this.currentSnapshot.instruments.map((item) => {
      const update = updatesByName.get(item.instrument.instrumentName);
      if (update === undefined) {
        return item;
      }
      applied += 1;
      return {
        instrument: item.instrument,
        quote: {
          ...item.quote,
          metadata: update.metadata,
          markPriceBtc: update.markPriceBtc,
          markIvDecimal: update.markIvDecimal,
        },
      };
    });
    const sourceTimestamp = updates.reduce(
      (latest, update) => Math.max(latest, update.metadata.sourceTimestamp),
      this.currentSnapshot.metadata.sourceTimestamp,
    );
    this.currentSnapshot = {
      ...this.currentSnapshot,
      metadata: {
        ...this.currentSnapshot.metadata,
        sourceTimestamp,
        receivedTimestamp: Math.max(
          this.currentSnapshot.metadata.receivedTimestamp,
          ...updates.map((update) => update.metadata.receivedTimestamp),
        ),
        normalizedTimestamp: Date.now(),
        schemaVersion:
          updates[0]?.metadata.schemaVersion ??
          this.currentSnapshot.metadata.schemaVersion,
      },
      instruments,
    };
    this.lastValidSnapshot = this.currentSnapshot;

    return {
      snapshot: this.currentSnapshot,
      applied,
      unknownInstrumentNames: updates
        .map((update) => update.instrumentName)
        .filter((name) => !knownNames.has(name)),
    };
  }
}
