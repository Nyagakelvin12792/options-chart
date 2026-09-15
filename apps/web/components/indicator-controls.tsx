"use client";

import {
  BarChart3,
  SeparatorVertical,
  Settings2,
  StepForward,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  DEFAULT_ANCHORED_VWAP_SETTINGS,
  type AnchoredVwapSettings,
} from "@/lib/anchored-vwap-settings";
import {
  DEFAULT_VOLUME_PROFILE_SETTINGS,
  type VolumeProfileSettings,
} from "@/lib/volume-profile-settings";

interface IndicatorControlsProps {
  readonly volumeProfile: VolumeProfileSettings;
  readonly anchoredVwap: AnchoredVwapSettings;
  readonly anchorLabel: string;
  readonly anchorPicking: boolean;
  readonly onVolumeProfileChange: (settings: VolumeProfileSettings) => void;
  readonly onAnchoredVwapChange: (settings: AnchoredVwapSettings) => void;
  readonly onStartAnchorPick: () => void;
}

type IndicatorId = "volume-profile" | "anchored-vwap";
type SettingsTab = "inputs" | "style";

export function IndicatorControls({
  volumeProfile,
  anchoredVwap,
  anchorLabel,
  anchorPicking,
  onVolumeProfileChange,
  onAnchoredVwapChange,
  onStartAnchorPick,
}: IndicatorControlsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [indicator, setIndicator] = useState<IndicatorId>("volume-profile");
  const [tab, setTab] = useState<SettingsTab>("inputs");
  const enabledCount =
    Number(volumeProfile.enabled) + Number(anchoredVwap.enabled);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const updateVp = <Key extends keyof VolumeProfileSettings>(
    key: Key,
    value: VolumeProfileSettings[Key],
  ) => onVolumeProfileChange({ ...volumeProfile, [key]: value });
  const updateAvwap = <Key extends keyof AnchoredVwapSettings>(
    key: Key,
    value: AnchoredVwapSettings[Key],
  ) => onAnchoredVwapChange({ ...anchoredVwap, [key]: value });

  const selectIndicator = (next: IndicatorId) => {
    setIndicator(next);
    setTab("inputs");
  };

  return (
    <div className="indicator-control" ref={rootRef}>
      <button
        type="button"
        className={
          open ? "active indicator-menu-toggle" : "indicator-menu-toggle"
        }
        aria-label="Indicators and settings"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Settings2 size={14} />
        <span>INDICATORS</span>
        {enabledCount > 0 ? <b>{enabledCount}</b> : null}
        <StepForward size={12} />
      </button>

      {open ? (
        <section
          className="indicator-popover"
          role="dialog"
          aria-label="Indicators and settings"
        >
          <header className="indicator-popover-header">
            <div>
              <strong>INDICATORS</strong>
              <span>{enabledCount} ACTIVE</span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (indicator === "volume-profile") {
                  onVolumeProfileChange(DEFAULT_VOLUME_PROFILE_SETTINGS);
                } else {
                  onAnchoredVwapChange(DEFAULT_ANCHORED_VWAP_SETTINGS);
                }
              }}
            >
              RESET
            </button>
          </header>

          <div
            className="indicator-picker"
            role="tablist"
            aria-label="Select indicator"
          >
            <button
              type="button"
              role="tab"
              aria-selected={indicator === "volume-profile"}
              className={indicator === "volume-profile" ? "active" : ""}
              onClick={() => selectIndicator("volume-profile")}
            >
              <BarChart3 size={14} />
              <span>
                <strong>VOLUME PROFILE</strong>
                <small>PRICE DISTRIBUTION</small>
              </span>
              <i className={volumeProfile.enabled ? "on" : ""} />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={indicator === "anchored-vwap"}
              className={indicator === "anchored-vwap" ? "active" : ""}
              onClick={() => selectIndicator("anchored-vwap")}
            >
              <SeparatorVertical size={14} />
              <span>
                <strong>ANCHORED VWAP</strong>
                <small>VOLUME-WEIGHTED BASIS</small>
              </span>
              <i className={anchoredVwap.enabled ? "on" : ""} />
            </button>
          </div>

          <div className="indicator-status-row">
            <span>
              {indicator === "volume-profile"
                ? "VOLUME PROFILE"
                : "ANCHORED VWAP"}
            </span>
            <button
              type="button"
              className={
                (
                  indicator === "volume-profile"
                    ? volumeProfile.enabled
                    : anchoredVwap.enabled
                )
                  ? "indicator-switch on"
                  : "indicator-switch"
              }
              aria-label={
                indicator === "volume-profile"
                  ? "Toggle Volume Profile"
                  : "Toggle Anchored VWAP"
              }
              aria-pressed={
                indicator === "volume-profile"
                  ? volumeProfile.enabled
                  : anchoredVwap.enabled
              }
              onClick={() =>
                indicator === "volume-profile"
                  ? updateVp("enabled", !volumeProfile.enabled)
                  : updateAvwap("enabled", !anchoredVwap.enabled)
              }
            >
              <span />
            </button>
          </div>

          <div className="indicator-settings-tabs" role="tablist">
            {(["inputs", "style"] as const).map((value) => (
              <button
                type="button"
                role="tab"
                key={value}
                aria-selected={tab === value}
                className={tab === value ? "active" : ""}
                onClick={() => setTab(value)}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>

          {indicator === "volume-profile" ? (
            <VolumeProfileSettingsBody
              settings={volumeProfile}
              tab={tab}
              update={updateVp}
            />
          ) : (
            <AnchoredVwapSettingsBody
              settings={anchoredVwap}
              tab={tab}
              anchorLabel={anchorLabel}
              anchorPicking={anchorPicking}
              update={updateAvwap}
              onStartAnchorPick={() => {
                setOpen(false);
                onStartAnchorPick();
              }}
            />
          )}
        </section>
      ) : null}
    </div>
  );
}

function VolumeProfileSettingsBody({
  settings,
  tab,
  update,
}: {
  readonly settings: VolumeProfileSettings;
  readonly tab: SettingsTab;
  readonly update: <Key extends keyof VolumeProfileSettings>(
    key: Key,
    value: VolumeProfileSettings[Key],
  ) => void;
}) {
  return tab === "inputs" ? (
    <div className="indicator-settings-body">
      <Setting label="ROWS">
        <input
          aria-label="Volume Profile rows"
          type="number"
          min={1}
          max={2048}
          value={settings.rowCount}
          onChange={(event) => update("rowCount", Number(event.target.value))}
        />
      </Setting>
      <Setting label="VOLUME">
        <select
          aria-label="Volume Profile volume mode"
          value={settings.directionMode}
          onChange={(event) =>
            update(
              "directionMode",
              event.target.value as VolumeProfileSettings["directionMode"],
            )
          }
        >
          <option value="total">Total</option>
          <option value="candle-direction">Up / Down estimate</option>
        </select>
      </Setting>
      <Setting label="UNIT">
        <select
          aria-label="Volume Profile volume unit"
          value={settings.volumeUnit}
          onChange={(event) =>
            update(
              "volumeUnit",
              event.target.value as VolumeProfileSettings["volumeUnit"],
            )
          }
        >
          <option value="base">BTC</option>
          <option value="quote">USDT</option>
        </select>
      </Setting>
      <RangeSetting
        ariaLabel="Volume Profile value area percent"
        label="VALUE AREA"
        value={settings.valueAreaPercent}
        min={1}
        max={100}
        suffix="%"
        onChange={(value) => update("valueAreaPercent", value)}
      />
    </div>
  ) : (
    <div className="indicator-settings-body">
      <SegmentSetting
        label="PLACEMENT"
        values={["left", "right"]}
        value={settings.placement}
        onChange={(value) =>
          update("placement", value as VolumeProfileSettings["placement"])
        }
      />
      <RangeSetting
        ariaLabel="Volume Profile width percent"
        label="WIDTH"
        value={settings.widthPercent}
        min={5}
        max={50}
        suffix="%"
        onChange={(value) => update("widthPercent", value)}
      />
      <RangeSetting
        ariaLabel="Volume Profile opacity percent"
        label="OPACITY"
        value={settings.opacityPercent}
        min={10}
        max={100}
        step={5}
        suffix="%"
        onChange={(value) => update("opacityPercent", value)}
      />
      <CheckSetting
        label="LEVEL LABELS"
        checked={settings.showLabels}
        onChange={(value) => update("showLabels", value)}
      />
      <CheckSetting
        label="POC"
        checked={settings.showPOC}
        onChange={(value) => update("showPOC", value)}
      />
      <CheckSetting
        label="VAH"
        checked={settings.showVAH}
        onChange={(value) => update("showVAH", value)}
      />
      <CheckSetting
        label="VAL"
        checked={settings.showVAL}
        onChange={(value) => update("showVAL", value)}
      />
      <CheckSetting
        label="VALUE AREA"
        checked={settings.showValueAreaShading}
        onChange={(value) => update("showValueAreaShading", value)}
      />
    </div>
  );
}

function AnchoredVwapSettingsBody({
  settings,
  tab,
  anchorLabel,
  anchorPicking,
  update,
  onStartAnchorPick,
}: {
  readonly settings: AnchoredVwapSettings;
  readonly tab: SettingsTab;
  readonly anchorLabel: string;
  readonly anchorPicking: boolean;
  readonly update: <Key extends keyof AnchoredVwapSettings>(
    key: Key,
    value: AnchoredVwapSettings[Key],
  ) => void;
  readonly onStartAnchorPick: () => void;
}) {
  return tab === "inputs" ? (
    <div className="indicator-settings-body">
      <SegmentSetting
        label="ANCHOR"
        values={["session", "week", "month"]}
        value={settings.anchorMode}
        onChange={(value) =>
          update("anchorMode", value as AnchoredVwapSettings["anchorMode"])
        }
      />
      <div className="indicator-anchor-row">
        <span>
          <b>
            {settings.anchorMode === "manual"
              ? "CUSTOM ANCHOR"
              : "RESOLVED ANCHOR"}
          </b>
          <small>{anchorLabel}</small>
        </span>
        <button
          type="button"
          className={anchorPicking ? "active" : ""}
          onClick={onStartAnchorPick}
        >
          <SeparatorVertical size={13} />
          {anchorPicking ? "CLICK CHART" : "PICK"}
        </button>
      </div>
      <Setting label="SOURCE">
        <select
          aria-label="Anchored VWAP price source"
          value={settings.priceSource}
          onChange={(event) =>
            update(
              "priceSource",
              event.target.value as AnchoredVwapSettings["priceSource"],
            )
          }
        >
          <option value="typical">HLC3</option>
          <option value="close">Close</option>
          <option value="hl2">HL2</option>
          <option value="ohlc4">OHLC4</option>
          <option value="weighted">Weighted close</option>
        </select>
      </Setting>
      {([1, 2, 3] as const).map((band) => {
        const showKey = `showBand${band}` as const;
        const multiplierKey = `band${band}Multiplier` as const;
        return (
          <div className="indicator-band-row" key={band}>
            <label>
              <input
                type="checkbox"
                checked={settings[showKey]}
                onChange={(event) => update(showKey, event.target.checked)}
              />
              <span>BAND {band}</span>
            </label>
            <input
              aria-label={`Anchored VWAP band ${band} multiplier`}
              type="number"
              min={0.1}
              max={10}
              step={0.25}
              value={settings[multiplierKey]}
              onChange={(event) =>
                update(multiplierKey, Number(event.target.value))
              }
            />
            <span>σ</span>
          </div>
        );
      })}
    </div>
  ) : (
    <div className="indicator-settings-body">
      <ColorSetting
        label="AVWAP"
        value={settings.vwapColor}
        onChange={(value) => update("vwapColor", value)}
      />
      <ColorSetting
        label="BANDS"
        value={settings.bandColor}
        onChange={(value) => update("bandColor", value)}
      />
      <RangeSetting
        label="LINE WIDTH"
        value={settings.lineWidth}
        min={1}
        max={4}
        onChange={(value) => update("lineWidth", value)}
      />
      <RangeSetting
        label="FILL"
        value={settings.fillOpacityPercent}
        min={0}
        max={30}
        suffix="%"
        onChange={(value) => update("fillOpacityPercent", value)}
      />
      <CheckSetting
        label="ANCHOR LINE"
        checked={settings.showAnchorLine}
        onChange={(value) => update("showAnchorLine", value)}
      />
      <CheckSetting
        label="PRICE LABEL"
        checked={settings.showLabel}
        onChange={(value) => update("showLabel", value)}
      />
      <CheckSetting
        label="BAND FILL"
        checked={settings.showFill}
        onChange={(value) => update("showFill", value)}
      />
    </div>
  );
}

function Setting({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="indicator-setting">
      <span>{label}</span>
      {children}
    </label>
  );
}

function RangeSetting({
  ariaLabel,
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  readonly ariaLabel?: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly suffix?: string;
  readonly onChange: (value: number) => void;
}) {
  return (
    <div className="indicator-setting">
      <span>{label}</span>
      <label className="indicator-range">
        <input
          aria-label={ariaLabel ?? label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output>
          {value}
          {suffix}
        </output>
      </label>
    </div>
  );
}

function SegmentSetting({
  label,
  values,
  value,
  onChange,
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div className="indicator-setting">
      <span>{label}</span>
      <div className="indicator-segments">
        {values.map((option) => (
          <button
            type="button"
            key={option}
            className={value === option ? "active" : ""}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {option.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

function CheckSetting({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <label className="indicator-setting indicator-check">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}

function ColorSetting({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="indicator-setting">
      <span>{label}</span>
      <span className="indicator-color">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <code>{value.toUpperCase()}</code>
      </span>
    </label>
  );
}
