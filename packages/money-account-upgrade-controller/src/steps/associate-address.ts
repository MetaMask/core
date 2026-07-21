import type { Hex } from '@metamask/utils';
import { hasProperty } from '@metamask/utils';

import { equalsIgnoreCase } from './delegation-matchers.js';
import type { Step } from './step.js';

/**
 * Determines whether an error is a CHOMP conflict (HTTP 409) response.
 *
 * @param error - The error to inspect.
 * @returns `true` when the error carries a 409 HTTP status.
 */
function isConflictError(error: unknown): boolean {
  return (
    error instanceof Error &&
    hasProperty(error, 'httpStatus') &&
    error.httpStatus === 409
  );
}

/**
 * Associates the Money Account address with the user's CHOMP profile.
 *
 * First checks the profile's existing associations via
 * `GET /v1/auth/address`; if the address is already associated the step
 * reports `'already-done'` without signing anything. The lookup is an
 * optimization: if it fails, the step falls through to the POST path below,
 * which is authoritative and matches the behavior before the lookup existed.
 *
 * Otherwise, signs `CHOMP Authentication {timestamp}` (EIP-191) with the
 * account's key and submits the signature to CHOMP, which verifies the
 * timestamp is fresh, recovers the signer, and records the profile–address
 * mapping. CHOMP responds with `status: 'created'` for a new association and
 * `status: 'active'` when the address was already associated with this
 * profile, so the latter also reports `'already-done'`.
 *
 * A 409 usually means the address belongs to a different profile, but CHOMP
 * also returns it when two same-profile requests race on the initial create
 * (the loser's conditional write fails). The step disambiguates by re-fetching
 * the associations: if the address is now present the race was benign and the
 * step reports `'already-done'`; otherwise the conflict propagates.
 */
export const associateAddressStep: Step = {
  name: 'associate-address',
  async run({ messenger, address }) {
    const isAssociated = async (): Promise<boolean> => {
      const entries = await messenger.call(
        'ChompApiService:getAssociatedAddresses',
      );
      return entries.some((entry) => equalsIgnoreCase(entry.address, address));
    };

    try {
      if (await isAssociated()) {
        return 'already-done';
      }
    } catch {
      // The lookup is an optimization — the POST path below is authoritative.
    }

    const timestamp = Date.now();
    const message = `CHOMP Authentication ${timestamp}`;

    const signature = (await messenger.call(
      'KeyringController:signPersonalMessage',
      { data: message, from: address },
    )) as Hex;

    try {
      const response = await messenger.call(
        'ChompApiService:associateAddress',
        { signature, timestamp, address },
      );
      return response.status === 'active' ? 'already-done' : 'completed';
    } catch (error) {
      if (isConflictError(error)) {
        try {
          if (await isAssociated()) {
            return 'already-done';
          }
        } catch {
          // Could not disambiguate — surface the original conflict.
        }
      }
      throw error;
    }
  },
};
