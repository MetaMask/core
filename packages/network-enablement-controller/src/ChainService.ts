import { handleFetch } from '@metamask/controller-utils';

/**
 * Type representing a blockchain network from chains.json
 */
type ChainData = {
  chainId: number;
  slip44?: number;
  name: string;
};

const CHAINS_JSON_URL = 'https://chainid.network/chains.json';
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

// Simple in-memory cache
let chainsCache: ChainData[] | null = null;
let cacheTimestamp = 0;

/**
 * Fetches chain data from the chains.json API with caching
 *
 * @returns Promise resolving to an array of chain data
 */
async function fetchChainData(): Promise<ChainData[]> {
  const now = Date.now();

  // Check if cache is valid
  if (chainsCache && now - cacheTimestamp < CACHE_DURATION) {
    return chainsCache;
  }

  try {
    // handleFetch automatically handles response parsing and errors
    const chains = (await handleFetch(CHAINS_JSON_URL)) as ChainData[];

    // Update cache
    chainsCache = chains;
    cacheTimestamp = now;

    return chains;
  } catch (error) {
    throw new Error(
      `Failed to fetch chain data: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Fetches the SLIP-44 coin type for a given chain ID
 *
 * @param chainId - The numeric chain ID to look up
 * @returns Promise resolving to the SLIP-44 value as a string, or null if not found
 *
 * @example
 * ```typescript
 * const slip44 = await getSlip44ByChainId(1); // Returns "60" for Ethereum
 * const slip44BSC = await getSlip44ByChainId(56); // Returns "714" for BSC
 * ```
 */
export async function getSlip44ByChainId(
  chainId: number,
): Promise<string | null> {
  try {
    const chains = await fetchChainData();

    // Find the chain with matching chainId
    const chain = chains.find((c) => c.chainId === chainId);

    if (!chain || chain.slip44 === undefined) {
      return null;
    }

    return chain.slip44.toString();
  } catch (error) {
    console.error(`Error fetching SLIP-44 for chainId ${chainId}:`, error);
    return null; // Return null instead of throwing to make it easier to use
  }
}
