import type { ChartAdapter } from "../chart-adapter";
import type { VolumeProfileRenderInput } from "./types";

export interface VolumeProfileCapableChartAdapter {
  setVolumeProfile(id: string, renderInput: VolumeProfileRenderInput): void;
  removeVolumeProfile(id: string): void;
}

export function isVolumeProfileCapable(
  adapter: ChartAdapter,
): adapter is ChartAdapter & VolumeProfileCapableChartAdapter {
  return (
    typeof (adapter as unknown as VolumeProfileCapableChartAdapter)
      .setVolumeProfile === "function" &&
    typeof (adapter as unknown as VolumeProfileCapableChartAdapter)
      .removeVolumeProfile === "function"
  );
}
