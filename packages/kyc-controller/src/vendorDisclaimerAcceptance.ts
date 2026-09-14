import type { KycVendor, KycVendorDisclaimersAccepted } from './types.js';

/**
 * Returns whether persisted vendor disclaimer acceptance exists for `vendor`.
 *
 * @param accepted - Vendor-disclaimer acceptance map.
 * @param vendor - Identity vendor to inspect.
 * @returns Whether acceptance is present for the vendor.
 */
export function hasVendorDisclaimerAcceptance(
  accepted: KycVendorDisclaimersAccepted,
  vendor: KycVendor,
): boolean {
  if (vendor === 'moonpay') {
    return Boolean(accepted.moonpay?.termsAcceptedAt);
  }
  if (vendor === 'iron') {
    return Boolean(accepted.iron?.disclaimerIds.length);
  }
  return false;
}

/**
 * Returns persisted Iron disclaimer ids, if any.
 *
 * @param accepted - Vendor-disclaimer acceptance map.
 * @returns The accepted disclaimer ids, or an empty array.
 */
export function ironDisclaimerIds(
  accepted: KycVendorDisclaimersAccepted,
): string[] {
  return accepted.iron?.disclaimerIds ?? [];
}

/**
 * Records vendor disclaimer acceptance for the active vendor.
 *
 * @param accepted - Existing vendor-disclaimer acceptance map.
 * @param vendor - Identity vendor being accepted.
 * @param params - Acceptance payload for the vendor.
 * @param params.termsAcceptedAt - MoonPay acceptance timestamp.
 * @param params.disclaimerIds - Iron disclaimer ids.
 * @returns The updated acceptance map.
 */
export function recordVendorDisclaimerAcceptance(
  accepted: KycVendorDisclaimersAccepted,
  vendor: KycVendor,
  params: { termsAcceptedAt: string; disclaimerIds: string[] },
): KycVendorDisclaimersAccepted {
  if (vendor === 'moonpay') {
    return {
      ...accepted,
      moonpay: { termsAcceptedAt: params.termsAcceptedAt },
    };
  }
  if (vendor === 'iron') {
    return {
      ...accepted,
      iron: { disclaimerIds: params.disclaimerIds },
    };
  }
  return accepted;
}

/**
 * Clears persisted vendor disclaimer acceptance for one vendor.
 *
 * @param accepted - Existing vendor-disclaimer acceptance map.
 * @param vendor - Identity vendor whose acceptance should be cleared.
 * @returns The updated acceptance map.
 */
export function clearVendorDisclaimerAcceptance(
  accepted: KycVendorDisclaimersAccepted,
  vendor: KycVendor,
): KycVendorDisclaimersAccepted {
  if (vendor === 'moonpay') {
    return { ...accepted, moonpay: null };
  }
  if (vendor === 'iron') {
    return { ...accepted, iron: null };
  }
  return accepted;
}
