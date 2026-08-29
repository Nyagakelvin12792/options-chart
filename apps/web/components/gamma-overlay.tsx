"use client";

import type {
  CalculationMetadata,
  GammaLevel,
  GammaLevelKind,
  OptionType,
  OptionsSummaryMetrics,
} from "@options-chart/domain";
import { Info } from "lucide-react";

import {
  layoutCollisionItems,
  type CollisionItem,
} from "./gamma-overlay-layout";

export type LevelDisplayState = "LIVE" | "FALLBACK" | "STALE" | "INVALID";
export type ProfileMetric = "gex" | "open-interest" | "volume";

export interface LevelConcentrationDetails {
  readonly openInterestBtc: number;
  readonly volumeBtc: number;
  readonly volumeUsd: number;
  readonly grossGammaOnePercentUsd: number;
  readonly sameSideGrossShare: number | null;
}

export interface PositionedLevel {
  readonly level: GammaLevel;
  readonly trueY: number;
  readonly state: LevelDisplayState;
  readonly displayStrength: number;
  readonly concentration: LevelConcentrationDetails | null;
}

export interface PositionedProfileBar {
  readonly id: string;
  readonly strike: number;
  readonly optionType: OptionType;
  readonly value: number;
  readonly y: number;
  readonly strength: number;
}

const levelPriority = (kind: GammaLevelKind): number => {
  if (kind === "gamma-flip") return 1;
  if (kind === "call-wall" || kind === "put-wall") return 2;
  if (kind === "max-pain") return 3;
  return 4;
};

const compactUsd = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const compactBtc = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});
const priceFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const kindClass = (kind: GammaLevelKind): string =>
  `level-${kind.replaceAll("-", "_")}`;

