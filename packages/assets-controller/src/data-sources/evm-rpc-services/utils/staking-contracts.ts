import { convertHexToDecimal } from '@metamask/controller-utils';
import {
  isCaipAssetType,
  isCaipChainId,
  isStrictHexString,
  KnownCaipNamespace,
  parseCaipAssetType,
  toCaipChainId,
} from '@metamask/utils';

/** Staking contract addresses by CAIP-2 chain ID (e.g. "eip155:1"). */
export const STAKING_CONTRACT_ADDRESS_BY_CHAINID: Record<string, string> = {
  'eip155:1': '0x4fef9d741011476750a243ac70b9789a63dd47df', // Mainnet
  'eip155:560048': '0xe96ac18cfe5a7af8fe1fe7bc37ff110d88bc67ff', // Hoodi (0x88bb0)
};

/**
 * Normalize chain ID to CAIP-2 for lookup (e.g. "0x1" -> "eip155:1").
 * Uses @metamask/utils for CAIP parsing.
 *
 * @param chainId - Hex chain ID (e.g. "0x1") or CAIP-2 (e.g. "eip155:1").
 * @returns CAIP-2 chain ID.
 */
function toCaip2ChainId(chainId: string): string {
  if (isCaipChainId(chainId)) {
    return chainId;
  }
  const reference = isStrictHexString(chainId)
    ? convertHexToDecimal(chainId).toString()
    : chainId;
  return toCaipChainId(KnownCaipNamespace.Eip155, reference);
}

/**
 * Returns the set of CAIP-2 chain IDs that have a known staking contract.
 *
 * @returns Array of CAIP-2 chain IDs.
 */
export function getSupportedStakingChainIds(): string[] {
  return Object.keys(STAKING_CONTRACT_ADDRESS_BY_CHAINID);
}

/**
 * Returns the staking contract address for a chain, or undefined if not supported.
 *
 * @param chainId - Hex chain ID (e.g. "0x1") or CAIP-2 (e.g. "eip155:1").
 * @returns Contract address (checksummed as stored) or undefined.
 */
export function getStakingContractAddress(chainId: string): string | undefined {
  const caip2 = toCaip2ChainId(chainId);
  return STAKING_CONTRACT_ADDRESS_BY_CHAINID[caip2];
}

/**
 * Returns true if the CAIP-19 asset ID is for a known staking contract.
 * Used to skip fetching metadata for staking contracts from the tokens API.
 * Uses @metamask/utils parseCaipAssetType for CAIP-19 parsing.
 *
 * @param assetId - CAIP-19 asset ID (e.g. "eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df").
 * @returns True if the asset is a staking contract.
 */
export function isStakingContractAssetId(assetId: string): boolean {
  if (!isCaipAssetType(assetId)) {
    return false;
  }
  const parsed = parseCaipAssetType(assetId);
  if (parsed.assetNamespace !== 'erc20') {
    return false;
  }
  const address = parsed.assetReference.toLowerCase();
  const stakingAddress = getStakingContractAddress(
    parsed.chainId,
  )?.toLowerCase();
  return stakingAddress !== undefined && address === stakingAddress;
}
