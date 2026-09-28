import type { DelegationResponse } from '@metamask/authenticated-user-storage';
import { createRedeemerTerms } from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

import type { UpgradeConfig, VaultDelegationType } from '../types.js';
import type { StepContext } from './step.js';

export const equalsIgnoreCase = (a: Hex, b: Hex): boolean =>
  a.toLowerCase() === b.toLowerCase();

/**
 * Builds a predicate that matches stored delegations carrying a redeemer
 * caveat targeting the Veda vault adapter — i.e. delegations we wrote for
 * auto-deposit / auto-withdrawal. The expected terms blob is computed once
 * and reused across calls.
 *
 * @param redeemerEnforcer - The RedeemerEnforcer contract address.
 * @param vedaVaultAdapterAddress - The Veda vault adapter address that must
 * be encoded as the sole redeemer.
 * @returns A predicate over `DelegationResponse`.
 */
export const makeHasVedaRedeemerCaveat = (
  redeemerEnforcer: Hex,
  vedaVaultAdapterAddress: Hex,
): ((entry: DelegationResponse) => boolean) => {
  const expectedRedeemerTerms = createRedeemerTerms({
    redeemers: [vedaVaultAdapterAddress],
  });
  return (entry) =>
    entry.signedDelegation.caveats.some(
      (caveat) =>
        equalsIgnoreCase(caveat.enforcer, redeemerEnforcer) &&
        equalsIgnoreCase(caveat.terms, expectedRedeemerTerms),
    );
};

/**
 * A deposit or withdrawal delegation the upgrade sequence maintains for one
 * vault.
 */
export type VaultDelegation = {
  tokenAddress: Hex;
  tokenSymbol: string;
  delegationType: VaultDelegationType;
  vedaVaultAdapterAddress: Hex;
};

/**
 * Lists the vault delegations to maintain. The deposit delegation authorises
 * transfers of mUSD (delegator → vault); the withdrawal delegation authorises
 * transfers of the vault share token (→ adapter, which redeems back to mUSD).
 * The premium pair is included only when a premium vault is configured.
 *
 * @param config - The upgrade config.
 * @returns The base deposit and withdrawal delegations, then the premium ones.
 */
export const getVaultDelegations = (
  config: Pick<
    UpgradeConfig,
    | 'musdTokenAddress'
    | 'boringVaultAddress'
    | 'vedaVaultAdapterAddress'
    | 'premiumVault'
  >,
): VaultDelegation[] => [
  {
    tokenAddress: config.musdTokenAddress,
    tokenSymbol: 'mUSD',
    delegationType: 'cash-deposit',
    vedaVaultAdapterAddress: config.vedaVaultAdapterAddress,
  },
  {
    tokenAddress: config.boringVaultAddress,
    tokenSymbol: 'vmUSD',
    delegationType: 'cash-withdrawal',
    vedaVaultAdapterAddress: config.vedaVaultAdapterAddress,
  },
  ...(config.premiumVault
    ? [
        {
          tokenAddress: config.musdTokenAddress,
          tokenSymbol: 'mUSD',
          delegationType: 'cash-deposit-premium' as const,
          vedaVaultAdapterAddress: config.premiumVault.vedaVaultAdapterAddress,
        },
        {
          tokenAddress: config.premiumVault.boringVaultAddress,
          tokenSymbol: 'pvmUSD',
          delegationType: 'cash-withdrawal-premium' as const,
          vedaVaultAdapterAddress: config.premiumVault.vedaVaultAdapterAddress,
        },
      ]
    : []),
];

/**
 * Builds a predicate that matches stored delegations from `address` to
 * CHOMP's delegate on this chain for the given vault delegation. The base
 * and premium deposit delegations share the mUSD token and are told apart by
 * their redeemer (vault adapter).
 *
 * @param context - The step context.
 * @param delegation - The vault delegation to match.
 * @returns A predicate over `DelegationResponse`.
 */
export const makeMatchesVaultDelegation = (
  context: Pick<
    StepContext,
    'address' | 'chainId' | 'delegateAddress' | 'redeemerEnforcer'
  >,
  delegation: VaultDelegation,
): ((entry: DelegationResponse) => boolean) => {
  const hasVedaRedeemerCaveat = makeHasVedaRedeemerCaveat(
    context.redeemerEnforcer,
    delegation.vedaVaultAdapterAddress,
  );
  return (entry) =>
    equalsIgnoreCase(entry.signedDelegation.delegator, context.address) &&
    equalsIgnoreCase(
      entry.signedDelegation.delegate,
      context.delegateAddress,
    ) &&
    equalsIgnoreCase(entry.metadata.chainIdHex, context.chainId) &&
    equalsIgnoreCase(entry.metadata.tokenAddress, delegation.tokenAddress) &&
    hasVedaRedeemerCaveat(entry);
};
