import { fetchWithErrorHandling } from '@metamask/controller-utils';
// @ts-expect-error: No type definitions for '@metamask/slip44'
import slip44 from '@metamask/slip44';

const CHAINID_NETWORK_URL = 'https://chainid.network/chains.json';

/**
 * Represents a single SLIP-44 entry with its metadata.
 */
export type Slip44Entry = {
  index: string;
  symbol: string;
  name: string;
};

/**
 * Chain data from chainid.network
 */
type ChainIdNetworkEntry = {
  chainId: number;
  slip44?: number;
  nativeCurrency?: {
    symbol: string;
  };
};

/**
 * Internal type for SLIP-44 data from the @metamask/slip44 package.
 * Includes the hex field which we don't expose externally.
 */
type Slip44DataEntry = Slip44Entry & {
  // eslint-disable-next-line id-denylist
  hex: `0x${string}`;
};

/**
 * The SLIP-44 mapping type from the @metamask/slip44 package.
 */
type Slip44Data = Record<string, Slip44DataEntry>;

/**
 * Service for looking up SLIP-44 coin type identifiers.
 *
 * SLIP-44 defines registered coin types used in BIP-44 derivation paths.
 *
 * This service provides two lookup methods:
 * 1. `getSlip44ByChainId` - Primary method using chainid.network data (recommended)
 * 2. `getSlip44BySymbol` - Fallback method using @metamask/slip44 package
 *
 * @see https://github.com/satoshilabs/slips/blob/master/slip-0044.md
 * @see https://chainid.network/chains.json
 */
export class Slip44Service {
  /**
   * Cache for chainId to slip44 lookups from chainid.network.
   */
  static #chainIdCache: Map<number, number> | null = null;

  /**
   * Whether a fetch is currently in progress.
   */
  static #fetchPromise: Promise<void> | null = null;

  /**
   * Cache for symbol to slip44 index lookups.
   * This avoids iterating through all entries on repeated lookups.
   */
  static readonly #symbolCache: Map<string, number | undefined> = new Map();

  /**
   * Fetches and caches chain data from chainid.network.
   * This is called automatically by getSlip44ByChainId.
   */
  static async #fetchChainData(): Promise<void> {
    if (this.#chainIdCache !== null) {
      return;
    }

    // Avoid duplicate fetches
    if (this.#fetchPromise) {
      await this.#fetchPromise;
      return;
    }

    this.#fetchPromise = (async (): Promise<void> => {
      try {
        const chains: ChainIdNetworkEntry[] | undefined =
          await fetchWithErrorHandling({
            url: CHAINID_NETWORK_URL,
            timeout: 10000,
          });

        if (chains && Array.isArray(chains)) {
          this.#chainIdCache = new Map(
            chains
              .filter(
                (chain): chain is ChainIdNetworkEntry & { slip44: number } =>
                  chain.slip44 !== undefined,
              )
              .map((chain) => [chain.chainId, chain.slip44]),
          );
        } else {
          // Invalid response, initialize empty cache
          this.#chainIdCache = new Map();
        }
      } catch {
        // Network failed, initialize empty cache so we fall back to symbol lookup
        this.#chainIdCache = new Map();
      }
    })();

    await this.#fetchPromise;
    this.#fetchPromise = null;
  }

  /**
   * Gets the SLIP-44 coin type identifier for a given EVM chain ID.
   *
   * This method first checks chainid.network data (which maps chainId directly
   * to slip44), then falls back to symbol lookup if not found.
   *
   * @param chainId - The EVM chain ID (e.g., 1 for Ethereum, 56 for BNB Chain)
   * @param symbol - Optional symbol for fallback lookup (e.g., 'ETH', 'BNB')
   * @returns The SLIP-44 coin type number, or undefined if not found
   * @example
   * ```typescript
   * const ethCoinType = await Slip44Service.getSlip44ByChainId(1);
   * // Returns 60
   *
   * const bnbCoinType = await Slip44Service.getSlip44ByChainId(56);
   * // Returns 714
   * ```
   */
  static async getSlip44ByChainId(
    chainId: number,
    symbol?: string,
  ): Promise<number | undefined> {
    // Ensure chain data is loaded
    await this.#fetchChainData();

    // Check chainId cache first
    const cached = this.#chainIdCache?.get(chainId);
    if (cached !== undefined) {
      return cached;
    }

    // Fall back to symbol lookup if provided
    if (symbol) {
      return this.getSlip44BySymbol(symbol);
    }

    return undefined;
  }

  /**
   * Gets the SLIP-44 coin type identifier for a given network symbol.
   *
   * Note: Symbol lookup may return incorrect results for duplicate symbols
   * (e.g., CPC is both CPChain and Capricoin). For EVM networks, prefer
   * using getSlip44ByChainId instead.
   *
   * @param symbol - The network symbol (e.g., 'ETH', 'BTC', 'SOL')
   * @returns The SLIP-44 coin type number, or undefined if not found
   * @example
   * ```typescript
   * const ethCoinType = Slip44Service.getSlip44BySymbol('ETH');
   * // Returns 60
   *
   * const btcCoinType = Slip44Service.getSlip44BySymbol('BTC');
   * // Returns 0
   * ```
   */
  static getSlip44BySymbol(symbol: string): number | undefined {
    // Check cache first
    if (this.#symbolCache.has(symbol)) {
      return this.#symbolCache.get(symbol);
    }

    const slip44Data = slip44 as Slip44Data;
    const upperSymbol = symbol.toUpperCase();

    // Iterate through all entries to find matching symbol
    // Note: Object.keys returns numeric keys in ascending order,
    // so for duplicate symbols we get the lowest coin type first
    // (which is the convention for resolving duplicates)
    for (const key of Object.keys(slip44Data)) {
      const entry = slip44Data[key];
      if (entry.symbol.toUpperCase() === upperSymbol) {
        const coinType = parseInt(key, 10);
        this.#symbolCache.set(symbol, coinType);
        return coinType;
      }
    }

    // Cache the miss as well to avoid repeated lookups
    this.#symbolCache.set(symbol, undefined);
    return undefined;
  }

  /**
   * Gets the SLIP-44 entry for a given coin type index.
   *
   * @param index - The SLIP-44 coin type index (e.g., 60 for ETH, 0 for BTC)
   * @returns The SLIP-44 entry with metadata, or undefined if not found
   */
  static getSlip44Entry(index: number): Slip44Entry | undefined {
    const slip44Data = slip44 as Slip44Data;
    return slip44Data[index.toString()];
  }

  /**
   * Clears all internal caches.
   * Useful for testing or if the underlying data might change.
   */
  static clearCache(): void {
    this.#symbolCache.clear();
    this.#chainIdCache = null;
    this.#fetchPromise = null;
  }
}
