import type {
  AssociateAddressResponse,
  CreateAddressChallengeParams,
} from '@metamask/chomp-api-service';
import type { Hex } from '@metamask/utils';
import { hasProperty } from '@metamask/utils';

import { TerminalUpgradeError } from '../errors.js';
import { equalsIgnoreCase } from './delegation-matchers.js';
import type { Step, StepContext } from './step.js';

/**
 * CHOMP error codes for link validation failures that will not resolve on
 * their own. `PREDECESSOR_HAS_OPEN_WITHDRAWALS` is deliberately absent: it
 * clears once the withdrawal settles.
 */
const TERMINAL_LINK_ERROR_CODES = new Set([
  'PREDECESSOR_NOT_ASSOCIATED',
  'PREDECESSOR_NOT_MONEY_ACCOUNT',
  'PREDECESSOR_ALREADY_LINKED',
  'SUCCESSOR_ALREADY_LINKED',
  'SUCCESSOR_ALREADY_MONEY_ACCOUNT',
  'LINK_CYCLE',
]);

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
 * Determines whether an error is a CHOMP conflict (HTTP 409) response
 * without an error code, which CHOMP returns when the address belongs to a
 * different profile.
 *
 * @param error - The error to inspect.
 * @returns `true` when the error carries a 409 HTTP status and no code.
 */
function isUncodedConflictError(error: unknown): boolean {
  return (
    error instanceof Error &&
    hasProperty(error, 'httpStatus') &&
    error.httpStatus === 409 &&
    getChompErrorCode(error) === undefined
  );
}

/**
 * What the step needs to associate an address in one of its two modes.
 */
type Association = {
  challengeParams: CreateAddressChallengeParams;
  /**
   * Checks CHOMP for whether the association is already in place. Throws a
   * {@link TerminalUpgradeError} when it can never be put in place.
   */
  isDone: () => Promise<boolean>;
  /**
   * Maps a submission error to the error the step should throw.
   */
  mapSubmitError: (error: unknown) => unknown;
};

/**
 * Builds a plain association of the account address with the profile.
 *
 * @param context - The step context.
 * @param context.messenger - The controller messenger.
 * @param context.address - The account address.
 * @returns The association.
 */
function plainAssociation({ messenger, address }: StepContext): Association {
  return {
    challengeParams: { address, purpose: 'ASSOCIATE' },
    isDone: async () => {
      const entries = await messenger.call(
        'ChompApiService:getAssociatedAddresses',
      );
      return entries.some((entry) => equalsIgnoreCase(entry.address, address));
    },
    mapSubmitError: (error) => error,
  };
}

/**
 * Builds an association that also links the account address to its
 * predecessor as the next address in the Money Account identity chain.
 *
 * @param context - The step context.
 * @param context.messenger - The controller messenger.
 * @param context.address - The account address.
 * @param predecessorAddress - The current address of the Money Account the
 * account address succeeds.
 * @returns The association.
 */
function successorAssociation(
  { messenger, address }: StepContext,
  predecessorAddress: Hex,
): Association {
  return {
    challengeParams: {
      address,
      purpose: 'ASSOCIATE_SUCCESSOR',
      predecessorAddress,
    },
    isDone: async () => {
      const result = await messenger.call(
        'ChompApiService:getDerivedIdentityByAddress',
        address,
      );
      if (!result) {
        return false;
      }
      const { role, predecessor } = result.address;
      const isLinked =
        predecessor !== null &&
        equalsIgnoreCase(predecessor, predecessorAddress);
      // CHOMP only reports `predecessor` while the link is active, so a
      // completed migration is recognised from the identity's history.
      const hasMigrated =
        role === 'CURRENT' &&
        result.identity.previousAddresses.some((previous) =>
          equalsIgnoreCase(previous, predecessorAddress),
        );
      if (isLinked || hasMigrated) {
        return true;
      }
      throw new TerminalUpgradeError(
        `Address ${address} is already part of a Money Account and cannot be linked as the successor of ${predecessorAddress}.`,
      );
    },
    mapSubmitError: (error) => {
      const code = getChompErrorCode(error);
      if (code !== undefined && TERMINAL_LINK_ERROR_CODES.has(code)) {
        return new TerminalUpgradeError(
          `CHOMP rejected linking ${address} as the successor of ${predecessorAddress}: ${code}`,
        );
      }
      return error;
    },
  };
}

/**
 * Associates the Money Account address with the user's CHOMP profile using
 * CHOMP's v2 challenge flow. When the context carries a `predecessorAddress`,
 * the association also links the address to it as its successor, which
 * starts a Money Account migration.
 *
 * First checks whether the work is already done: for a plain association,
 * whether `GET /v1/auth/address` lists the address; for a successor, whether
 * the address's identity shows it linked to (or already migrated from) the
 * predecessor. A successor address that is part of any other identity can
 * never be linked, so that throws a {@link TerminalUpgradeError}. The lookup
 * is otherwise an optimization: if it fails, the step falls through to the
 * submission below, which is authoritative.
 *
 * Otherwise, requests a single-use SIWE challenge, signs its message exactly
 * as returned with the account's key, and submits the signature. CHOMP
 * responds with `status: 'created'` when it wrote the association or link,
 * and `status: 'active'` when it was already in place, so the latter reports
 * `'already-done'`. A challenge that expired or was replaced while signing
 * (`CHALLENGE_INVALID_OR_EXPIRED`) is retried once with a fresh challenge.
 *
 * Link validation failures that cannot resolve on their own are thrown as a
 * {@link TerminalUpgradeError}. `PREDECESSOR_HAS_OPEN_WITHDRAWALS` is
 * rethrown as is, so callers can wait for the withdrawal to settle and retry.
 *
 * A 409 without an error code usually means the address belongs to a
 * different profile, but CHOMP also returns it when two same-profile
 * requests race. The step disambiguates by repeating the "already done"
 * check: if it now passes the race was benign and the step reports
 * `'already-done'`. A confirmed cross-profile conflict is thrown as a
 * {@link TerminalUpgradeError}; if the check itself fails, the original
 * (retryable) conflict propagates instead.
 */
export const associateAddressStep: Step = {
  name: 'associate-address',
  async run(context) {
    const { messenger, address, predecessorAddress } = context;
    const association = predecessorAddress
      ? successorAssociation(context, predecessorAddress)
      : plainAssociation(context);

    try {
      if (await association.isDone()) {
        return 'already-done';
      }
    } catch (error) {
      if (error instanceof TerminalUpgradeError) {
        throw error;
      }
      // The lookup is an optimization — the submission below is authoritative.
    }

    const submit = async (): Promise<AssociateAddressResponse> => {
      const { challengeId, message } = await messenger.call(
        'ChompApiService:createAddressChallenge',
        association.challengeParams,
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
      if (isUncodedConflictError(error)) {
        let done;
        try {
          done = await association.isDone();
        } catch (lookupError) {
          if (lookupError instanceof TerminalUpgradeError) {
            throw lookupError;
          }
          // Could not disambiguate — surface the original conflict.
          throw error;
        }
        if (done) {
          return 'already-done';
        }
        throw new TerminalUpgradeError(
          `Address ${address} is associated with a different CHOMP profile.`,
        );
      }
      throw association.mapSubmitError(error);
    }
  },
};
