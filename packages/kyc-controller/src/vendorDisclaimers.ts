import type { KycDisclaimer, KycVendorDisclaimersAcceptance } from './types.js';

/**
 * Returns whether every fetched vendor disclaimer is covered by acceptance the
 * vendor has already recorded. Acceptance stored on the device but not yet
 * submitted does not count. Extra accepted ids that are no longer in the
 * catalog still count as complete, and an empty catalog is always complete.
 *
 * @param accepted - The vendor's stored acceptance, if any.
 * @param fetched - Current vendor T&C catalog.
 * @returns Whether every fetched disclaimer id is accepted and submitted.
 */
export function areVendorDisclaimersCompleted(
  accepted: KycVendorDisclaimersAcceptance | null,
  fetched: KycDisclaimer[],
): boolean {
  if (fetched.length === 0) {
    return true;
  }
  if (!accepted?.submitted) {
    return false;
  }
  const acceptedIds = new Set(accepted.disclaimerIds);
  return fetched.every((disclaimer) => acceptedIds.has(disclaimer.id));
}
