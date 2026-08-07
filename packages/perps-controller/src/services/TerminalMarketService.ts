import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  is,
  nullable,
  number,
  optional,
  string,
  tuple,
  type,
  union,
} from '@metamask/superstruct';

import {
  PERPS_CONSTANTS,
  TERMINAL_API_CONFIG,
} from '../constants/perpsConfig.js';
import type {
  MarketInfo,
  PerpsPlatformDependencies,
  TerminalAssetMetadata,
} from '../types/index.js';
import { MarketCategory } from '../types/index.js';
import { ensureError } from '../utils/errorUtils.js';

const VALID_MARKET_TYPES = new Set<string>(Object.values(MarketCategory));

/**
 * Runtime validation schema for a single market item returned by
 * `GET {terminalApiUrl}`.
 *
 * Uses `type()` (loose object matching), so extra fields the API sends
 * beyond this schema (e.g. `iconUrl`) are silently accepted. Each item is
 * validated individually; items that fail are filtered out and logged
 * instead of rejecting the whole response.
 */
const TerminalPerpetualItemStruct = type({
  symbol: string(),
  name: optional(nullable(string())),
  description: optional(nullable(string())),
  szDecimals: optional(number()),
  maxLeverage: optional(number()),
  marginTableId: optional(number()),
  onlyIsolated: optional(boolean()),
  isDelisted: optional(boolean()),
  minimumOrderSize: optional(number()),
  keywords: optional(nullable(array(string()))),
  tags: optional(nullable(array(string()))),
  // The API field is singular `category`, not `categories` — mapped to our
  // `marketType` below, which is the name used everywhere else.
  category: optional(nullable(string())),
  listedAt: optional(nullable(union([number(), string()]))),
  price: optional(union([string(), number()])),
  change24h: optional(union([string(), number()])),
  changePercent24h: optional(union([string(), number()])),
  funding: optional(union([string(), number()])),
  volume24h: optional(union([string(), number()])),
  openInterest: optional(union([string(), number()])),
  trend: optional(array(tuple([number(), string()]))),
});

type TerminalPerpetualItem = Infer<typeof TerminalPerpetualItemStruct>;

type CacheEntry = {
  markets: MarketInfo[];
  metadata: Map<string, TerminalAssetMetadata>;
  timestamp: number;
};

/**
 * TerminalMarketService
 *
 * Fetches structured market metadata from the MetaMask Terminal API.
 * Caches responses for {@link TERMINAL_API_CONFIG.CacheTtlMs} to avoid
 * redundant network calls across polling cycles.
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
    if (
      this.#cache &&
      Date.now() - this.#cache.timestamp < TERMINAL_API_CONFIG.CacheTtlMs
    ) {
      return {
        markets: this.#cache.markets,
        metadata: this.#cache.metadata,
      };
    }

    if (!this.#deps.terminalApiUrl) {
      throw new Error(
        'Terminal API URL not configured (terminalApiUrl is required)',
      );
    }

    const url = this.#deps.terminalApiUrl;
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error('Terminal API fetch timed out')),
      TERMINAL_API_CONFIG.FetchTimeoutMs,
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new Error(
        `Terminal API returned ${String(response.status)}: ${response.statusText}`,
      );
    }

    const body: unknown = await response.json();

    if (!Array.isArray(body)) {
      throw new Error(`Terminal API returned non-array body: ${typeof body}`);
    }

    const items = this.#validateItems(body);
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
   * Validate raw API response items against the expected schema.
   * Items that fail validation are filtered out and logged rather than
   * rejecting the entire response.
   *
   * @param raw - The raw array from the API response body.
   * @returns Array of validated items.
   */
  #validateItems(raw: unknown[]): TerminalPerpetualItem[] {
    const valid: TerminalPerpetualItem[] = [];
    for (const item of raw) {
      if (is(item, TerminalPerpetualItemStruct)) {
        valid.push(item);
      } else {
        this.#deps.logger.error(
          ensureError(
            new Error('Terminal API item failed schema validation'),
            'TerminalMarketService.validateItems',
          ),
          {
            tags: {
              feature: PERPS_CONSTANTS.FeatureName,
              source: 'terminal-api',
            },
            context: {
              name: 'TerminalMarketService.validateItems',
              data: {
                symbol:
                  typeof item === 'object' &&
                  item !== null &&
                  Object.prototype.hasOwnProperty.call(item, 'symbol')
                    ? (item as Record<string, unknown>).symbol
                    : undefined,
              },
            },
          },
        );
      }
    }
    return valid;
  }

  /**
   * Map Terminal API items to the protocol-agnostic MarketInfo shape.
   *
   * @param items - Raw items from the API response.
   * @returns Array of MarketInfo objects.
   */
  #mapToMarketInfo(items: TerminalPerpetualItem[]): MarketInfo[] {
    return items
      .filter(
        (item) => typeof item.symbol === 'string' && item.symbol.length > 0,
      )
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

      const entry: TerminalAssetMetadata = {};

      if (typeof item.name === 'string' && item.name.length > 0) {
        entry.name = item.name;
      }

      if (typeof item.description === 'string' && item.description.length > 0) {
        entry.description = item.description;
      }

      if (Array.isArray(item.keywords) && item.keywords.length > 0) {
        entry.keywords = item.keywords;
      }
      if (Array.isArray(item.tags) && item.tags.length > 0) {
        entry.tags = item.tags;
      }
      if (
        typeof item.category === 'string' &&
        VALID_MARKET_TYPES.has(item.category)
      ) {
        entry.marketType = item.category as TerminalAssetMetadata['marketType'];
      }

      if (item.listedAt !== null && item.listedAt !== undefined) {
        const listedAtMs =
          typeof item.listedAt === 'number'
            ? item.listedAt
            : Date.parse(item.listedAt);
        if (isFinite(listedAtMs)) {
          entry.listedAt = listedAtMs;
        }
      }

      // Surfacing these lets MarketDataService build markets straight from
      // Terminal data and skip the HyperLiquid price fetch entirely.
      if (item.price !== undefined) {
        entry.price = item.price;
      }
      if (item.change24h !== undefined) {
        entry.change24h = item.change24h;
      }
      if (item.changePercent24h !== undefined) {
        entry.changePercent24h = item.changePercent24h;
      }
      if (item.funding !== undefined) {
        entry.funding = item.funding;
      }
      if (item.volume24h !== undefined) {
        entry.volume24h = item.volume24h;
      }
      if (item.openInterest !== undefined) {
        entry.openInterest = item.openInterest;
      }
      if (item.maxLeverage !== undefined) {
        entry.maxLeverage = item.maxLeverage;
      }
      if (item.trend && item.trend.length > 0) {
        entry.trend = item.trend;
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
        tags: { feature: PERPS_CONSTANTS.FeatureName, source: 'terminal-api' },
        context: {
          name: `TerminalMarketService.${method}`,
          data: { url: this.#deps.terminalApiUrl },
        },
      },
    );
  }
}
