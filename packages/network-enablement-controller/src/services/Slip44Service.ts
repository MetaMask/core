// @ts-expect-error: No type definitions for '@metamask/slip44'
import slip44 from '@metamask/slip44';

/**
 * Represents a single SLIP-44 entry with its metadata.
 */
export type Slip44Entry = {
  index: string;
  symbol: string;
  name: string;
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
 * Service for looking up SLIP-44 coin type identifiers by symbol.
 *
 * SLIP-44 defines registered coin types used in BIP-44 derivation paths.
 *
 * @see https://github.com/satoshilabs/slips/blob/master/slip-0044.md
 */
export class Slip44Service {
  /**
   * Cache for symbol to slip44 index lookups.
   * This avoids iterating through all entries on repeated lookups.
   */
  static readonly #symbolCache: Map<string, number | undefined> = new Map();

  /**
   * Gets the SLIP-44 coin type identifier for a given network symbol.
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
   * Clears the internal symbol cache.
   * Useful for testing or if the underlying data might change.
   */
  static clearCache(): void {
    this.#symbolCache.clear();
  }
}
