import { parseCaipAssetType } from '@metamask/utils';

import type { Caip19AssetId, ChainId } from '../types';

/**
 * Inputs needed to decide whether `RpcDataSource` should run a supplemental
 * `customAssetsOnly` subscription. All inputs are pre-computed by the caller
 * (controller) so this helper is fully pure and deterministic.
 */
export type RpcCustomAssetsSupplementInput = {
  /** Selected account IDs being considered for subscription. */
  accountIds: string[];
  /** `state.customAssets` slice — accountId → CAIP-19 asset IDs. */
  customAssetsByAccount: Record<string, Caip19AssetId[]>;
  /** Chains the regular RPC subscription already covers. */
  rpcAssignedChains: Set<ChainId>;
  /** Chains the RPC data source can serve (its current activeChains). */
  rpcAvailableChains: Set<ChainId>;
  /**
   * Chains that are currently enabled for at least one selected account
   * (i.e. keys of the controller's chainToAccounts map).
   */
  enabledChains: Set<ChainId>;
};

/**
 * The decision output: which chains and accounts need a supplemental
 * `customAssetsOnly` RPC subscription.
 */
export type RpcCustomAssetsSupplementResult = {
  /** Chains that need a supplemental customAssetsOnly RPC subscription. */
  chains: ChainId[];
  /** Accounts that own at least one customAsset on a supplemental chain. */
  accountIds: Set<string>;
};

/**
 * Decide which chains require a supplemental `customAssetsOnly` RPC
 * subscription so that user-imported customAssets are **always** polled by
 * RPC — even when AccountsApi or the websocket data source has already
 * claimed the chain in the regular handoff.
 *
 * RPC is the sole balance fetcher for customAssets:
 * - AccountsApi indexes a curated token list and may return zero (or no
 *   entry at all) for a user-imported token, even on supported chains.
 * - The websocket data source is push-only: it relays balance deltas from
 *   transactions, so a user who never transacts won't see balance updates.
 *
 * To guarantee freshness, we subscribe RPC in `customAssetsOnly` mode on
 * any chain that:
 * 1. has at least one selected account with a customAsset there;
 * 2. is supported by the RPC data source;
 * 3. is **not** already covered by the regular RPC subscription
 *    (`rpcAssignedChains`) — otherwise customAssets are picked up there;
 * 4. is currently enabled (in `chainToAccounts`); polling a disabled
 *    chain wastes resources because the user can't see its balances.
 *
 * Malformed asset IDs are silently skipped — they can't be parsed into a
 * chain anyway and shouldn't crash the subscription pipeline.
 *
 * @param input - Decision inputs.
 * @returns Chains and account IDs that require supplemental subscription.
 */
export function pickRpcCustomAssetsSupplement(
  input: RpcCustomAssetsSupplementInput,
): RpcCustomAssetsSupplementResult {
  const {
    accountIds,
    customAssetsByAccount,
    rpcAssignedChains,
    rpcAvailableChains,
    enabledChains,
  } = input;

  const chains = new Set<ChainId>();
  const supplementalAccountIds = new Set<string>();

  for (const accountId of accountIds) {
    const customForAccount = customAssetsByAccount[accountId];
    if (!customForAccount || customForAccount.length === 0) {
      continue;
    }
    // Mirror the controller's prior behavior: an account with any customAsset
    // (even if all are filtered out below) is added to the candidate set.
    // The empty-chains early-return in the caller still prevents a useless
    // subscription, so this preserves observable behavior.
    supplementalAccountIds.add(accountId);
    for (const assetId of customForAccount) {
      let chainId: ChainId;
      try {
        chainId = parseCaipAssetType(assetId).chainId;
      } catch {
        continue;
      }
      if (rpcAssignedChains.has(chainId)) {
        continue;
      }
      if (!rpcAvailableChains.has(chainId)) {
        continue;
      }
      if (!enabledChains.has(chainId)) {
        continue;
      }
      chains.add(chainId);
    }
  }

  return {
    chains: [...chains],
    accountIds: supplementalAccountIds,
  };
}
