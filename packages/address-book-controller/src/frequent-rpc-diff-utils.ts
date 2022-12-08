import type { FrequentRpc } from '@metamask/preferences-controller';
import { Networks } from '@metamask/controller-utils';
import type { NetworkResponse } from './get-current-network-id';

/**
 * The IDs of chains in MetaMask that are considered to be "default". These are
 * significant because we never want to move address book entries for these
 * chains.
 */
const DEFAULT_CHAIN_IDS: string[] = Object.values(Networks)
  .filter((network) => network.isDefault)
  .map((network) => network.networkId.toString());

/**
 * Represents a state change to the chain ID portion of a frequent RPC entry,
 * as well as a flag that governs whether old address book entries should be
 * deleted.
 */
type FrequentRpcDiff = {
  originalChainId: string | undefined;
  newChainId: string | undefined;
  shouldRemoveAddressBookForOriginalChainId: boolean;
};

/**
 * Like a {@link FrequentRpcDiff}, but represents a change to the chain ID of a
 * frequent RPC entry from one non-empty value to another.
 */
export type FrequentRpcChange = {
  originalChainId: string;
  newChainId: string;
  shouldRemoveAddressBookForOriginalChainId: boolean;
};

/**
 * Constructs an object that represents a state change to the chain ID portion
 * of a frequent RPC entry. This object specifies how addresses in the address
 * book should be migrated from one chain to another following such a change.
 *
 * @param args - The arguments to this function.
 * @param args.frequentRpc - The frequent RPC entry after it has been changed.
 * @param args.previousFrequentRpcList - The entirety of the frequent RPC entry
 * list before any changes.
 * @param args.currentNetworkIdResponse - An object that represents the result
 * of asking the current network for its network id. Used to fill in the
 * previous version of the chain ID in case we cannot glean it from the
 * `previousFrequentRpcList`.
 * @param args.log - A function that is used for logging information messages.
 * @returns An object that contains the difference between the chain ID (if any)
 * as well as whether address book entries for the previous chain ID should be
 * removed.
 */
export function buildFrequentRpcDiff({
  frequentRpc,
  previousFrequentRpcList,
  currentNetworkIdResponse,
  log,
}: {
  frequentRpc: FrequentRpc;
  previousFrequentRpcList: FrequentRpc[];
  currentNetworkIdResponse: NetworkResponse;
  log: (...args: any[]) => void;
}) {
  const previousFrequentRpc = getPreviousFrequentRpc();
  const originalChainId = getOriginalChainId();
  const newChainId = frequentRpc.chainId?.toString();
  const shouldRemoveAddressBookForOriginalChainId =
    getShouldRemoveAddressBookForOriginalChainId();

  return {
    originalChainId,
    newChainId,
    shouldRemoveAddressBookForOriginalChainId,
  };

  /**
   * Uses the `previousFrequentRpcList` to find the version of the frequent RPC
   * entry before changes.
   *
   * @returns The previous frequent RPC, if any.
   */
  function getPreviousFrequentRpc(): FrequentRpc | undefined {
    return previousFrequentRpcList.find((prevFrequentRpc) => {
      return prevFrequentRpc.rpcUrl === frequentRpc.rpcUrl;
    });
  }

  /**
   * Determines the chain id of the frequent RPC before it was changed. If there
   * is no record of a previous version or if it did not have a chain ID, then
   * the network ID of the currently connected network is used.
   *
   * @returns The original chain ID, if any.
   */
  function getOriginalChainId() {
    if (previousFrequentRpc !== undefined) {
      if (previousFrequentRpc.chainId !== undefined) {
        return previousFrequentRpc.chainId.toString();
      } else if ('result' in currentNetworkIdResponse) {
        return currentNetworkIdResponse.result;
      }

      log(
        `Couldn't determine current network id (${currentNetworkIdResponse.error}); skipping address migration for ${frequentRpc.rpcUrl}`,
      );
    }

    return undefined;
  }

  /**
   * Usually when the chain ID of an RPC entry is changed, we want to move all
   * of the address book entries that corresponded to that chain ID to the new
   * one. In other words, we copy the existing address book entries to the new
   * chain ID and delete them at the old chain ID. Sometimes, however, we don't
   * want to perform the deletion step. We make this exception when:
   *
   * - A. the chain ID that was changed was one of the default chain IDs
   * (because any chain that is the default is undeletable, so there is no
   * reason to migrate addresses away from it), or
   * - B. if there was more than one RPC entry that used different RPC URLs but
   * shared the same chain ID (so the chain ID is still in use)
   *
   * This function determines whether the deletion step should happen.
   *
   * @returns A boolean.
   */
  function getShouldRemoveAddressBookForOriginalChainId() {
    return (
      originalChainId !== undefined &&
      !DEFAULT_CHAIN_IDS.includes(originalChainId) &&
      !previousFrequentRpcList.some(
        (prevFrequentRpc) =>
          prevFrequentRpc.rpcUrl !== frequentRpc.rpcUrl &&
          prevFrequentRpc.chainId !== undefined &&
          prevFrequentRpc.chainId.toString() === originalChainId,
      )
    );
  }
}

/**
 * An address book migration is only performed in the event that the chain ID of
 * an RPC entry is changed. It is not performed when a chain ID is added to an
 * RPC entry that did not previously have a chain ID, or when the chain ID is
 * removed.
 *
 * This function determines whether the differences between two state changes
 * represents the first case, not the second or third.
 *
 * @param frequentRpcDiff - The difference in state between two frequent RPC
 * entries (as it relates to chain ID).
 * @returns A boolean.
 */
export function isFrequentRpcChange(
  frequentRpcDiff: FrequentRpcDiff,
): frequentRpcDiff is FrequentRpcChange {
  return (
    frequentRpcDiff.originalChainId !== undefined &&
    frequentRpcDiff.newChainId !== undefined &&
    frequentRpcDiff.originalChainId !== frequentRpcDiff.newChainId
  );
}
