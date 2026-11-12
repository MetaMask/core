import type {
  KycControllerState,
  KycVendorSessionState,
} from './KycController.js';
import type { KycSessionStatus, KycVendor } from './types.js';

/**
 * Selects a vendor's session entry.
 *
 * @param state - The KycController state.
 * @param vendor - The identity vendor.
 * @returns The vendor's entry, or `undefined` when none exists.
 */
export const selectKycSession = (
  state: KycControllerState,
  vendor: KycVendor,
): KycVendorSessionState | undefined => state.sessions[vendor];

/**
 * Selects a vendor's latest UKYC session status.
 *
 * @param state - The KycController state.
 * @param vendor - The identity vendor.
 * @returns The vendor's session status, or `null`.
 */
export const selectKycSessionStatus = (
  state: KycControllerState,
  vendor: KycVendor,
): KycSessionStatus | null => state.sessions[vendor]?.sessionStatus ?? null;
