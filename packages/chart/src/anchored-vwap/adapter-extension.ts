import type { ChartAdapter } from "../chart-adapter";
import type { AnchoredVwapRenderInput } from "./types";

export interface AnchoredVwapCapableChartAdapter {
  setAnchoredVwap(id: string, renderInput: AnchoredVwapRenderInput): void;
  removeAnchoredVwap(id: string): void;
  clearAnchoredVwaps?(): void;
}

export function isAnchoredVwapCapable(
  adapter: ChartAdapter,
): adapter is ChartAdapter & AnchoredVwapCapableChartAdapter {
  return (
    typeof (adapter as unknown as AnchoredVwapCapableChartAdapter)
      .setAnchoredVwap === "function" &&
    typeof (adapter as unknown as AnchoredVwapCapableChartAdapter)
      .removeAnchoredVwap === "function"
  );
}
