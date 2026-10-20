import type {
  EvidenceSource,
  MarketStateEvidenceV1,
  NumericEvidenceV1,
} from "./market-state-contracts";

const VENUE_BY_SOURCE: Readonly<Partial<Record<EvidenceSource, string>>> = {
  "binance-spot": "binance-spot",
  deribit: "deribit",
  "cryptofeed-shadow": "cryptofeed-binance-spot",
};

const sortedUnique = (values: Iterable<string>): string[] =>
  [...new Set(values)].sort();

/** Accumulates exact evidence and provenance while a state is being built. */
export class EvidenceCollector {
  private readonly evidence = new Map<string, NumericEvidenceV1>();
  private readonly formulas = new Map<string, string>();
  private readonly features = new Map<string, string>();
  private readonly venues = new Set<string>();
  private readonly sources = new Set<string>();
  private readonly futureIds = new Set<string>();
  private readonly warnings = new Set<string>();

  /** Records numeric evidence and returns its stable reference ID. */
  add(item: NumericEvidenceV1): string {
    const existing = this.evidence.get(item.evidenceId);
    if (
      existing !== undefined &&
      (existing.name !== item.name ||
        existing.value !== item.value ||
        existing.unit !== item.unit ||
        existing.formulaVersion !== item.formulaVersion ||
        existing.source !== item.source ||
        existing.effectiveAtMs !== item.effectiveAtMs)
    ) {
      throw new Error(`Conflicting evidence for ${item.evidenceId}`);
    }
    this.evidence.set(item.evidenceId, item);
    this.formulas.set(item.name, item.formulaVersion);
    const venue = VENUE_BY_SOURCE[item.source];
    if (venue !== undefined) {
      this.venues.add(venue);
    }
    return item.evidenceId;
  }

  addFormulaVersion(key: string, version: string): void {
    this.formulas.set(key, version);
  }

  addFeatureVersion(key: string, version: string): void {
    this.features.set(key, version);
  }

  addVenue(venue: string): void {
    this.venues.add(venue);
  }

  addSourceIds(ids: readonly string[]): void {
    for (const id of ids) {
      this.sources.add(id);
    }
  }

  markFuture(id: string): void {
    this.futureIds.add(id);
    this.warnings.add(`FUTURE_EVIDENCE_EXCLUDED:${id}`);
  }

  warn(code: string): void {
    this.warnings.add(code);
  }

  hasEvidence(id: string): boolean {
    return this.evidence.has(id);
  }

  warningCodes(): string[] {
    return sortedUnique(this.warnings);
  }

  build(): MarketStateEvidenceV1 {
    const toRecord = (map: Map<string, string>): Record<string, string> =>
      Object.fromEntries(
        [...map.entries()].sort(([a], [b]) => a.localeCompare(b)),
      );
    return {
      sourceIds: sortedUnique(this.sources),
      numericEvidence: [...this.evidence.values()].sort((a, b) =>
        a.evidenceId.localeCompare(b.evidenceId),
      ),
      formulaVersions: toRecord(this.formulas),
      featureVersions: toRecord(this.features),
      includedVenues: sortedUnique(this.venues),
      excludedFutureEvidenceIds: sortedUnique(this.futureIds),
      auditWarnings: sortedUnique(this.warnings),
    };
  }
}
