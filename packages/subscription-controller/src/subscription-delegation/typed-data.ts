import {
  decodeERC20TokenPeriodTransferTerms,
  decodeValueLteTerms,
} from '@metamask/delegation-core';
import { SignTypedDataVersion, TypedDataUtils } from '@metamask/eth-sig-util';
import { bytesToHex, getChecksumAddress, hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

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

export function hashTypedData(typedData: SubscriptionDelegationTypedData): Hex {
  return bytesToHex(
    TypedDataUtils.eip712Hash(
      typedData as Parameters<typeof TypedDataUtils.eip712Hash>[0],
      SignTypedDataVersion.V4,
    ),
  );
}

export function decodeSubscriptionAuthority(
  delegation: UnsignedSubscriptionDelegation,
  enforcers: SubscriptionDelegationEnforcers,
): DecodedPermission {
  const valueLte = delegation.caveats.find(
    ({ enforcer }) =>
      enforcer.toLowerCase() === enforcers.valueLte.toLowerCase(),
  );
  const periodTransfer = delegation.caveats.find(
    ({ enforcer }) =>
      enforcer.toLowerCase() ===
      enforcers.erc20TokenPeriodTransfer.toLowerCase(),
  );
  if (!valueLte || !periodTransfer) {
    throw new Error('Subscription delegation is missing required caveats');
  }

  const valueTerms = decodeValueLteTerms(valueLte.terms);
  const periodTerms = decodeERC20TokenPeriodTransferTerms(periodTransfer.terms);
  if (valueTerms.maxValue !== 0n) {
    throw new Error('Subscription delegation permits native value');
  }

  return {
    tokenAddress: periodTerms.tokenAddress,
    delegateAddress: delegation.delegate,
    periodAmount: periodTerms.periodAmount.toString(),
    periodDuration: Number(periodTerms.periodDuration),
    startDate: Number(periodTerms.startDate),
    maxNativeValue: '0',
  };
}
