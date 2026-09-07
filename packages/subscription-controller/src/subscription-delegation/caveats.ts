import type { SignedDelegation } from '@metamask/authenticated-user-storage';
import {
  ROOT_AUTHORITY,
  createERC20TokenPeriodTransferTerms,
  createValueLteTerms,
} from '@metamask/delegation-core';
import { bytesToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { SubscriptionDelegationEnforcers } from './types.js';

export type UnsignedSubscriptionDelegation = Omit<
  SignedDelegation,
  'signature'
>;

export type BuildSubscriptionPaymentCaveatsParams = {
  enforcers: SubscriptionDelegationEnforcers;
  tokenAddress: Hex;
  periodAmount: bigint;
  periodDuration: number;
  startDate: number;
};

/**
 * Builds the caveat list for a subscription-payment delegation:
 * `ValueLte(0)` then `ERC20TokenPeriodTransfer(...)`.
 *
 * @param params - Enforcer addresses and period terms.
 * @returns Caveats in enforcer order.
 */
export function buildSubscriptionPaymentCaveats(
  params: BuildSubscriptionPaymentCaveatsParams,
): SignedDelegation['caveats'] {
  const { enforcers, tokenAddress, periodAmount, periodDuration, startDate } =
    params;

  return [
    {
      enforcer: enforcers.valueLte,
      terms: createValueLteTerms({ maxValue: 0n }),
      args: '0x',
    },
    {
      enforcer: enforcers.erc20TokenPeriodTransfer,
      terms: createERC20TokenPeriodTransferTerms({
        tokenAddress,
        periodAmount,
        periodDuration,
        startDate,
      }),
      args: '0x',
    },
  ];
}

export type BuildUnsignedSubscriptionDelegationParams =
  BuildSubscriptionPaymentCaveatsParams & {
    delegateAddress: Hex;
    delegatorAddress: Hex;
    /**
     * Optional salt for tests. When omitted, a random 32-byte salt is generated.
     */
    salt?: Hex;
  };

/**
 * Builds an unsigned root subscription-payment delegation.
 *
 * @param params - Delegation parties, enforcers, and period terms.
 * @returns An unsigned delegation ready for signing.
 */
export function buildUnsignedSubscriptionDelegation(
  params: BuildUnsignedSubscriptionDelegationParams,
): UnsignedSubscriptionDelegation {
  const salt =
    params.salt ??
    bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(32)));

  return {
    delegate: params.delegateAddress,
    delegator: params.delegatorAddress,
    authority: ROOT_AUTHORITY,
    caveats: buildSubscriptionPaymentCaveats(params),
    salt,
  };
}
