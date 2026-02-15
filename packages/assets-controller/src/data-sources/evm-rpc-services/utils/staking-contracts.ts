import type { ChainId } from '../types';

import { chainIdToHex } from './parsing';

/** Staking contract addresses by chain ID (hex). Same as AccountTrackerController / assets-controllers. */
export const STAKING_CONTRACT_ADDRESS_BY_CHAINID: Record<string, string> = {
  '0x1': '0x4fef9d741011476750a243ac70b9789a63dd47df', // Mainnet
  '0x88bb0': '0xe96ac18cfe5a7af8fe1fe7bc37ff110d88bc67ff', // Hoodi
};

/**
 * Returns the set of hex chain IDs that have a known staking contract.
 *
 * @returns Array of hex chain IDs.
 */
export function getSupportedStakingChainIds(): string[] {
  return Object.keys(STAKING_CONTRACT_ADDRESS_BY_CHAINID);
}

/**
 * Returns the staking contract address for a chain, or undefined if not supported.
 *
 * @param hexChainId - Hex chain ID (e.g. "0x1").
 * @returns Contract address (checksummed as stored) or undefined.
 */
export function getStakingContractAddress(
  hexChainId: string,
): string | undefined {
  return STAKING_CONTRACT_ADDRESS_BY_CHAINID[hexChainId];
}

/**
 * Returns true if the CAIP-19 asset ID is for a known staking contract.
 * Used to skip fetching metadata for staking contracts from the tokens API.
 *
 * @param assetId - CAIP-19 asset ID (e.g. "eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df").
 * @returns True if the asset is a staking contract.
 */
export function isStakingContractAssetId(assetId: string): boolean {
  const parts = assetId.split('/');
  if (
    parts.length !== 2 ||
    !parts[0].startsWith('eip155:') ||
    !parts[1].startsWith('erc20:')
  ) {
    return false;
  }
  const chainPart = parts[0] as ChainId;
  const address = parts[1].slice(6).toLowerCase();
  const hexChainId = chainIdToHex(chainPart);
  const stakingAddress = getStakingContractAddress(hexChainId)?.toLowerCase();
  return stakingAddress !== undefined && address === stakingAddress;
}

