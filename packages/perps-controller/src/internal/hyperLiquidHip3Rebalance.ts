import { HIP3_MARGIN_CONFIG } from '../constants/hyperLiquidConfig.js';

/**
 * The amount placement returns from a Standard account's HIP-3 DEX after an
 * order it funded: everything above `RebalanceDesiredBuffer`, when that excess
 * is above `RebalanceMinThreshold`.
 *
 * @param params - The DEX balance.
 * @param params.postOrderBalance - The DEX's withdrawable balance after the
 * order.
 * @returns The amount to transfer back, or 0 when the excess stays.
 */
export function calculateHip3RebalanceAmount({
  postOrderBalance,
}: {
  postOrderBalance: number;
}): number {
  const excessAmount =
    postOrderBalance - HIP3_MARGIN_CONFIG.RebalanceDesiredBuffer;
  return excessAmount > HIP3_MARGIN_CONFIG.RebalanceMinThreshold
    ? excessAmount
    : 0;
}
