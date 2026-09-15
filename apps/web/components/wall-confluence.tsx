"use client";

import { Info } from "lucide-react";

import type {
  WallExpiryBreadth,
  WallReactionClassification,
} from "../lib/wall-confluence";

export type WallSignalKind =
  | "gamma"
  | "open-interest"
  | "volume"
  | "flow-informed-dealer"
  | "max-pain"
  | "gamma-flip";

export type WallBias = "support" | "resistance" | "pivot" | "neutral";

export type WallStrength = "developing" | "moderate" | "strong" | "major";

export interface WallSignal {
  readonly kind: WallSignalKind;
  readonly confidence?: number;
  readonly detail?: string;
}

export interface WallConfluenceContributions {
  readonly concentration: number;
  readonly persistence: number;
  readonly distance: number;
  readonly expiry: number;
  readonly reaction: number;
}

export interface WallConfluenceZone {
  readonly id: string;
  readonly priceLow: number;
  readonly priceHigh: number;
  readonly score: number;
  readonly confidence: number;
  readonly bias: WallBias;
  readonly signals: readonly WallSignal[];
  readonly contributions: WallConfluenceContributions;
  readonly strength?: WallStrength;
  readonly expiryBreadth?: WallExpiryBreadth;
  readonly reactionClassification?: WallReactionClassification;
}

export interface WallConfluenceProps {
  readonly zones: readonly WallConfluenceZone[];
  readonly currency?: string;
  readonly locale?: string;
  readonly maxVisible?: number;
  readonly className?: string;
  readonly title?: string;
  readonly emptyLabel?: string;
}

export interface PositionedWallConfluenceZone extends WallConfluenceZone {
  readonly top: number;
  readonly bottom: number;
  readonly left?: number;
}

export interface ConfluenceZoneOverlayProps {
  readonly zones: readonly PositionedWallConfluenceZone[];
  readonly maxVisible?: number;
  readonly className?: string;
}

const SIGNAL_LABELS: Record<WallSignalKind, string> = {
  gamma: "Gamma",
  "open-interest": "Open interest",
  volume: "Volume",
  "flow-informed-dealer": "Dealer flow",
  "max-pain": "Max pain",
  "gamma-flip": "Gamma flip",
};

const SIGNAL_SHORT_LABELS: Record<WallSignalKind, string> = {
  gamma: "GEX",
  "open-interest": "OI",
  volume: "VOL",
  "flow-informed-dealer": "FLOW",
  "max-pain": "PAIN",
  "gamma-flip": "FLIP",
};

const CONTRIBUTION_LABELS: ReadonlyArray<
  readonly [keyof WallConfluenceContributions, string, string]
> = [
  [
    "concentration",
    "Concentration",
    "Share of the relevant options exposure clustered inside this zone.",
  ],
  [
    "persistence",
    "Persistence",
    "How consistently the zone has remained important across recent snapshots.",
  ],
  [
    "distance",
    "Distance",
    "Proximity to spot, with nearer actionable zones receiving more weight.",
  ],
  ["expiry", "Expiry", "Importance of the expiries contributing to the zone."],
  [
    "reaction",
    "Reaction",
    "Strength and consistency of recent price reactions at this zone.",
  ],
];

const clampScore = (value: number): number =>
  Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const distinctSignals = (
  signals: readonly WallSignal[],
): readonly WallSignal[] => {
  const byKind = new Map<WallSignalKind, WallSignal>();
  for (const signal of signals) {
    const previous = byKind.get(signal.kind);
    if (
      !previous ||
      clampScore(signal.confidence ?? 0) > clampScore(previous.confidence ?? 0)
    ) {
      byKind.set(signal.kind, signal);
    }
  }
  return [...byKind.values()];
};

export const wallStrengthForScore = (score: number): WallStrength => {
  const normalized = clampScore(score);
  if (normalized >= 85) return "major";
  if (normalized >= 70) return "strong";
  if (normalized >= 50) return "moderate";
  return "developing";
};

