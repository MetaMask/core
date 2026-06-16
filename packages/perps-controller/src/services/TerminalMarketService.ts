import { TERMINAL_API_CONFIG } from '../constants/perpsConfig';
import type {
  MarketInfo,
  MarketType,
  PerpsPlatformDependencies,
} from '../types';
import { ensureError } from '../utils/errorUtils';

/**
 * Metadata extracted from Terminal API for a single asset.
 * Used downstream by transformMarketData to enrich PerpsMarketData.
 */
export type TerminalAssetMetadata = {
  name: string;
  keywords?: string[];
  tags?: string[];
  categories?: string[];
  marketType?: MarketType;
};

/**
 * Shape of a single market item returned by GET {terminalApiBaseUrl}/perpetuals.
 * Kept intentionally loose — validated at parse time.
 */
type TerminalPerpetualItem = {
  symbol: string;
  name?: string;
  szDecimals?: number;
  maxLeverage?: number;
  marginTableId?: number;
  onlyIsolated?: boolean;
  isDelisted?: boolean;
  minimumOrderSize?: number;
  keywords?: string[];
  tags?: string[];
  categories?: string[];
  marketType?: string;
};

type CacheEntry = {
  markets: MarketInfo[];
  metadata: Map<string, TerminalAssetMetadata>;
  timestamp: number;
};

/**
 * TerminalMarketService
 *
 * Fetches structured market metadata from the MetaMask Terminal API
 * (`GET {terminalApiBaseUrl}/perpetuals`). Caches responses for
 * {@link TERMINAL_API_CONFIG.CacheTtlMs} to avoid redundant network calls
 * across polling cycles.
 *
 * Instance-based service with constructor injection of platform dependencies.
 */
export class TerminalMarketService {
  readonly #deps: PerpsPlatformDependencies;

  #cache: CacheEntry | null = null;

  constructor(deps: PerpsPlatformDependencies) {
    this.#deps = deps;
  }

  /**
   * Fetch markets from the Terminal API.
   * Returns cached data when available and within TTL.
   *
   * @returns Object with mapped MarketInfo array and per-symbol metadata.
   */
  async fetchMarkets(): Promise<{
    markets: MarketInfo[];
    metadata: Map<string, TerminalAssetMetadata>;
  }> {
    if (this.#cache && Date.now() - this.#cache.timestamp < TERMINAL_API_CONFIG.CacheTtlMs) {
      return {
        markets: this.#cache.markets,
        metadata: this.#cache.metadata,
      };
    }

    const url = `${this.#deps.terminalApiBaseUrl}${TERMINAL_API_CONFIG.PerpetualPath}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(
        `Terminal API returned ${String(response.status)}: ${response.statusText}`,
      );
    }

    const body: unknown = await response.json();

    if (!Array.isArray(body)) {
      throw new Error(
        `Terminal API returned non-array body: ${typeof body}`,
      );
    }

    const items = body as TerminalPerpetualItem[];
    const markets = this.#mapToMarketInfo(items);
    const metadata = this.#extractMetadata(items);

    this.#cache = { markets, metadata, timestamp: Date.now() };
    return { markets, metadata };
  }

  /**
   * Invalidate the internal cache so the next fetch hits the network.
   */
  clearCache(): void {
    this.#cache = null;
  }

  /**
   * Map Terminal API items to the protocol-agnostic MarketInfo shape.
   *
   * @param items - Raw items from the API response.
   * @returns Array of MarketInfo objects.
   */
  #mapToMarketInfo(items: TerminalPerpetualItem[]): MarketInfo[] {
    return items
      .filter((item) => typeof item.symbol === 'string' && item.symbol.length > 0)
      .map((item) => ({
        name: item.symbol,
        szDecimals: item.szDecimals ?? 0,
        maxLeverage: item.maxLeverage ?? 1,
        marginTableId: item.marginTableId ?? 0,
        ...(item.onlyIsolated === true && { onlyIsolated: true as const }),
        ...(item.isDelisted === true && { isDelisted: true as const }),
        ...(item.minimumOrderSize !== undefined && {
          minimumOrderSize: item.minimumOrderSize,
        }),
      }));
  }

  /**
   * Extract per-symbol metadata for downstream merge into PerpsMarketData.
   *
   * @param items - Raw items from the API response.
   * @returns Map keyed by symbol with enrichment metadata.
   */
  #extractMetadata(
    items: TerminalPerpetualItem[],
  ): Map<string, TerminalAssetMetadata> {
    const map = new Map<string, TerminalAssetMetadata>();

    for (const item of items) {
      if (typeof item.symbol !== 'string' || item.symbol.length === 0) {
        continue;
      }

      const entry: TerminalAssetMetadata = {
        name: item.name ?? item.symbol,
      };

      if (Array.isArray(item.keywords) && item.keywords.length > 0) {
        entry.keywords = item.keywords;
      }
      if (Array.isArray(item.tags) && item.tags.length > 0) {
        entry.tags = item.tags;
      }
      if (Array.isArray(item.categories) && item.categories.length > 0) {
        entry.categories = item.categories;
      }
      if (typeof item.marketType === 'string' && item.marketType.length > 0) {
        entry.marketType = item.marketType as MarketType;
      }

      map.set(item.symbol, entry);
    }

    return map;
  }

  /**
   * Log a Terminal API error to Sentry without surfacing it to the user.
   *
   * @param error - The caught error.
   * @param method - The calling method name for context.
   */
  logError(error: unknown, method: string): void {
    this.#deps.logger.error(
      ensureError(error, `TerminalMarketService.${method}`),
      {
        tags: { feature: 'perps', source: 'terminal-api' },
        context: {
          name: `TerminalMarketService.${method}`,
          data: { url: this.#deps.terminalApiBaseUrl },
        },
      },
    );
  }
}
