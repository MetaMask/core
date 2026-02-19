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
  '0xe728', // 59144
  '0x2105', // 8453
  '0xa', // 10
  '0xa4b1', // 42161
  '0x82750', // 534352
  '0x531', // 1329
  '0x8f', // 143
  '0x3e7', // 999 HyperEVM
];

/**
 * Chain IDs where native tokens should be skipped.
 * These networks return arbitrary large numbers for native token balances via eth_getBalance.
 * Currently includes: Tempo Testnet (eip155:42431) and Tempo Mainnet (eip155:4217).
 */
const CHAIN_IDS_TO_SKIP_NATIVE_TOKEN = [
  'eip155:42431', // Tempo Testnet
  'eip155:4217', // Tempo Mainnet
] as const;

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
        CHAIN_IDS_TO_SKIP_NATIVE_TOKEN.includes(
          caipChainId as (typeof CHAIN_IDS_TO_SKIP_NATIVE_TOKEN)[number],
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
    CHAIN_IDS_TO_SKIP_NATIVE_TOKEN.includes(
      chainId as (typeof CHAIN_IDS_TO_SKIP_NATIVE_TOKEN)[number],
    )
  ) {
    return false;
  }

  return true;
}
