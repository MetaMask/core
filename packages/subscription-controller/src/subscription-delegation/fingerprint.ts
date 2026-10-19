import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import {
  decodeAllowedCalldataTerms,
  decodeERC20TokenPeriodTransferTerms,
} from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

import {
  encodeTransferToCalldataPrefix,
  TRANSFER_CALLDATA_PREFIX_START_INDEX,
} from './caveats.js';
import type { SubscriptionDelegationEnforcers } from './types.js';
import { CASH_SUBSCRIPTION_DELEGATION_TYPE } from './types.js';

export type SubscriptionDelegationFingerprint = {
  delegatorAddress: Hex;
  delegateAddress: Hex;
  recipientAddress: Hex;
  chainId: Hex;
  tokenAddress: Hex;
  periodAmount: bigint;
  periodDuration: number;
  /**
   * Current unix timestamp in seconds. Used for the trial floor so a live
   * permission cannot satisfy a checkout whose start date is still in the future.
   */
  nowSeconds: number;
  /**
   * Unix start date this checkout would sign. A stored permission is reusable
   * only when its period `startDate` is inside the Subscription API window
   * around this value.
   */
  expectedStartDate: number;
  enforcers: SubscriptionDelegationEnforcers;
};

/** Must match va-mmcx-subscription-api START_DATE_PAST_SKEW_SECONDS. */
const START_DATE_PAST_SKEW_SECONDS = 14 * 24 * 60 * 60;

/** Must match va-mmcx-subscription-api START_DATE_FUTURE_SKEW_SECONDS. */
const START_DATE_FUTURE_SKEW_SECONDS = 5 * 60;

function isStartDateInsideApiWindow(
  storedStartDate: number,
  expectedStartDate: number,
  nowSeconds: number,
): boolean {
  if (storedStartDate <= 0) {
    return false;
  }

  const retryMinimumStartDate =
    expectedStartDate - START_DATE_PAST_SKEW_SECONDS;
  const trialLiveFloor = expectedStartDate > nowSeconds ? nowSeconds + 1 : 0;
  const minimumStartDate = Math.max(retryMinimumStartDate, trialLiveFloor);
  const maximumStartDate = expectedStartDate + START_DATE_FUTURE_SKEW_SECONDS;

  return (
    storedStartDate >= minimumStartDate && storedStartDate <= maximumStartDate
  );
}

/**
 * Case-insensitive hex equality.
 *
 * @param left - First hex value.
 * @param right - Second hex value.
 * @returns Whether the values are equal ignoring case.
 */
export function equalsIgnoreCase(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * Builds a predicate that matches a stored AUS delegation to the semantic
 * cash-subscription fingerprint. Salt is ignored so a previously signed
 * equivalent permission can be reused. Period `startDate` must fall inside the
 * Subscription API window around `expectedStartDate` so stored permissions are
 * rejected when they are too old or too far in the future for the checkout.
 *
 * @param expected - Semantic fields that must match.
 * @returns Predicate over {@link DelegationResponse}.
 */
export function makeMatchesSubscriptionDelegation(
  expected: SubscriptionDelegationFingerprint,
): (entry: DelegationResponse) => boolean {
  return (entry) => {
    if (entry.metadata.type !== CASH_SUBSCRIPTION_DELEGATION_TYPE) {
      return false;
    }
    if (
      !equalsIgnoreCase(
        entry.signedDelegation.delegator,
        expected.delegatorAddress,
      )
    ) {
      return false;
    }
    if (
      !equalsIgnoreCase(
        entry.signedDelegation.delegate,
        expected.delegateAddress,
      )
    ) {
      return false;
    }
    if (!equalsIgnoreCase(entry.metadata.chainIdHex, expected.chainId)) {
      return false;
    }
    if (!equalsIgnoreCase(entry.metadata.tokenAddress, expected.tokenAddress)) {
      return false;
    }

    // CHOMP requires exactly these two enforcers, so stored delegations with
    // extra caveats (e.g. a legacy `ValueLte`) cannot be reused.
    const { caveats } = entry.signedDelegation;
    if (caveats.length !== 2) {
      return false;
    }

    const periodCaveat = caveats.find((caveat) =>
      equalsIgnoreCase(
        caveat.enforcer,
        expected.enforcers.erc20TokenPeriodTransfer,
      ),
    );
    const allowedCalldataCaveat = caveats.find((caveat) =>
      equalsIgnoreCase(caveat.enforcer, expected.enforcers.allowedCalldata),
    );
    if (!periodCaveat || !allowedCalldataCaveat) {
      return false;
    }

    try {
      const calldataTerms = decodeAllowedCalldataTerms(
        allowedCalldataCaveat.terms,
      );
      if (
        calldataTerms.startIndex !== TRANSFER_CALLDATA_PREFIX_START_INDEX ||
        !equalsIgnoreCase(
          calldataTerms.value,
          encodeTransferToCalldataPrefix(expected.recipientAddress),
        )
      ) {
        return false;
      }

      const periodTerms = decodeERC20TokenPeriodTransferTerms(
        periodCaveat.terms,
      );
      const storedStartDate = Number(periodTerms.startDate);
      if (
        !isStartDateInsideApiWindow(
          storedStartDate,
          expected.expectedStartDate,
          expected.nowSeconds,
        )
      ) {
        return false;
      }
      return (
        equalsIgnoreCase(periodTerms.tokenAddress, expected.tokenAddress) &&
        periodTerms.periodAmount === expected.periodAmount &&
        Number(periodTerms.periodDuration) === expected.periodDuration
      );
    } catch {
      return false;
    }
  };
}

/**
 * Reads the ERC-20 period-transfer `startDate` from a stored delegation.
 *
 * @param entry - Stored AUS delegation.
 * @param enforcers - Enforcer addresses used to locate the period caveat.
 * @returns Unix timestamp in seconds, or `undefined` when the caveat is
 * missing or malformed.
 */
function getSubscriptionDelegationStartDate(
  entry: DelegationResponse,
  enforcers: SubscriptionDelegationEnforcers,
): number | undefined {
  const periodCaveat = entry.signedDelegation.caveats.find((caveat) =>
    equalsIgnoreCase(caveat.enforcer, enforcers.erc20TokenPeriodTransfer),
  );
  if (!periodCaveat) {
    return undefined;
  }

  try {
    return Number(
      decodeERC20TokenPeriodTransferTerms(periodCaveat.terms).startDate,
    );
  } catch {
    return undefined;
  }
}

/**
 * Returns the fingerprint match with the latest period `startDate`.
 *
 * Equal `startDate`s keep list order. A delegation whose `startDate` cannot
 * be read sorts last.
 *
 * @param matches - Fingerprint-matching AUS delegations, in list order.
 * @param enforcers - Enforcer addresses used to read `startDate`.
 * @returns The preferred match, or `undefined` when `matches` is empty.
 */
export function pickLatestMatchingSubscriptionDelegation(
  matches: readonly DelegationResponse[],
  enforcers: SubscriptionDelegationEnforcers,
): DelegationResponse | undefined {
  const byStartDateDescending = [...matches].sort((left, right) => {
    const leftStart =
      getSubscriptionDelegationStartDate(left, enforcers) ??
      Number.NEGATIVE_INFINITY;
    const rightStart =
      getSubscriptionDelegationStartDate(right, enforcers) ??
      Number.NEGATIVE_INFINITY;
    return rightStart - leftStart;
  });

  return byStartDateDescending[0];
}
