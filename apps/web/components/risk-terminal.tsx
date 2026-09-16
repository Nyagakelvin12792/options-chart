"use client";

import type { ChartDrawing } from "@options-chart/chart";
import { Settings2 } from "lucide-react";
import { useMemo, useState } from "react";

import {
  calculatePositionRisk,
  type PositionRiskResult,
  type PositionSide,
} from "@/lib/risk-calculator";

interface RiskTerminalProps {
  readonly drawings: readonly ChartDrawing[];
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const wholeCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const btcFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const decimalFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const numberFromInput = (value: string): number =>
  value.trim() === "" ? Number.NaN : Number(value);

const toInputValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

const resultMessage = (result: PositionRiskResult): string => {
  switch (result.reason) {
    case "ok":
      return "Ready";
    case "invalid-account":
      return "Check account rules";
    case "invalid-risk":
      return "Check risk amount";
    case "invalid-entry":
      return "Check entry";
    case "invalid-stop":
      return "Check stop";
    case "stop-must-be-below-entry":
      return "Stop must be below entry";
    case "stop-must-be-above-entry":
      return "Stop must be above entry";
    case "target-must-be-above-entry":
      return "Target must be above entry";
    case "target-must-be-below-entry":
      return "Target must be below entry";
  }
};

function NumericField({
  label,
  value,
  onChange,
  suffix,
  readOnly = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly suffix?: string;
  readonly readOnly?: boolean;
}) {
  return (
    <label className="risk-field">
      <span>{label}</span>
      <span className="risk-input-wrap">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? <small>{suffix}</small> : null}
      </span>
    </label>
  );
}

