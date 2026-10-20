/**
 * Versioned classification thresholds for M11.4. These map exact numeric
 * evidence to closed semantic states. They are recorded in every state's
 * `evidence.formulaVersions` so a stored classification can be reproduced.
 * Changing any value requires a new version identifier.
 */
export const MARKET_STATE_CLASSIFICATION_VERSION =
  "market-state-classification-v1" as const;

export const MARKET_STATE_THRESHOLDS_V1 = Object.freeze({
  /** |price - AVWAP| within this many bps is "at". */
  avwapAtBandBps: 5,
  /** Distance to a wall within this many bps is "testing". */
  wallTestingBps: 5,
  /** Distance to a wall within this many bps is "approaching". */
  wallApproachingBps: 25,
  /** |net/total| quote-volume ratio below this is "balanced". */
  flowBalancedRatio: 0.1,
  /** |net/total| quote-volume ratio at or above this is "strong". */
  flowStrongRatio: 0.3,
  /** |top-5 notional imbalance| at or above this is bid/ask heavy. */
  imbalanceHeavy: 0.2,
  /** Spot within this many bps of the Gamma Flip is "transition". */
  gammaTransitionBandBps: 25,
  /** current/baseline ATM IV below this is "contracting". */
  ivContractingRatio: 0.9,
  /** current/baseline ATM IV above this is "expanding". */
  ivExpandingRatio: 1.1,
  /** Next expiry within this many ms is "imminent". */
  expiryImminentMs: 4 * 60 * 60 * 1000,
  /** Next expiry within this many ms is "building". */
  expiryBuildingMs: 24 * 60 * 60 * 1000,
  /** Reward:risk below this is "below-minimum". */
  rewardRiskAcceptable: 1.5,
  /** Reward:risk at or above this is "strong". */
  rewardRiskStrong: 3,
  /** Top-N depth used for the imbalance state. */
  imbalanceDepthN: 5,
});
