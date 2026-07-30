import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import {
  ROOT_AUTHORITY,
  createERC20TransferAmountTerms,
  createRedeemerTerms,
  createValueLteTerms,
  hashDelegation,
} from '@metamask/delegation-core';
import { add0x, bytesToHex } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMessenger } from '../MoneyAccountUpgradeController.js';
import {
  equalsIgnoreCase,
  makeHasVedaRedeemerCaveat,
} from './delegation-matchers.js';
import type { Step } from './step.js';

const MAX_UINT256 = 2n ** 256n - 1n;
const MAX_UINT256_HEX: Hex = add0x(MAX_UINT256.toString(16));

/**
 * Builds, signs, verifies (with CHOMP), and persists a single auto-deposit
 * delegation for the given token. Both the deposit (mUSD) and withdrawal
 * (vmUSD / boring vault) delegations share this shape; only the token
 * address, symbol, and metadata `type` differ.
 *
 * @param params - The parameters for building the delegation.
 * @param params.messenger - The messenger to call signing/verifying actions on.
 * @param params.address - The delegator (the Money Account being upgraded).
 * @param params.chainId - The chain to scope the delegation to.
 * @param params.delegateAddress - CHOMP's delegate.
 * @param params.tokenAddress - The token the delegation authorises transfers of.
 * @param params.tokenSymbol - Symbol stored in the delegation metadata (e.g. "mUSD").
 * @param params.delegationType - Storage metadata `type` field; matches CHOMP's intent type.
 * @param params.vedaVaultAdapterAddress - The redeemer (Veda vault adapter).
 * @param params.erc20TransferAmountEnforcer - The ERC20TransferAmountEnforcer contract.
 * @param params.redeemerEnforcer - The RedeemerEnforcer contract.
 * @param params.valueLteEnforcer - The ValueLteEnforcer contract.
 */
async function signAndStoreDelegation(params: {
  messenger: MoneyAccountUpgradeControllerMessenger;
  address: Hex;
  chainId: Hex;
  delegateAddress: Hex;
  tokenAddress: Hex;
  tokenSymbol: string;
  delegationType: 'cash-deposit' | 'cash-withdrawal';
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
    tokenSymbol,
    delegationType,
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

  const signedDelegation = { ...delegation, signature };

  const result = await messenger.call('ChompApiService:verifyDelegation', {
    signedDelegation,
    chainId,
  });

  if (!result.valid) {
    throw new Error(
      `CHOMP rejected delegation: ${result.errors?.join(', ') ?? 'unknown error'}`,
    );
  }

  const delegationHash = hashDelegation({
    ...delegation,
    salt: BigInt(salt),
    signature,
  });

  await messenger.call('AuthenticatedUserStorageService:createDelegation', {
    signedDelegation,
    metadata: {
      delegationHash,
      chainIdHex: chainId,
      allowance: MAX_UINT256_HEX,
      tokenSymbol,
      tokenAddress,
      type: delegationType,
    },
  });
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

    const hasVedaRedeemerCaveat = makeHasVedaRedeemerCaveat(
      redeemerEnforcer,
      vedaVaultAdapterAddress,
    );

    const matches =
      (tokenAddress: Hex) =>
      (entry: DelegationResponse): boolean =>
        equalsIgnoreCase(entry.signedDelegation.delegator, address) &&
        equalsIgnoreCase(entry.signedDelegation.delegate, delegateAddress) &&
        equalsIgnoreCase(entry.metadata.chainIdHex, chainId) &&
        equalsIgnoreCase(entry.metadata.tokenAddress, tokenAddress) &&
        hasVedaRedeemerCaveat(entry);

    // The deposit delegation authorises transfers of mUSD (delegator → vault);
    // the withdrawal delegation authorises transfers of vmUSD (vault share
    // token → adapter, which redeems back to mUSD).
    const delegations = [
      {
        tokenAddress: musdTokenAddress,
        tokenSymbol: 'mUSD',
        delegationType: 'cash-deposit' as const,
      },
      {
        tokenAddress: boringVaultAddress,
        tokenSymbol: 'vmUSD',
        delegationType: 'cash-withdrawal' as const,
      },
    ];

    let didWork = false;
    for (const config of delegations) {
      if (existingDelegations.some(matches(config.tokenAddress))) {
        continue;
      }
      await signAndStoreDelegation({
        messenger,
        address,
        chainId,
        delegateAddress,
        ...config,
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
