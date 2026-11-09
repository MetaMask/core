import type {
  KycControllerState,
  KycVendorSessionState,
} from './KycController.js';
import { getKycSessionDecision } from './sessionDecision.js';
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

/**
 * POC: whether a vendor is usable — UKYC approved the identity and the
 * vendor's own account is active. For vendors without a vendor account
 * (Iron), this is just the UKYC approval.
 *
 * @param state - The KycController state.
 * @param vendor - The identity vendor.
 * @returns Whether the vendor is ready to use.
 */
export const selectIsVendorReady = (
  state: KycControllerState,
  vendor: KycVendor,
): boolean => {
  const entry = state.sessions[vendor];
  if (getKycSessionDecision(entry) !== 'approved') {
    return false;
  }
  return entry?.vendorAccount ? entry.vendorAccount.state === 'active' : true;
};