const formatAge = (sourceTimestamp: number, now: number): string => {
  const seconds = Math.max(0, Math.round((now - sourceTimestamp) / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
};

const profileVisualStrength = (strength: number): number =>
  Math.sqrt(Math.max(0, Math.min(1, strength)));

function AuditTooltip({
  metadata,
  state,
  now,
  concentration,
}: {
  readonly metadata: CalculationMetadata;
  readonly state: LevelDisplayState;
  readonly now: number;
  readonly concentration?: LevelConcentrationDetails | null;
}) {
  const exclusions = Object.entries(metadata.excludedCountByReason)
    .map(([reason, count]) => `${reason}: ${count}`)
    .join(", ");
  return (
    <span className="level-audit-tooltip" role="tooltip">
      <strong>{state} calculation</strong>
      <span>Scope: {metadata.expiryScope}</span>
      <span>
        Source: {metadata.event.source} · age{" "}
        {formatAge(metadata.event.sourceTimestamp, now)}
      </span>
      <span>Calculated: {dateFormatter.format(metadata.calculatedAt)} UTC</span>
      <span>
        Contracts: {metadata.contractsIncluded}/{metadata.contractsSeen}
      </span>
      <span>Engine: {metadata.calculationEngineVersion}</span>
      <span>GEX: {metadata.gexModelVersion}</span>
      <span>Profile: {metadata.gammaProfileVersion}</span>
      {concentration ? (
        <>
          <span>
            Open interest: {compactBtc.format(concentration.openInterestBtc)}{" "}
            BTC
          </span>
          <span>
            24h volume: {compactBtc.format(concentration.volumeBtc)} BTC
            {concentration.volumeUsd > 0
              ? ` ($${compactUsd.format(concentration.volumeUsd)})`
              : ""}
          </span>
          <span>
            Gross gamma / 1%: $
            {compactUsd.format(concentration.grossGammaOnePercentUsd)}
          </span>
          {concentration.sameSideGrossShare === null ? null : (
            <span>
              Same-side gamma share:{" "}
              {(concentration.sameSideGrossShare * 100).toFixed(1)}%
            </span>
          )}
        </>
      ) : null}
      {exclusions ? <span>Excluded: {exclusions}</span> : null}
    </span>
  );
}

export function LevelRail({
  levels,
  currentPrice,
  currentPriceY,
  chartHeight,
  now,
  invalidKinds,
}: {
  readonly levels: readonly PositionedLevel[];
  readonly currentPrice: number | null;
  readonly currentPriceY: number | null;
  readonly chartHeight: number;
  readonly now: number;
  readonly invalidKinds: readonly GammaLevelKind[];
}) {
  const items: CollisionItem[] = levels.map(({ level, trueY }) => ({
    id: level.id,
    trueY,
    priority: levelPriority(level.kind),
  }));
  if (currentPrice !== null && currentPriceY !== null) {
    items.push({ id: "current-price", trueY: currentPriceY, priority: 0 });
  }
  const placements = layoutCollisionItems(items, chartHeight);
  const byId = new Map(
    placements.map((placement) => [placement.id, placement]),
  );

  return (
    <aside className="level-rail" aria-label="Options level rail">
      <span className="level-rail-title">LEVEL RAIL</span>
      {currentPrice !== null && currentPriceY !== null ? (
        <div
          className="level-tag current-price-tag"
          data-testid="current-price-level"
          style={{ top: byId.get("current-price")?.displayY ?? currentPriceY }}
        >
          <span>SPOT</span>
          <strong>{priceFormatter.format(currentPrice)}</strong>
        </div>
      ) : null}
      {levels.map(({ level, trueY, state, displayStrength, concentration }) => {
        const placement = byId.get(level.id);
        if (!placement) return null;
        return (
          <div
            key={level.id}
            className={`level-tag ${kindClass(level.kind)} state-${state.toLowerCase()} ${level.importance}`}
            data-testid={`level-tag-${level.kind}`}
            style={
              {
                top: placement.displayY,
                "--level-strength": Math.max(0.35, displayStrength),
              } as React.CSSProperties
            }
            tabIndex={0}
          >
            {placement.shifted ? (
              <span
                className="level-leader"
                aria-hidden="true"
                style={{
                  height: Math.abs(placement.displayY - trueY),
                  top: Math.min(0, trueY - placement.displayY),
                }}
              />
            ) : null}
            <span className="level-state-mark">{state}</span>
            <span className="level-name">
              {(level.kind === "gamma-flip"
                ? "Gamma Flip"
                : level.label
              ).toUpperCase()}
            </span>
            <strong>{priceFormatter.format(level.price)}</strong>
            <span className="level-concentration" aria-hidden="true">
              <span
                style={{ width: `${Math.max(8, displayStrength * 100)}%` }}
              />
            </span>
            <AuditTooltip
              metadata={level.metadata}
              state={state}
              now={now}
              concentration={concentration}
            />
          </div>
        );
      })}
      {invalidKinds.map((kind) => (
        <div
          key={kind}
          className="invalid-level-tag"
          data-testid={`invalid-${kind}`}
        >
          {kind.replaceAll("-", " ").toUpperCase()} · INVALID
        </div>
      ))}
    </aside>
  );
}

export function GammaChartOverlay({
  flipY,
  shadingEnabled,
  profileExpanded,
  profileBars,
  profileMetric,
}: {
  readonly flipY: number | null;
  readonly shadingEnabled: boolean;
  readonly profileExpanded: boolean;
  readonly profileBars: readonly PositionedProfileBar[];
  readonly profileMetric: ProfileMetric;
}) {
  const profileLabel =
    profileMetric === "gex"
      ? "GEX CONCENTRATION"
      : profileMetric === "open-interest"
        ? "OPEN INTEREST"
        : "24H VOLUME";
  return (
    <div className="gamma-chart-overlay" aria-hidden="true">
      {shadingEnabled && flipY !== null ? (
        <div className="gamma-regime-layer" data-testid="gamma-regime-shading">
          <span className="positive-gamma-zone" style={{ height: flipY }} />
          <span className="negative-gamma-zone" style={{ top: flipY }} />
          <span className="gamma-flip-divider" style={{ top: flipY }} />
        </div>
      ) : null}
      {profileExpanded ? (
        <div
          className="gamma-profile"
          data-testid="gamma-profile"
          data-profile-metric={profileMetric}
        >
          <span className="gamma-profile-title">{profileLabel}</span>
          <span className="gamma-profile-zero" />
          {profileBars.length === 0 ? (
            <span className="gamma-profile-empty">NO DATA</span>
          ) : null}
          {profileBars.map((bar) => (
            <span
              key={bar.id}
              className={`gamma-profile-bar ${bar.optionType === "call" ? "positive" : "negative"}`}
              data-option-type={bar.optionType}
              title={`${bar.optionType.toUpperCase()} ${priceFormatter.format(bar.strike)}: ${compactBtc.format(bar.value)}`}
              style={
                {
                  top: bar.y,
                  width: `${Math.max(3, profileVisualStrength(bar.strength) * 46)}%`,
                  opacity: 0.4 + profileVisualStrength(bar.strength) * 0.55,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function OptionsSummaryBar({
  summary,
  state,
  workerDurationMs,
  now,
}: {
  readonly summary: OptionsSummaryMetrics | null;
  readonly state: LevelDisplayState;
  readonly workerDurationMs: number | null;
  readonly now: number;
}) {
  const metrics = [
    {
      label: "Total OI",
      value: summary ? `${summary.totalOpenInterestBtc.toFixed(2)} BTC` : "--",
      testId: "total-open-interest",
    },
    {
      label: "Put / Call OI",
      value: summary?.putCallOpenInterestRatio?.toFixed(2) ?? "--",
      testId: "put-call-ratio",
    },
    {
      label: "Average IV",
      value:
        summary?.averageMarkIvDecimal === null || !summary
          ? "--"
          : `${(summary.averageMarkIvDecimal * 100).toFixed(1)}%`,
      testId: "average-iv",
    },
    {
      label: "Modeled GEX / 1%",
      value: summary
        ? `${summary.modeledGexOnePercentUsd >= 0 ? "+" : "-"}$${compactUsd.format(Math.abs(summary.modeledGexOnePercentUsd))}`
        : "--",
      testId: "modeled-gex",
    },
  ];

  return (
    <section
      className="options-summary-bar"
      aria-label="Options summary metrics"
      data-expiry-scope={summary?.metadata.expiryScope ?? "pending"}
    >
      <span className={`summary-state state-${state.toLowerCase()}`}>
        {state}
      </span>
      {metrics.map((metric) => (
        <div key={metric.label}>
          <span>{metric.label}</span>
          <strong data-testid={metric.testId}>{metric.value}</strong>
        </div>
      ))}
      <div>
        <span>DTE</span>
        <strong>
          {summary?.metadata.nearestIncludedDte === null || !summary
            ? "--"
            : summary.metadata.nearestIncludedDte.toFixed(2)}
        </strong>
      </div>
      <div>
        <span>Calc</span>
        <strong>
          {workerDurationMs === null
            ? "--"
            : `${workerDurationMs.toFixed(2)} ms`}
        </strong>
      </div>
      {summary ? (
        <button
          className="summary-audit"
          type="button"
          aria-label="Calculation audit"
        >
          <Info size={15} />
          <AuditTooltip metadata={summary.metadata} state={state} now={now} />
        </button>
      ) : null}
    </section>
  );
}
