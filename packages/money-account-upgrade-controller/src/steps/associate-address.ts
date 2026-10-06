import type { AssociateAddressResponse } from '@metamask/chomp-api-service';
import type { Hex } from '@metamask/utils';
import { hasProperty } from '@metamask/utils';

import { TerminalUpgradeError } from '../errors.js';
import { equalsIgnoreCase } from './delegation-matchers.js';
import type { Step } from './step.js';

/**
 * Reads the CHOMP error code carried by a `ChompApiError`.
 *
 * @param error - The error to inspect.
 * @returns The CHOMP error code, if there is one.
 */
function getChompErrorCode(error: unknown): string | undefined {
  return error instanceof Error &&
    hasProperty(error, 'code') &&
    typeof error.code === 'string'
    ? error.code
    : undefined;
}

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
 * Associates the Money Account address with the user's CHOMP profile using
 * CHOMP's v2 challenge flow.
 *
 * First checks the profile's existing associations via
 * `GET /v1/auth/address`; if the address is already associated the step
 * reports `'already-done'` without signing anything. The lookup is an
 * optimization: if it fails, the step falls through to the submission below,
 * which is authoritative.
 *
 * Otherwise, requests a single-use SIWE challenge, signs its message exactly
 * as returned with the account's key, and submits the signature. CHOMP
 * responds with `status: 'created'` for a new association and
 * `status: 'active'` when the address was already associated with this
 * profile, so the latter also reports `'already-done'`. A challenge that
 * expired or was replaced while signing (`CHALLENGE_INVALID_OR_EXPIRED`) is
 * retried once with a fresh challenge.
 *
 * A 409 usually means the address belongs to a different profile, but CHOMP
 * also returns it when two same-profile requests race on the initial create.
 * The step disambiguates by re-fetching the associations: if the address is
 * now present the race was benign and the step reports `'already-done'`. A
 * confirmed cross-profile conflict is thrown as a {@link TerminalUpgradeError},
 * since no amount of retrying dissociates the address from the other profile;
 * if the disambiguating lookup itself fails, the original (retryable)
 * conflict propagates instead.
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
      // The lookup is an optimization — the submission below is authoritative.
    }

    const submit = async (): Promise<AssociateAddressResponse> => {
      const { challengeId, message } = await messenger.call(
        'ChompApiService:createAddressChallenge',
        { address, purpose: 'ASSOCIATE' },
      );
      const signature = (await messenger.call(
        'KeyringController:signPersonalMessage',
        { data: message, from: address },
      )) as Hex;
      return messenger.call('ChompApiService:associateAddressV2', {
        challengeId,
        signature,
      });
    };

    try {
      let response;
      try {
        response = await submit();
      } catch (error) {
        if (getChompErrorCode(error) !== 'CHALLENGE_INVALID_OR_EXPIRED') {
          throw error;
        }
        response = await submit();
      }
      return response.status === 'active' ? 'already-done' : 'completed';
    } catch (error) {
      if (isConflictError(error)) {
        let associated;
        try {
          associated = await isAssociated();
        } catch {
          // Could not disambiguate — surface the original conflict.
          throw error;
        }
        if (associated) {
          return 'already-done';
        }
        throw new TerminalUpgradeError(
          `Address ${address} is associated with a different CHOMP profile.`,
        );
      }
      throw error;
    }
  },
};
