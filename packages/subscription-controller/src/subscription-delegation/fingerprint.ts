import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import {
  decodeERC20TokenPeriodTransferTerms,
  decodeValueLteTerms,
} from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

import type { SubscriptionDelegationEnforcers } from './types.js';
import { SUBSCRIPTION_PAYMENT_DELEGATION_TYPE } from './types.js';

export type SubscriptionDelegationFingerprint = {
  delegatorAddress: Hex;
  delegateAddress: Hex;
  chainId: Hex;
  tokenAddress: Hex;
  periodAmount: bigint;
  periodDuration: number;
  enforcers: SubscriptionDelegationEnforcers;
};

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
 * subscription-payment fingerprint. Salt and period `startDate` are ignored so
 * a previously signed equivalent permission can be reused.
 *
 * @param expected - Semantic fields that must match.
 * @returns Predicate over {@link DelegationResponse}.
 */
export function makeMatchesSubscriptionDelegation(
  expected: SubscriptionDelegationFingerprint,
): (entry: DelegationResponse) => boolean {
  return (entry) => {
    if (entry.metadata.type !== SUBSCRIPTION_PAYMENT_DELEGATION_TYPE) {
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

    const { caveats } = entry.signedDelegation;
    if (caveats.length < 2) {
      return false;
    }

    const valueLteCaveat = caveats.find((caveat) =>
      equalsIgnoreCase(caveat.enforcer, expected.enforcers.valueLte),
    );
    const periodCaveat = caveats.find((caveat) =>
      equalsIgnoreCase(
        caveat.enforcer,
        expected.enforcers.erc20TokenPeriodTransfer,
      ),
    );
    if (!valueLteCaveat || !periodCaveat) {
      return false;
    }

    try {
      const valueTerms = decodeValueLteTerms(valueLteCaveat.terms);
      if (valueTerms.maxValue !== 0n) {
        return false;
      }

      const periodTerms = decodeERC20TokenPeriodTransferTerms(
        periodCaveat.terms,
      );
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