const strengthLabel = (strength: WallStrength): string =>
  strength === "major"
    ? "Major"
    : strength === "strong"
      ? "Strong"
      : strength === "moderate"
        ? "Moderate"
        : "Developing";

const reactionLabel = (classification: WallReactionClassification): string =>
  classification === "rejection"
    ? "Rejection"
    : classification === "breakout"
      ? "Breakout"
      : classification === "retest"
        ? "Retest"
        : "Unconfirmed";

function SignalChip({ signal }: { readonly signal: WallSignal }) {
  const confidence =
    signal.confidence === undefined
      ? null
      : Math.round(clampScore(signal.confidence));
  const description = [
    SIGNAL_LABELS[signal.kind],
    confidence === null ? null : `${confidence}% confidence`,
    signal.detail,
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <span
      className={`wall-confluence-signal signal-${signal.kind}`}
      aria-label={description}
      title={description}
    >
      <span aria-hidden="true">{SIGNAL_SHORT_LABELS[signal.kind]}</span>
      <span className="sr-only">{SIGNAL_LABELS[signal.kind]}</span>
    </span>
  );
}

function ContributionBreakdown({
  contributions,
  zoneId,
}: {
  readonly contributions: WallConfluenceContributions;
  readonly zoneId: string;
}) {
  return (
    <div className="wall-confluence-breakdown" id={`wall-breakdown-${zoneId}`}>
      {CONTRIBUTION_LABELS.map(([key, label, description]) => {
        const score = Math.round(clampScore(contributions[key]));
        return (
          <div className="wall-confluence-factor" key={key} title={description}>
            <span>{label}</span>
            <span
              className="wall-confluence-factor-track"
              role="meter"
              aria-label={`${label}: ${score} out of 100`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={score}
            >
              <span style={{ width: `${score}%` }} />
            </span>
            <strong>{score}</strong>
          </div>
        );
      })}
    </div>
  );
}

function WallZoneRow({
  zone,
  priceFormatter,
}: {
  readonly zone: WallConfluenceZone;
  readonly priceFormatter: Intl.NumberFormat;
}) {
  const score = Math.round(clampScore(zone.score));
  const confidence = Math.round(clampScore(zone.confidence));
  const signals = distinctSignals(zone.signals);
  const strength = zone.strength ?? wallStrengthForScore(score);
  const expiryCount = zone.expiryBreadth?.distinctExpiryCount ?? 0;
  const expiryLabel =
    expiryCount > 0
      ? `${expiryCount} ${expiryCount === 1 ? "expiry" : "expiries"}`
      : null;
  const reaction = zone.reactionClassification
    ? reactionLabel(zone.reactionClassification)
    : null;
  const low = Math.min(zone.priceLow, zone.priceHigh);
  const high = Math.max(zone.priceLow, zone.priceHigh);
  const rangeLabel =
    low === high
      ? priceFormatter.format(low)
      : `${priceFormatter.format(low)}–${priceFormatter.format(high)}`;

  return (
    <article
      className={`wall-confluence-zone bias-${zone.bias} strength-${strength}`}
      aria-label={`${strengthLabel(strength)} ${zone.bias} wall zone at ${rangeLabel}, confluence score ${score}${expiryLabel ? `, ${expiryLabel}` : ""}${reaction ? `, ${reaction} reaction` : ""}`}
    >
      <div className="wall-confluence-zone-main">
        <div className="wall-confluence-range">
          <span>{zone.bias}</span>
          <strong>{rangeLabel}</strong>
        </div>

        <div
          className="wall-confluence-score"
          aria-label={`Confluence score ${score} out of 100`}
        >
          <strong>{score}</strong>
          <span>/100</span>
        </div>

        <div className="wall-confluence-strength">
          <strong>{strengthLabel(strength)}</strong>
          <span>
            {confidence}% confidence{reaction ? ` · ${reaction}` : ""}
          </span>
        </div>

        <div className="wall-confluence-overlap">
          <Info size={14} aria-hidden="true" />
          <strong>{signals.length} of 6</strong>
          <span>signals overlap{expiryLabel ? ` · ${expiryLabel}` : ""}</span>
        </div>

        <div
          className="wall-confluence-signals"
          aria-label="Overlapping wall signals"
        >
          {signals.map((signal) => (
            <SignalChip key={signal.kind} signal={signal} />
          ))}
        </div>

        <details className="wall-confluence-details">
          <summary aria-controls={`wall-breakdown-${zone.id}`}>
            <Info size={14} aria-hidden="true" />
            <span>Score detail</span>
          </summary>
          <ContributionBreakdown
            contributions={zone.contributions}
            zoneId={zone.id}
          />
        </details>
      </div>
      <span className="wall-confluence-score-track" aria-hidden="true">
        <span style={{ width: `${score}%` }} />
      </span>
    </article>
  );
}

export function WallConfluence({
  zones,
  currency = "USD",
  locale = "en-US",
  maxVisible = 4,
  className = "",
  title = "Wall confluence",
  emptyLabel = "No qualified confluence zones",
}: WallConfluenceProps) {
  const priceFormatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  });
  const visibleZones = zones.slice(0, Math.max(0, maxVisible));

  return (
    <section
      className={`wall-confluence ${className}`.trim()}
      aria-labelledby="wall-confluence-heading"
    >
      <header className="wall-confluence-header">
        <div>
          <span>OPTIONS STRUCTURE</span>
          <h2 id="wall-confluence-heading">{title}</h2>
        </div>
        <span className="wall-confluence-count">
          {visibleZones.length} {visibleZones.length === 1 ? "zone" : "zones"}
        </span>
      </header>

      {visibleZones.length > 0 ? (
        <div className="wall-confluence-list">
          {visibleZones.map((zone) => (
            <WallZoneRow
              key={zone.id}
              zone={zone}
              priceFormatter={priceFormatter}
            />
          ))}
        </div>
      ) : (
        <p className="wall-confluence-empty">{emptyLabel}</p>
      )}
    </section>
  );
}

