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
 * 1. `getEvmSlip44` - For EVM networks, uses chainid.network data (recommended for eip155)
 * 2. `getSlip44BySymbol` - Fallback method using @metamask/slip44 package
 *
 * @see https://github.com/satoshilabs/slips/blob/master/slip-0044.md
 * @see https://chainid.network/chains.json
 */
/**
 * Manual overrides for EVM chain IDs where chainid.network returns
 * an incorrect SLIP-44 value due to chain ID collisions.
 */
const EVM_SLIP44_OVERRIDES: ReadonlyMap<number, number> = new Map([
  [999, 2457], // HyperEVM — chainid.network returns 1 (Wanchain collision)
]);

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
   * This is called automatically by getEvmSlip44.
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
   * Gets the SLIP-44 coin type identifier for an EVM network by chain ID.
   *
   * **IMPORTANT: This method is for EVM networks only (eip155 namespace).**
   * For non-EVM networks (Bitcoin, Solana, Tron, etc.), use `getSlip44BySymbol`.
   *
   * This method checks chainid.network data (which maps chainId directly
   * to slip44). If not found, defaults to 60 (Ethereum).
   *
   * @param chainId - The EVM chain ID as a number (e.g., 1 for Ethereum, 56 for BNB Chain)
   * @returns The SLIP-44 coin type number (defaults to 60 if not found)
   * @example
   * ```typescript
   * // For EVM networks only
   * const ethCoinType = await Slip44Service.getEvmSlip44(1);
   * // Returns 60
   *
   * const bnbCoinType = await Slip44Service.getEvmSlip44(56);
   * // Returns 714
   *
   * const unknownEvmChain = await Slip44Service.getEvmSlip44(99999);
   * // Returns 60 (default for EVM)
   * ```
   */
  static async getEvmSlip44(chainId: number): Promise<number> {
    const override = EVM_SLIP44_OVERRIDES.get(chainId);
    if (override !== undefined) {
      return override;
    }

    // Ensure chain data is loaded
    await this.#fetchChainData();

    // Check chainId cache first
    const cached = this.#chainIdCache?.get(chainId);
    if (cached !== undefined) {
      return cached;
    }

    // Default to 60 (Ethereum) for EVM networks without specific mapping
    return 60;
  }

  /**
   * Gets the SLIP-44 coin type identifier for a non-EVM network by symbol.
   *
   * **IMPORTANT: This method is for non-EVM networks only (Bitcoin, Solana, Tron, etc.).**
   * For EVM networks (eip155 namespace), use `getEvmSlip44` instead.
   *
   * Note: Symbol lookup may return incorrect results for duplicate symbols
   * (e.g., CPC is both CPChain and Capricoin).
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
   * Clears all internal caches.
   * Useful for testing or if the underlying data might change.
   */
  static clearCache(): void {
    this.#symbolCache.clear();
    this.#chainIdCache = null;
    this.#fetchPromise = null;
  }
}
