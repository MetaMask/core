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
 * reports `'already-done'` without signing anything.
 *
 * Otherwise, we request a single-use challenge from the chomp API,
 * we then sign the message as returned, with the accounts key and submit
 * the signature. CHOMP responds with `status: 'created'` for a new association
 * and `status: 'active'` when the address was already associated with this
 * profile. If we get 'active' we report `'already-done'`. A challenge that
 * expired or was replaced while signing (`CHALLENGE_INVALID_OR_EXPIRED`) is
 * retried once with a fresh challenge.
 *
 * A 409 usually means the address belongs to a different profile, but CHOMP
 * also returns it when two same-profile requests race on the initial create.
 * We check this by re-fetching the associations: if the address is
 * now present the step reports `'already-done'`.
 *
 * A real cross-profile conflict is thrown as a {@link TerminalUpgradeError},
 * since no amount of retrying will fix the problem.
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
      // If the lookup fails, we continue with the association step, because
      // the steps are idempotent anyway.
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
