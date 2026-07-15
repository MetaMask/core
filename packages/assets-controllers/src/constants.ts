import { CHAIN_IDS_WITH_NO_NATIVE_TOKEN } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';

export enum Source {
  Custom = 'custom',
  Dapp = 'dapp',
  Detected = 'detected',
}

// TODO: delete this once we have the v4 endpoint for supported networks
export const SUPPORTED_NETWORKS_ACCOUNTS_API_V4 = [
  '0x1', // 1
  '0x89', // 137
  '0x38', // 56
  '0xe708', // 59144
  '0x2105', // 8453
  '0xa', // 10
  '0xa4b1', // 42161
  '0x82750', // 534352
  '0x531', // 1329
  '0x8f', // 143
  '0x3e7', // 999 HyperEVM
  '0x13b2', // 5042 Arc
];

/** Lowercase ERC-20 address for MetaMask USD (mUSD), same contract on listed chains. */
export const MUSD_ERC20_ADDRESS_LOWER =
  '0xaca92e438df0b2401ff60da7e4337b687a2435da';

/**
 * EVM chains where mUSD is always merged into the token-detection candidate list.
 * Metadata matches `GET /v3/assets` on `tokens.api.cx.metamask.io` (assetIds CAIP-19).
 */
export const MUSD_TOKEN_DETECTION_CHAIN_IDS = [
  '0x1', // Ethereum mainnet (eip155:1)
  '0xe708', // Linea (eip155:59144)
  '0x8f', // Monad mainnet (eip155:143)
] as const satisfies readonly Hex[];

/** Raw `aggregators` keys from the Tokens API (same shape as token list cache). */
export type MusdTokenDetectionMetadata = {
  name: string;
  symbol: string;
  decimals: number;
  aggregators: string[];
};

export const MUSD_TOKEN_METADATA_BY_CHAIN: Record<
  (typeof MUSD_TOKEN_DETECTION_CHAIN_IDS)[number],
  MusdTokenDetectionMetadata
> = {
  '0x1': {
    name: 'MetaMask USD',
    symbol: 'MUSD',
    decimals: 6,
    aggregators: ['metamask', 'liFi', 'socket', 'rubic', 'rango'],
  },
  '0xe708': {
    name: 'MetaMask USD',
    symbol: 'MUSD',
    decimals: 6,
    aggregators: ['metamask', 'liFi', 'socket', 'rubic', 'squid', 'rango'],
  },
  '0x8f': {
    name: 'MetaMask USD',
    symbol: 'mUSD',
    decimals: 6,
    aggregators: ['dynamic'],
  },
};

/**
 * Determines if native token fetching should be included for the given chain.
 * Returns false for chains that return arbitrary large numbers (e.g., Tempo networks).
 *
 * @param chainId - Chain ID in hex format (e.g., "0xa5bf") or CAIP-2 format (e.g., "eip155:42431").
 * @returns True if native token should be included, false if it should be skipped.
 */
export function shouldIncludeNativeToken(chainId: string): boolean {
  // Convert hex format to CAIP-2 for comparison
  if (chainId.startsWith('0x')) {
    try {
      const decimal = parseInt(chainId, 16);
      const caipChainId = `eip155:${decimal}`;
      if (
        CHAIN_IDS_WITH_NO_NATIVE_TOKEN.includes(
          caipChainId as (typeof CHAIN_IDS_WITH_NO_NATIVE_TOKEN)[number],
        )
      ) {
        return false;
      }
    } catch {
      // If conversion fails, assume it should be included
      return true;
    }
    return true;
  }

  // Check CAIP-2 format directly
  if (
    CHAIN_IDS_WITH_NO_NATIVE_TOKEN.includes(
      chainId as (typeof CHAIN_IDS_WITH_NO_NATIVE_TOKEN)[number],
    )
  ) {
    return false;
  }

  return true;
}
