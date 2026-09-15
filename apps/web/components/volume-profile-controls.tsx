"use client";

import { BarChart3, Settings2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_VOLUME_PROFILE_SETTINGS,
  type VolumeProfileSettings,
} from "@/lib/volume-profile-settings";

interface VolumeProfileControlsProps {
  readonly settings: VolumeProfileSettings;
  readonly onChange: (settings: VolumeProfileSettings) => void;
}

export function VolumeProfileControls({
  settings,
  onChange,
}: VolumeProfileControlsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"inputs" | "style">("inputs");

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

  const update = <Key extends keyof VolumeProfileSettings>(
    key: Key,
    value: VolumeProfileSettings[Key],
  ) => onChange({ ...settings, [key]: value });

  return (
    <div className="volume-profile-control" ref={rootRef}>
      <button
        type="button"
        className={
          settings.enabled
            ? "active volume-profile-toggle"
            : "volume-profile-toggle"
        }
        aria-label="Toggle Volume Profile"
        title="Toggle Volume Profile"
        aria-pressed={settings.enabled}
        onClick={() => update("enabled", !settings.enabled)}
      >
        <BarChart3 size={14} />
        VP
      </button>
      <button
        type="button"
        className="volume-profile-settings-toggle"
        aria-label="Volume Profile settings"
        title="Volume Profile settings"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Settings2 size={14} />
      </button>

      {open ? (
        <section
          className="volume-profile-settings"
          role="dialog"
          aria-label="Volume Profile settings"
        >
          <header>
            <strong>VOLUME PROFILE</strong>
            <button
              type="button"
              onClick={() => onChange(DEFAULT_VOLUME_PROFILE_SETTINGS)}
            >
              RESET
            </button>
          </header>
          <div className="volume-profile-settings-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "inputs"}
              className={tab === "inputs" ? "active" : ""}
              onClick={() => setTab("inputs")}
            >
              INPUTS
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "style"}
              className={tab === "style" ? "active" : ""}
              onClick={() => setTab("style")}
            >
              STYLE
            </button>
          </div>

          {tab === "inputs" ? (
            <div className="volume-profile-settings-body">
              <label>
                <span>ROWS</span>
                <input
                  aria-label="Volume Profile rows"
                  type="number"
                  min={1}
                  max={2048}
                  step={1}
                  value={settings.rowCount}
                  onChange={(event) =>
                    update("rowCount", Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>VOLUME</span>
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
              </label>
              <label>
                <span>UNIT</span>
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
              </label>
              <label>
                <span>VALUE AREA</span>
                <span className="setting-range">
                  <input
                    aria-label="Volume Profile value area percent"
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={settings.valueAreaPercent}
                    onChange={(event) =>
                      update("valueAreaPercent", Number(event.target.value))
                    }
                  />
                  <output>{settings.valueAreaPercent}%</output>
                </span>
              </label>
            </div>
          ) : (
            <div className="volume-profile-settings-body">
              <div className="setting-row">
                <span>PLACEMENT</span>
                <div className="setting-segments">
                  {(["left", "right"] as const).map((placement) => (
                    <button
                      type="button"
                      key={placement}
                      className={
                        settings.placement === placement ? "active" : ""
                      }
                      aria-pressed={settings.placement === placement}
                      onClick={() => update("placement", placement)}
                    >
                      {placement.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <label>
                <span>WIDTH</span>
                <span className="setting-range">
                  <input
                    aria-label="Volume Profile width percent"
                    type="range"
                    min={5}
                    max={50}
                    step={1}
                    value={settings.widthPercent}
                    onChange={(event) =>
                      update("widthPercent", Number(event.target.value))
                    }
                  />
                  <output>{settings.widthPercent}%</output>
                </span>
              </label>
              <label>
                <span>OPACITY</span>
                <span className="setting-range">
                  <input
                    aria-label="Volume Profile opacity percent"
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={settings.opacityPercent}
                    onChange={(event) =>
                      update("opacityPercent", Number(event.target.value))
                    }
                  />
                  <output>{settings.opacityPercent}%</output>
                </span>
              </label>
              {(
                [
                  ["showLabels", "LEVEL LABELS"],
                  ["showPOC", "POC"],
                  ["showVAH", "VAH"],
                  ["showVAL", "VAL"],
                  ["showValueAreaShading", "VALUE AREA"],
                ] as const
              ).map(([key, label]) => (
                <label className="setting-check" key={key}>
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(event) => update(key, event.target.checked)}
                  />
                </label>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
