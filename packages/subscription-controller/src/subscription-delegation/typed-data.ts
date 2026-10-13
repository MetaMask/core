import { decodeERC20TokenPeriodTransferTerms } from '@metamask/delegation-core';
import { getChecksumAddress, hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { equalsIgnoreCase } from './fingerprint.js';
import type {
  DecodedPermission,
  SubscriptionDelegationEnforcers,
  SubscriptionDelegationTypedData,
  UnsignedSubscriptionDelegation,
} from './types.js';

const SIGNABLE_DELEGATION_TYPES = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  Caveat: [
    { name: 'enforcer', type: 'address' },
    { name: 'terms', type: 'bytes' },
  ],
  Delegation: [
    { name: 'delegate', type: 'address' },
    { name: 'delegator', type: 'address' },
    { name: 'authority', type: 'bytes32' },
    { name: 'caveats', type: 'Caveat[]' },
    { name: 'salt', type: 'uint256' },
  ],
};

export function buildDelegationTypedData({
  delegation,
  chainId,
  delegationManager,
}: {
  delegation: UnsignedSubscriptionDelegation;
  chainId: Hex;
  delegationManager: Hex;
}): SubscriptionDelegationTypedData {
  return {
    types: SIGNABLE_DELEGATION_TYPES,
    primaryType: 'Delegation',
    domain: {
      chainId: hexToNumber(chainId),
      name: 'DelegationManager',
      version: '1',
      verifyingContract: delegationManager,
    },
    message: {
      delegate: getChecksumAddress(delegation.delegate),
      delegator: getChecksumAddress(delegation.delegator),
      authority: delegation.authority,
      caveats: delegation.caveats.map(({ enforcer, terms }) => ({
        enforcer: getChecksumAddress(enforcer),
        terms,
      })),
      salt: delegation.salt,
    },
  };
}

/**
 * Decodes the effective permission granted by a cash-subscription delegation
 * for display in confirmations.
 *
 * The delegation must carry exactly the two caveats CHOMP accepts:
 * `ERC20TokenPeriodTransfer` (token, amount, period, start) and
 * `AllowedCalldata` (pinning the `transfer` recipient). No `ValueLte` caveat
 * is present; `maxNativeValue` is reported as `'0'` because the settlement
 * token's `transfer` is non-payable (see `buildSubscriptionCaveats`).
 *
 * @param delegation - The unsigned subscription delegation.
 * @param enforcers - Delegation Framework enforcer addresses for the chain.
 * @returns The decoded permission.
 */
export function decodeSubscriptionAuthority(
  delegation: UnsignedSubscriptionDelegation,
  enforcers: SubscriptionDelegationEnforcers,
): DecodedPermission {
  const periodTransfer = delegation.caveats.find(({ enforcer }) =>
    equalsIgnoreCase(enforcer, enforcers.erc20TokenPeriodTransfer),
  );
  const allowedCalldata = delegation.caveats.find(({ enforcer }) =>
    equalsIgnoreCase(enforcer, enforcers.allowedCalldata),
  );
  if (!periodTransfer || !allowedCalldata) {
    throw new Error('Subscription delegation is missing required caveats');
  }

  const periodTerms = decodeERC20TokenPeriodTransferTerms(periodTransfer.terms);

  return {
    tokenAddress: periodTerms.tokenAddress,
    delegateAddress: delegation.delegate,
    periodAmount: periodTerms.periodAmount.toString(),
    periodDuration: Number(periodTerms.periodDuration),
    startDate: Number(periodTerms.startDate),
    maxNativeValue: '0',
  };
}