function BudgetRow({
  label,
  share,
  tone,
}: {
  readonly label: string;
  readonly share: number | null;
  readonly tone: "loss" | "drawdown" | "target";
}) {
  const percent = Math.max(0, Math.min(100, (share ?? 0) * 100));
  return (
    <div className="risk-budget-row">
      <span>{label}</span>
      <div className="risk-budget-track" aria-hidden="true">
        <span
          className={`risk-budget-fill risk-budget-${tone}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <strong>
        {share === null ? "--" : `${percentFormatter.format(percent)}%`}
      </strong>
    </div>
  );
}

export function RiskTerminal({ drawings }: RiskTerminalProps) {
  const [positionSide, setPositionSide] = useState<PositionSide>("long");
  const [balanceUsd, setBalanceUsd] = useState("10000");
  const [dailyLossLimitUsd, setDailyLossLimitUsd] = useState("300");
  const [maxDrawdownUsd, setMaxDrawdownUsd] = useState("500");
  const [profitTargetUsd, setProfitTargetUsd] = useState("1200");
  const [leverage, setLeverage] = useState("10");
  const [riskPercent, setRiskPercent] = useState("0.5");
  const [entryPriceUsd, setEntryPriceUsd] = useState("68296.8");
  const [stopLossPriceUsd, setStopLossPriceUsd] = useState("67800");
  const [takeProfitPriceUsd, setTakeProfitPriceUsd] = useState("69300");
  const latestPosition = useMemo(
    () =>
      drawings
        .filter(
          (drawing): drawing is Extract<ChartDrawing, { type: "position" }> =>
            drawing.type === "position",
        )
        .sort((left, right) => right.createdAt - left.createdAt)[0],
    [drawings],
  );
  const effectiveSide = latestPosition?.direction ?? positionSide;
  const effectiveEntry = latestPosition
    ? toInputValue(latestPosition.entry)
    : entryPriceUsd;
  const effectiveStop = latestPosition
    ? toInputValue(latestPosition.stopLoss)
    : stopLossPriceUsd;
  const effectiveTarget = latestPosition
    ? toInputValue(latestPosition.takeProfit)
    : takeProfitPriceUsd;

  const riskResult = useMemo(
    () =>
      calculatePositionRisk({
        side: effectiveSide,
        balanceUsd: numberFromInput(balanceUsd),
        dailyLossLimitUsd: numberFromInput(dailyLossLimitUsd),
        maxDrawdownUsd: numberFromInput(maxDrawdownUsd),
        profitTargetUsd: numberFromInput(profitTargetUsd),
        leverage: numberFromInput(leverage),
        riskPercent: numberFromInput(riskPercent),
        entryPriceUsd: numberFromInput(effectiveEntry),
        stopLossPriceUsd: numberFromInput(effectiveStop),
        takeProfitPriceUsd:
          effectiveTarget.trim() === ""
            ? null
            : numberFromInput(effectiveTarget),
      }),
    [
      balanceUsd,
      dailyLossLimitUsd,
      effectiveEntry,
      effectiveSide,
      effectiveStop,
      effectiveTarget,
      leverage,
      maxDrawdownUsd,
      profitTargetUsd,
      riskPercent,
    ],
  );

  const selectPositionSide = (nextSide: PositionSide) => {
    if (nextSide === positionSide) return;
    setPositionSide(nextSide);
  };

  return (
    <aside className="risk-terminal" aria-label="Risk terminal">
      <header className="risk-terminal-header">
        <div>
          <span className="risk-live-dot" aria-hidden="true" />
          <strong>Risk Terminal</strong>
        </div>
        <span>position sizing / risk budget</span>
      </header>

      <section className="risk-panel">
        <h2>Account Rules</h2>
        <div className="risk-field-grid">
          <NumericField
            label="Balance"
            value={balanceUsd}
            onChange={setBalanceUsd}
            suffix="$"
          />
          <NumericField
            label="Daily loss"
            value={dailyLossLimitUsd}
            onChange={setDailyLossLimitUsd}
            suffix="$"
          />
          <NumericField
            label="Max drawdown"
            value={maxDrawdownUsd}
            onChange={setMaxDrawdownUsd}
            suffix="$"
          />
          <NumericField
            label="Profit target"
            value={profitTargetUsd}
            onChange={setProfitTargetUsd}
            suffix="$"
          />
          <NumericField
            label="Leverage"
            value={leverage}
            onChange={setLeverage}
            suffix="x"
          />
        </div>
      </section>

      <section className="risk-panel">
        <div className="risk-section-heading">
          <h2>Position Sizer</h2>
          <div
            className="risk-mode risk-preset-row"
            role="group"
            aria-label="Position side"
          >
            {(["long", "short"] as const).map((side) => (
              <button
                key={side}
                type="button"
                className={effectiveSide === side ? "active" : ""}
                aria-pressed={effectiveSide === side}
                onClick={() => selectPositionSide(side)}
              >
                {side}
              </button>
            ))}
          </div>
        </div>

        <NumericField
          label="Risk per trade"
          value={riskPercent}
          onChange={setRiskPercent}
          suffix="%"
        />
        <div className="risk-preset-row" aria-label="Risk presets">
          {[0.25, 0.5, 1].map((preset) => (
            <button
              key={preset}
              type="button"
              className={riskPercent === String(preset) ? "active" : ""}
              onClick={() => setRiskPercent(String(preset))}
            >
              {preset}%
            </button>
          ))}
        </div>

        <div className="risk-field-grid risk-trade-grid">
          <NumericField
            label="Entry"
            value={effectiveEntry}
            onChange={setEntryPriceUsd}
            suffix="$"
            readOnly={Boolean(latestPosition)}
          />
          <NumericField
            label="Stop-loss"
            value={effectiveStop}
            onChange={setStopLossPriceUsd}
            suffix="$"
            readOnly={Boolean(latestPosition)}
          />
          <NumericField
            label="Take-profit"
            value={effectiveTarget}
            onChange={setTakeProfitPriceUsd}
            suffix="$"
            readOnly={Boolean(latestPosition)}
          />
        </div>

        <p
          className={`risk-detection-state state-${latestPosition ? "detected" : "idle"}`}
          aria-live="polite"
        >
          {latestPosition
            ? `${effectiveSide === "long" ? "Long" : "Short"} chart position synced`
            : resultMessage(riskResult)}
        </p>

        <dl className="risk-result-list">
          <div>
            <dt>$ at risk</dt>
            <dd className="risk-loss">
              {currencyFormatter.format(riskResult.riskAmountUsd)}
            </dd>
          </div>
          <div>
            <dt>Position size</dt>
            <dd className="risk-size">
              {btcFormatter.format(riskResult.positionSizeBtc)} BTC
            </dd>
          </div>
          <div>
            <dt>Size limited by</dt>
            <dd>{riskResult.sizingConstraint.replace("-", " ")}</dd>
          </div>
          <div>
            <dt>Notional value</dt>
            <dd>{currencyFormatter.format(riskResult.notionalValueUsd)}</dd>
          </div>
          <div>
            <dt>Margin required</dt>
            <dd>{currencyFormatter.format(riskResult.marginRequiredUsd)}</dd>
          </div>
          <div>
            <dt>Reward:risk</dt>
            <dd className={riskResult.valid ? "risk-reward" : "risk-loss"}>
              {riskResult.rewardRiskRatio === null ||
              riskResult.rewardUsd === null
                ? "--"
                : `1 : ${decimalFormatter.format(riskResult.rewardRiskRatio)} (${currencyFormatter.format(riskResult.rewardUsd)})`}
            </dd>
          </div>
          <div>
            <dt>Trades left today</dt>
            <dd>{riskResult.tradesLeftToday ?? "--"}</dd>
          </div>
        </dl>
      </section>

      <section className="risk-panel risk-budget-panel">
        <div className="risk-section-heading">
          <h2>Risk Budget</h2>
          <Settings2 size={15} aria-hidden="true" />
        </div>
        <BudgetRow
          label="Daily loss"
          share={riskResult.dailyLossShare}
          tone="loss"
        />
        <BudgetRow
          label="Max drawdown"
          share={riskResult.maxDrawdownShare}
          tone="drawdown"
        />
        <BudgetRow
          label="Profit target"
          share={riskResult.profitTargetShare}
          tone="target"
        />
        <div className="risk-balance-line">
          <span>Balance</span>
          <strong>
            {wholeCurrencyFormatter.format(numberFromInput(balanceUsd))}
          </strong>
        </div>
      </section>
    </aside>
  );
}
