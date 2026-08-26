export type DataSource = "binance" | "deribit" | "calculated" | "system";

export interface DomainEventMetadata {
  readonly source: DataSource;
  readonly sourceTimestamp: number;
  readonly receivedTimestamp: number;
  readonly normalizedTimestamp: number;
  readonly schemaVersion: string;
}
