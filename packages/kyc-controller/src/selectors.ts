import type { KycControllerState } from './KycController.js';
import type { KycVendor } from './types.js';

/**
 * Selects the identity vendor on the current KYC session.
 *
 * @param state - The KycController state.
 * @returns The current vendor, or `null`.
 */
export const selectKycVendor = (state: KycControllerState): KycVendor | null =>
  state.vendor;

/**
 * Selects the latest UKYC session status.
 *
 * @param state - The KycController state.
 * @returns The current session status, or `null`.
 */
export const selectKycSessionStatus = (
  state: KycControllerState,
): KycControllerState['sessionStatus'] => state.sessionStatus;
