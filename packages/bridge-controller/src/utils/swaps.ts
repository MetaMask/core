import type { Hex } from '@metamask/utils';

import {
  ALLOWED_CONTRACT_ADDRESSES,
  SWAPS_CONTRACT_ADDRESSES,
} from '../constants/swaps';

/**
 * Checks if the given contract address is valid for the given chain ID.
 *
 * @param chainId - The chain ID.
 * @param contract - The contract address.
 * @returns True if the contract address is valid, false otherwise.
 */
export function isValidSwapsContractAddress(
  chainId: Hex,
  contract: Hex | undefined,
): boolean {
  if (!contract || !ALLOWED_CONTRACT_ADDRESSES[chainId]) {
    return false;
  }
  return ALLOWED_CONTRACT_ADDRESSES[chainId].some(
    (allowedContract) =>
      contract.toLowerCase() === allowedContract.toLowerCase(),
  );
}

/**
 * Gets the swaps contract address for the given chain ID.
 *
 * @param chainId - The chain ID.
 * @returns The swaps contract address.
 */
export function getSwapsContractAddress(chainId: Hex): string {
  return SWAPS_CONTRACT_ADDRESSES[chainId];
}
