"use client";

import {
  convergeDecision,
  parseShadowProviderRunRecord,
  type DecisionAssessmentV1,
  type DecisionChoice,
  type DecisionContextV1,
  type MarketStateV1,
  type ShadowProviderRunRecordV1,
} from "@options-chart/decision-engine";
import {
  BrainCircuit,
  ChevronDown,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

interface DecisionDockProps {
  readonly state: MarketStateV1 | null;
  readonly context: DecisionContextV1 | null;
  readonly baseline: DecisionAssessmentV1 | null;
  readonly buildError: string | null;
  readonly nowMs: number;
}

type JevPhase = "idle" | "running" | "success" | "error";

const choiceLabel = (choice: DecisionChoice | null): string =>
  choice === null
    ? "WAITING FOR DATA"
    : choice.replaceAll("-", " ").toUpperCase();

const decisionTone = (choice: DecisionChoice | null): string => {
  if (choice?.includes("long")) return "long";
  if (choice?.includes("short")) return "short";
  if (choice === "no-trade") return "blocked";
  return "neutral";
};

const formatPrice = (price: number | null | undefined): string =>
  price == null
    ? "Not available"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(price);

const primaryTrigger = (
  choice: DecisionChoice | null,
  state: MarketStateV1 | null,
): string => {
  if (!choice || !state) return "Waiting for validated market state.";
  if (choice === "insufficient-data")
    return "Wait for fresh H4, H1, and candle evidence.";
  if (choice === "no-trade")
    return "No valid setup. Keep risk off until conditions improve.";
  const long = choice.endsWith("long");
  const level = long
    ? state.location.strongestSupport?.price
    : state.location.strongestResistance?.price;
  const action = choice.startsWith("confirm")
    ? "Confirmation present near"
    : "Watch for a retest and rejection near";
  return `${action} ${formatPrice(level)}.`;
};

const invalidationText = (state: MarketStateV1 | null): string => {
  if (!state) return "Not available";
  const side = state.tradeQuality.proposedSide;
  const evidence = state.evidence.numericEvidence.find(
    ({ name }) => name === "trade.stopPrice",
  );
  const fallback =
    side === "long"
      ? state.marketStructure.h1.invalidationPrice
      : side === "short"
        ? state.marketStructure.h1.invalidationPrice
        : null;
  const level = evidence?.value ?? fallback;
  return level == null
    ? "No active trade geometry"
    : `${side === "short" ? "Above" : "Below"} ${formatPrice(level)}`;
};

const ageLabel = (nowMs: number, effectiveAtMs: number | null): string => {
  if (effectiveAtMs === null) return "--";
  const seconds = Math.max(0, Math.floor((nowMs - effectiveAtMs) / 1_000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m`;
};

function readError(payload: unknown, status: number): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error.replaceAll("_", " ");
  }
  return `Jev request failed (${status})`;
}

export function DecisionDock({
  state,
  context,
  baseline,
  buildError,
  nowMs,
}: DecisionDockProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [jevPhase, setJevPhase] = useState<JevPhase>("idle");
  const [jevRun, setJevRun] = useState<ShadowProviderRunRecordV1 | null>(null);
  const [jevReused, setJevReused] = useState(false);
  const [jevError, setJevError] = useState<string | null>(null);
  const [jevContextId, setJevContextId] = useState<string | null>(null);
  const jevIsCurrent = jevContextId === context?.contextId;
  const currentJevRun = jevIsCurrent ? jevRun : null;
  const currentJevPhase: JevPhase = jevIsCurrent ? jevPhase : "idle";
  const currentJevError = jevIsCurrent ? jevError : null;

  const converged = useMemo(() => {
    if (!context || !currentJevRun?.assessment) return null;
    return convergeDecision(context, currentJevRun.assessment, {
      currentEffectiveAtMs: Math.max(nowMs, currentJevRun.completedAtMs),
      maxAssessmentAgeMs: 5 * 60_000,
    });
  }, [context, currentJevRun, nowMs]);
  const displayChoice = converged?.choice ?? baseline?.choice ?? null;
  const disagreement =
    currentJevRun?.assessment != null &&
    currentJevRun.assessment.choice !== baseline?.choice;

  const requestJev = async () => {
    if (!context || jevPhase === "running") return;
    setJevContextId(context.contextId);
    setJevPhase("running");
    setJevError(null);
    try {
      const response = await fetch("/api/intelligence/jev", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(payload, response.status));
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("record" in payload)
      ) {
        throw new Error("Jev returned an invalid response envelope");
      }
      const record = parseShadowProviderRunRecord(payload.record);
      if (record.contextId !== context.contextId) {
        throw new Error("Jev response belongs to an older market state");
      }
      setJevRun(record);
      setJevReused("reused" in payload && payload.reused === true);
      setJevPhase("success");
    } catch (error) {
      setJevRun(null);
      setJevPhase("error");
      setJevError(
        error instanceof Error ? error.message : "Jev request failed",
      );
    }
  };

  return (
    <section className="decision-dock" aria-label="AI assisted decision dock">
      <header className="decision-dock-header">
        <div>
          <BrainCircuit size={15} aria-hidden="true" />
          <strong>Decision Dock</strong>
        </div>
        <span className="decision-shadow-badge">SHADOW</span>
      </header>

      <div className={`decision-primary tone-${decisionTone(displayChoice)}`}>
        <span>Current posture</span>
        <strong>{choiceLabel(displayChoice)}</strong>
        <p>{primaryTrigger(displayChoice, state)}</p>
      </div>

      <dl className="decision-essentials">
        <div>
          <dt>Invalidation</dt>
          <dd>{invalidationText(state)}</dd>
        </div>
        <div>
          <dt>Structure</dt>
          <dd>
            {context?.marketStructure.agreement.replaceAll("-", " ") ??
              "unavailable"}
          </dd>
        </div>
        <div>
          <dt>Options</dt>
          <dd>{context?.optionsRegime.gamma ?? "unavailable"} gamma</dd>
        </div>
        <div>
          <dt>Risk</dt>
          <dd>{context?.accountRisk.state ?? "unavailable"}</dd>
        </div>
      </dl>

      <div className="decision-opinions">
        <div>
          <span>Rules</span>
          <strong>{choiceLabel(baseline?.choice ?? null)}</strong>
        </div>
        <div>
          <span>Jev · shadow</span>
          <strong>
            {currentJevPhase === "running"
              ? "ANALYZING"
              : currentJevPhase === "error"
                ? "UNAVAILABLE"
                : currentJevRun?.assessment
                  ? choiceLabel(currentJevRun.assessment.choice)
                  : "NOT REQUESTED"}
          </strong>
        </div>
      </div>

      {disagreement ? (
        <p className="decision-warning" role="status">
          Jev disagrees. Safety convergence kept the result at{" "}
          {choiceLabel(displayChoice)}.
        </p>
      ) : null}
      {buildError ? <p className="decision-error">{buildError}</p> : null}
      {currentJevError ? (
        <p className="decision-error">{currentJevError}</p>
      ) : null}

      <div className="decision-actions">
        <button
          type="button"
          className="decision-jev-button"
          disabled={!context || jevPhase === "running"}
          onClick={() => void requestJev()}
        >
          <RefreshCw size={13} aria-hidden="true" />
          {currentJevPhase === "running"
            ? "Checking…"
            : currentJevRun
              ? "Refresh Jev"
              : "Check Jev"}
        </button>
        <button
          type="button"
          className="decision-details-button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          Details
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      </div>

      <div className="decision-freshness">
        <ShieldCheck size={12} aria-hidden="true" />
        Deterministic primary · age{" "}
        {ageLabel(nowMs, context?.effectiveAtMs ?? null)}
        {jevIsCurrent && jevReused ? " · Jev cache reused" : ""}
      </div>

      {detailsOpen ? (
        <div className="decision-details">
          <dl>
            <div>
              <dt>Observed</dt>
              <dd>Binance candles · Deribit options</dd>
            </div>
            <div>
              <dt>Derived</dt>
              <dd>Structure, zones, AVWAP, volume profile</dd>
            </div>
            <div>
              <dt>Rules</dt>
              <dd>{baseline?.summary ?? "Waiting for a valid context"}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{currentJevRun?.assessment?.summary ?? "Not requested"}</dd>
            </div>
            <div>
              <dt>Calibration</dt>
              <dd>Pending held-out shadow sample</dd>
            </div>
          </dl>
          {context?.warnings.length ? (
            <p>Warnings: {context.warnings.join(", ")}</p>
          ) : null}
          {currentJevRun ? <code>{currentJevRun.runId}</code> : null}
        </div>
      ) : null}
    </section>
  );
}
