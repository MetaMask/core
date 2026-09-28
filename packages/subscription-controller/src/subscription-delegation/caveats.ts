import { defaultAbiCoder, Interface } from '@ethersproject/abi';
import type { SignedDelegation } from '@metamask/authenticated-user-storage';
import {
  ROOT_AUTHORITY,
  createAllowedCalldataTerms,
  createERC20TokenPeriodTransferTerms,
} from '@metamask/delegation-core';
import { bytesToHex, remove0x } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { SubscriptionDelegationServiceErrorMessage } from '../constants.js';
import type { SubscriptionDelegationEnforcers } from './types.js';

const ERC20_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount)',
]);

/**
 * Calldata offset of the `AllowedCalldata` prefix. Must match CHOMP's
 * expected terms, which pin the selector together with the recipient.
 * ref: https://github.com/consensys-vertical-apps/va-mmcx-chomp-api/blob/28b72ff16cb5d1b89a7a8ebeb0049a53015a516b/src/intent/delegation-validation.service.ts#L244
 */
export const TRANSFER_CALLDATA_PREFIX_START_INDEX = 0;

/**
 * Encodes the ERC-20 `transfer(address,uint256)` selector followed by the
 * ABI-encoded recipient (36 bytes), i.e. calldata up to the amount argument.
 *
 * @param recipient - Transfer recipient address.
 * @returns The lowercased hex calldata prefix.
 */
export function encodeTransferToCalldataPrefix(recipient: Hex): Hex {
  let encodedRecipient: string;
  try {
    encodedRecipient = defaultAbiCoder.encode(['address'], [recipient]);
  } catch {
    throw new Error(
      `${SubscriptionDelegationServiceErrorMessage.InvalidRecipientAddress}: ${recipient}`,
    );
  }

  return `${ERC20_INTERFACE.getSighash('transfer')}${remove0x(encodedRecipient)}` as Hex;
}

export type UnsignedSubscriptionDelegation = Omit<
  SignedDelegation,
  'signature'
>;

export type BuildSubscriptionCaveatsParams = {
  enforcers: SubscriptionDelegationEnforcers;
  delegateAddress: Hex;
  /**
   * Subscription treasury (pricing chain `paymentAddress`); the only allowed
   * ERC-20 `transfer` recipient.
   */
  recipientAddress: Hex;
  tokenAddress: Hex;
  periodAmount: bigint;
  periodDuration: number;
  startDate: number;
};

/**
 * Builds the caveat list for a cash-subscription delegation:
 * `ERC20TokenPeriodTransfer(...)` then `AllowedCalldata` pinning the
 * `transfer` recipient to the subscription treasury.
 *
 * `ValueLte(0)` is intentionally omitted: CHOMP rejects cash-subscription
 * delegations whose enforcers are not exactly `ERC20PeriodTransferEnforcer`
 * and `AllowedCalldataEnforcer`. Neither enforcer restricts native value, so
 * this relies on the settlement token's `transfer` being non-payable. Re-add
 * `ValueLte(0)` once CHOMP accepts it.
 * ref: https://github.com/consensys-vertical-apps/va-mmcx-chomp-api/blob/28b72ff16cb5d1b89a7a8ebeb0049a53015a516b/src/intent/delegation-validation.service.ts#L174
 *
 * @param params - Enforcer addresses, parties, and period terms.
 * @param params.enforcers - Delegation Framework enforcer addresses.
 * @param params.recipientAddress - Subscription treasury address.
 * @param params.tokenAddress - Subscription settlement token.
 * @param params.periodAmount - Maximum token amount per period.
 * @param params.periodDuration - Period length in seconds.
 * @param params.startDate - Unix timestamp when transfers may begin.
 * @returns Caveats in enforcer order.
 */
export function buildSubscriptionCaveats({
  enforcers,
  recipientAddress,
  tokenAddress,
  periodAmount,
  periodDuration,
  startDate,
}: BuildSubscriptionCaveatsParams): SignedDelegation['caveats'] {
  return [
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
    {
      enforcer: enforcers.allowedCalldata,
      terms: createAllowedCalldataTerms({
        startIndex: TRANSFER_CALLDATA_PREFIX_START_INDEX,
        value: encodeTransferToCalldataPrefix(recipientAddress),
      }),
      args: '0x',
    },
  ];
}

export type BuildUnsignedSubscriptionDelegationParams =
  BuildSubscriptionCaveatsParams & {
    delegatorAddress: Hex;
    /**
     * Optional salt for tests. When omitted, a random 32-byte salt is generated.
     */
    salt?: Hex;
  };

/**
 * Builds an unsigned root cash-subscription delegation.
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
    caveats: buildSubscriptionCaveats(params),
    salt,
  };
}
