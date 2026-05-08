import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import {
  ROOT_AUTHORITY,
  createERC20TransferAmountTerms,
  createRedeemerTerms,
  createValueLteTerms,
} from '@metamask/delegation-core';
import { bytesToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { Step } from './step';

const MAX_UINT256 = 2n ** 256n - 1n;

const equalsIgnoreCase = (a: Hex, b: Hex): boolean =>
  a.toLowerCase() === b.toLowerCase();

export const buildDelegationStep: Step = {
  name: 'build-delegation',
  async run({
    messenger,
    address,
    chainId,
    delegateAddress,
    erc20TransferAmountEnforcer,
    musdTokenAddress,
    redeemerEnforcer,
    valueLteEnforcer,
    vedaVaultAdapterAddress,
  }) {
    const existingDelegations = await messenger.call(
      'AuthenticatedUserStorageService:listDelegations',
    );
    const matchesConfig = (entry: DelegationResponse): boolean =>
      equalsIgnoreCase(entry.signedDelegation.delegator, address) &&
      equalsIgnoreCase(entry.signedDelegation.delegate, delegateAddress) &&
      equalsIgnoreCase(entry.metadata.chainIdHex, chainId) &&
      equalsIgnoreCase(entry.metadata.tokenAddress, musdTokenAddress);
    if (existingDelegations.some(matchesConfig)) {
      return 'already-done';
    }

    const saltBytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const salt = bytesToHex(saltBytes);

    const delegation = {
      delegate: delegateAddress,
      delegator: address,
      authority: ROOT_AUTHORITY,
      caveats: [
        {
          enforcer: valueLteEnforcer,
          terms: createValueLteTerms({ maxValue: 0n }),
          args: '0x' as Hex,
        },
        {
          enforcer: erc20TransferAmountEnforcer,
          terms: createERC20TransferAmountTerms({
            tokenAddress: musdTokenAddress,
            maxAmount: MAX_UINT256,
          }),
          args: '0x' as Hex,
        },
        {
          enforcer: redeemerEnforcer,
          terms: createRedeemerTerms({ redeemers: [vedaVaultAdapterAddress] }),
          args: '0x' as Hex,
        },
      ],
      salt,
    };

    const signature = (await messenger.call(
      'DelegationController:signDelegation',
      { delegation, chainId },
    )) as Hex;

    const result = await messenger.call('ChompApiService:verifyDelegation', {
      signedDelegation: { ...delegation, signature },
      chainId,
    });

    if (!result.valid) {
      throw new Error(
        `CHOMP rejected delegation: ${result.errors?.join(', ') ?? 'unknown error'}`,
      );
    }

    return 'completed';
  },
};
