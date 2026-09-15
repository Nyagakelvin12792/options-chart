import type { OptionSnapshot } from "@options-chart/domain";

import { calculateDaysToExpiry } from "../expiry/dte";
import {
  filterOptionsByExpiryScope,
  listActiveOptionExpiries,
} from "../expiry/filters";
import {
  calculateCallPutOpenInterestWeightedMarkIv,
  calculateOpenInterestWeightedMarkIv,
  type CallPutOpenInterestWeightedMarkIvResult,
  type OpenInterestWeightedMarkIvResult,
} from "./average-iv";
import {
  calculateNearForwardAtmIv,
  type NearForwardAtmIvResult,
} from "./atm-iv";

export interface IvTermStructurePoint {
  readonly expiry: number;
  readonly daysToExpiry: number;
  readonly openInterestWeightedMarkIv: OpenInterestWeightedMarkIvResult;
  readonly callPutOpenInterestWeightedMarkIv: CallPutOpenInterestWeightedMarkIvResult;
  readonly nearForwardAtmIv: NearForwardAtmIvResult;
}

export const calculateIvTermStructure = (
  contracts: readonly OptionSnapshot[],
  calculationTimestamp: number,
): readonly IvTermStructurePoint[] => {
  const activeContracts = filterOptionsByExpiryScope(
    contracts,
    { kind: "all" },
    calculationTimestamp,
  );

  return listActiveOptionExpiries(activeContracts, calculationTimestamp).map(
    (expiry) => {
      const expiryContracts = activeContracts.filter(
        ({ instrument }) => instrument.expiry === expiry,
      );
      return {
        expiry,
        daysToExpiry: calculateDaysToExpiry(expiry, calculationTimestamp),
        openInterestWeightedMarkIv:
          calculateOpenInterestWeightedMarkIv(expiryContracts),
        callPutOpenInterestWeightedMarkIv:
          calculateCallPutOpenInterestWeightedMarkIv(expiryContracts),
        nearForwardAtmIv: calculateNearForwardAtmIv(expiryContracts, expiry),
      };
    },
  );
};
