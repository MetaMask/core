import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import {
  ROOT_AUTHORITY,
  createERC20TransferAmountTerms,
  createRedeemerTerms,
  createValueLteTerms,
} from '@metamask/delegation-core';
import { bytesToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController';
import type { Step } from './step';

const MAX_UINT256 = 2n ** 256n - 1n;

const equalsIgnoreCase = (a: Hex, b: Hex): boolean =>
  a.toLowerCase() === b.toLowerCase();

/**
 * Builds, signs, and submits a single auto-deposit delegation for the given
 * token. Both the deposit (mUSD) and withdrawal (vmUSD / boring vault)
 * delegations share this shape; only the token address differs.
 *
 * @param params - The parameters for building the delegation.
 * @param params.messenger - The messenger to call signing/verifying actions on.
 * @param params.address - The delegator (the Money Account being upgraded).
 * @param params.chainId - The chain to scope the delegation to.
 * @param params.delegateAddress - CHOMP's delegate.
 * @param params.tokenAddress - The token the delegation authorises transfers of.
 * @param params.vedaVaultAdapterAddress - The redeemer (Veda vault adapter).
 * @param params.erc20TransferAmountEnforcer - The ERC20TransferAmountEnforcer contract.
 * @param params.redeemerEnforcer - The RedeemerEnforcer contract.
 * @param params.valueLteEnforcer - The ValueLteEnforcer contract.
 */
async function signAndSubmitDelegation(params: {
  messenger: MoneyAccountUpgradeControllerMessenger;
  address: Hex;
  chainId: Hex;
  delegateAddress: Hex;
  tokenAddress: Hex;
  vedaVaultAdapterAddress: Hex;
  erc20TransferAmountEnforcer: Hex;
  redeemerEnforcer: Hex;
  valueLteEnforcer: Hex;
}): Promise<void> {
  const {
    messenger,
    address,
    chainId,
    delegateAddress,
    tokenAddress,
    vedaVaultAdapterAddress,
    erc20TransferAmountEnforcer,
    redeemerEnforcer,
    valueLteEnforcer,
  } = params;

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
          tokenAddress,
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
}

export const buildDelegationStep: Step = {
  name: 'build-delegation',
  async run({
    messenger,
    address,
    chainId,
    boringVaultAddress,
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

    const matches =
      (tokenAddress: Hex) =>
      (entry: DelegationResponse): boolean =>
        equalsIgnoreCase(entry.signedDelegation.delegator, address) &&
        equalsIgnoreCase(entry.signedDelegation.delegate, delegateAddress) &&
        equalsIgnoreCase(entry.metadata.chainIdHex, chainId) &&
        equalsIgnoreCase(entry.metadata.tokenAddress, tokenAddress);

    // The deposit delegation authorises transfers of mUSD (delegator → vault);
    // the withdrawal delegation authorises transfers of vmUSD (vault share
    // token → adapter, which redeems back to mUSD).
    const tokens: Hex[] = [musdTokenAddress, boringVaultAddress];

    let didWork = false;
    for (const tokenAddress of tokens) {
      if (existingDelegations.some(matches(tokenAddress))) {
        continue;
      }
      await signAndSubmitDelegation({
        messenger,
        address,
        chainId,
        delegateAddress,
        tokenAddress,
        vedaVaultAdapterAddress,
        erc20TransferAmountEnforcer,
        redeemerEnforcer,
        valueLteEnforcer,
      });
      didWork = true;
    }

    return didWork ? 'completed' : 'already-done';
  },
};
