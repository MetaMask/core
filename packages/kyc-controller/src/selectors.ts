import { createSelector } from 'reselect';

import type { KycControllerState } from './KycController';
import type { KycProduct } from './types';

const selectKycRequiredByProduct = (
  state: KycControllerState,
): KycControllerState['kycRequiredByProduct'] => state.kycRequiredByProduct;

/**
 * Selects the current flow phase.
 *
 * @param state - The KycController state.
 * @returns The current phase.
 */
export const selectKycPhase = (
  state: KycControllerState,
): KycControllerState['phase'] => state.phase;

/**
 * Selects the SumSub sub-flow state.
 *
 * @param state - The KycController state.
 * @returns The SumSub state.
 */
export const selectKycSumSub = (
  state: KycControllerState,
): KycControllerState['sumsub'] => state.sumsub;

/**
 * Creates a selector that returns whether KYC is required for a product.
 *
 * @param product - The consuming feature.
 * @returns A selector returning the cached requirement, or `undefined`.
 */
export const selectIsKycRequiredForProduct = (
  product: KycProduct,
): ((state: KycControllerState) => boolean | undefined) =>
  createSelector(
    [selectKycRequiredByProduct],
    (map): boolean | undefined => map[product],
  );