export function ConfluenceZoneOverlay({
  zones,
  maxVisible = 8,
  className = "",
}: ConfluenceZoneOverlayProps) {
  const visibleZones = zones.slice(0, Math.max(0, maxVisible));

  return (
    <div
      className={`confluence-zone-overlay ${className}`.trim()}
      aria-label="Wall confluence chart zones"
    >
      {visibleZones.map((zone) => {
        const top = Math.min(zone.top, zone.bottom);
        const height = Math.max(2, Math.abs(zone.bottom - zone.top));
        const score = Math.round(clampScore(zone.score));
        const signalCount = distinctSignals(zone.signals).length;
        const expiryCount = zone.expiryBreadth?.distinctExpiryCount ?? 0;
        const expiryLabel =
          expiryCount > 0
            ? `, ${expiryCount} ${expiryCount === 1 ? "expiry" : "expiries"}`
            : "";
        const reactionLabelText = zone.reactionClassification
          ? `, ${reactionLabel(zone.reactionClassification)} reaction`
          : "";
        const strength = zone.strength ?? wallStrengthForScore(score);

        return (
          <div
            className={`confluence-zone-band bias-${zone.bias} strength-${strength}`}
            key={zone.id}
            style={{
              top,
              height,
              ...(zone.left !== undefined && zone.left > 0
                ? {
                    left: `${Math.round(zone.left)}px`,
                    width: `calc(100% - ${Math.round(zone.left)}px)`,
                    borderLeft: `2px solid var(--bias-border, currentcolor)`,
                  }
                : {}),
            }}
            role="img"
            aria-label={`${strengthLabel(strength)} ${zone.bias} confluence zone, score ${score}, ${signalCount} of 6 signals overlap${expiryLabel}${reactionLabelText}`}
          />
        );
      })}
    </div>
  );
}
