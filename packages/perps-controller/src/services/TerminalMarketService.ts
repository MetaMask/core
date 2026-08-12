import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  is,
  nullable,
  number,
  object,
  optional,
  string,
  tuple,
  type,
  union,
} from '@metamask/superstruct';
import { bytesToHex, sha256, stringToBytes } from '@metamask/utils';

import {
  PERPS_CONSTANTS,
  TERMINAL_API_CONFIG,
} from '../constants/perpsConfig.js';
import type {
  MarketInfo,
  PerpsGlobalSnapshotRequest,
  PerpsGlobalSnapshotResult,
  PerpsMarketData,
  PerpsPlatformDependencies,
  TerminalAssetMetadata,
} from '../types/index.js';
import { MarketCategory } from '../types/index.js';
import { ensureError } from '../utils/errorUtils.js';
import { formatChange } from '../utils/marketDataTransform.js';
import { clonePerpsMarketData } from '../utils/marketUtils.js';

const VALID_MARKET_TYPES = new Set<string>(Object.values(MarketCategory));
const GLOBAL_SNAPSHOT_SCHEMA_VERSION = 2;
const GLOBAL_SNAPSHOT_CONSUMER_MAX_AGE_MS = 30_000;
const GLOBAL_SNAPSHOT_MAX_PAYLOAD_BYTES = 1_048_576;
const GLOBAL_SNAPSHOT_PERCENT_TOLERANCE = 0.01;
const GLOBAL_SNAPSHOT_OPEN_INTEREST_RELATIVE_TOLERANCE = 0.0001;
const MINIMUM_EPOCH_MILLISECONDS = Date.UTC(2000, 0, 1);
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const DEX_PATTERN = /^(?:main|[a-z0-9][a-z0-9-]*)$/u;

const GlobalSnapshotMarketStruct = object({
  symbol: string(),
  dex: string(),
  name: nullable(string()),
  description: nullable(string()),
  iconUrl: nullable(string()),
  szDecimals: number(),
  maxLeverage: number(),
  marginTableId: number(),
  onlyIsolated: boolean(),
  isDelisted: boolean(),
  minimumOrderSize: nullable(string()),
  markPrice: string(),
  midPrice: nullable(string()),
  oraclePrice: string(),
  change24h: string(),
  change24hPercent: string(),
  volume24hUsd: string(),
  openInterestBase: string(),
  openInterestUsd: string(),
  fundingRate: string(),
  categories: array(string()),
  marketType: nullable(string()),
  keywords: array(string()),
  tags: array(string()),
  listedAt: nullable(number()),
  trend: array(tuple([number(), string()])),
});

const GlobalSnapshotStruct = object({
  schemaVersion: number(),
  provider: string(),
  network: string(),
  enabledDexes: array(string()),
  fingerprint: string(),
  generatedAt: number(),
  receivedAt: number(),
  maxAgeMs: number(),
  complete: boolean(),
  perDexErrors: array(
    object({
      dex: string(),
      error: string(),
    }),
  ),
  markets: array(GlobalSnapshotMarketStruct),
});

type GlobalSnapshotMarket = Infer<typeof GlobalSnapshotMarketStruct>;
type GlobalSnapshot = Infer<typeof GlobalSnapshotStruct>;

/**
 * Runtime validation schema for a single market item returned by
 * `GET {terminalApi.marketDataUrl}`.
 *
 * Uses `type()` (loose object matching) so that extra fields the API sends
 * (e.g. `price`, `iconUrl`, `trend`) are silently accepted.
 * Each item is individually validated; items that fail validation are
 * filtered out and logged rather than rejecting the entire response.
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
  categories: optional(nullable(array(string()))),
  marketType: optional(nullable(string())),
  listedAt: optional(nullable(union([number(), string()]))),
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

  readonly #globalSnapshotCache = new Map<string, PerpsGlobalSnapshotResult>();

  readonly #globalSnapshotInFlight = new Map<
    string,
    Promise<PerpsGlobalSnapshotResult>
  >();

  #globalSnapshotGeneration = 0;

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

    const marketDataUrl =
      this.#deps.terminalApi?.marketDataUrl ?? this.#deps.terminalApiUrl;
    if (!marketDataUrl) {
      throw new Error('Terminal API market-data URL not configured');
    }

    const url = marketDataUrl;
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
   * Fetch, authenticate by exact identity, and map a schema-v2 atomic market
   * snapshot. Accepted entries remain inside the source freshness window;
   * rejected responses are never cached.
   *
   * @param request - Exact provider/network/DEX identity expected by the client.
   * @returns UI-ready market data and its source-bounded expiry.
   */
  async fetchGlobalSnapshot(
    request: PerpsGlobalSnapshotRequest,
  ): Promise<PerpsGlobalSnapshotResult> {
    const identity = this.#validateRequestedIdentity(request);
    if (!this.#deps.terminalApi?.globalSnapshotUrl) {
      throw new Error('Terminal global snapshot URL not configured');
    }

    const url = this.#buildGlobalSnapshotUrl(
      this.#deps.terminalApi.globalSnapshotUrl,
      identity,
    );
    const cacheKey = [
      url,
      String(GLOBAL_SNAPSHOT_SCHEMA_VERSION),
      identity.provider,
      identity.network,
      identity.enabledDexes.join(','),
    ].join('|');
    const now = Date.now();
    const cached = this.#globalSnapshotCache.get(cacheKey);
    if (cached && now < cached.expiresAt) {
      return this.#cloneGlobalSnapshotResult(cached);
    }
    if (cached) {
      this.#globalSnapshotCache.delete(cacheKey);
    }

    const existing = this.#globalSnapshotInFlight.get(cacheKey);
    if (existing) {
      return this.#cloneGlobalSnapshotResult(await existing);
    }

    const generation = this.#globalSnapshotGeneration;
    const pending = this.#fetchAndValidateGlobalSnapshot(identity, url).then(
      (result) => {
        if (this.#globalSnapshotGeneration !== generation) {
          return result;
        }
        this.#globalSnapshotCache.set(cacheKey, result);
        return result;
      },
    );
    this.#globalSnapshotInFlight.set(cacheKey, pending);
    try {
      return this.#cloneGlobalSnapshotResult(await pending);
    } finally {
      if (this.#globalSnapshotInFlight.get(cacheKey) === pending) {
        this.#globalSnapshotInFlight.delete(cacheKey);
      }
    }
  }

  async #fetchAndValidateGlobalSnapshot(
    identity: PerpsGlobalSnapshotRequest,
    url: string,
  ): Promise<PerpsGlobalSnapshotResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error('Terminal global snapshot timed out')),
      TERMINAL_API_CONFIG.FetchTimeoutMs,
    );

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Terminal global snapshot returned ${String(response.status)}: ${response.statusText}`,
        );
      }

      const declaredLength = response.headers?.get('content-length');
      if (
        declaredLength !== null &&
        declaredLength !== undefined &&
        /^\d+$/u.test(declaredLength) &&
        Number(declaredLength) > GLOBAL_SNAPSHOT_MAX_PAYLOAD_BYTES
      ) {
        throw new Error('Terminal global snapshot payload exceeds 1 MiB');
      }
      // React Native fetch does not consistently expose a streaming reader.
      // Reject declared oversize bodies before allocation, then enforce the same
      // byte cap after text() for servers that omit Content-Length.
      const text = await response.text();
      if (stringToBytes(text).byteLength > GLOBAL_SNAPSHOT_MAX_PAYLOAD_BYTES) {
        throw new Error('Terminal global snapshot payload exceeds 1 MiB');
      }
      let body: unknown;
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        throw new Error('Terminal global snapshot returned invalid JSON');
      }
      if (!is(body, GlobalSnapshotStruct)) {
        throw new Error('Terminal global snapshot failed schema validation');
      }
      return this.#validateAndMapGlobalSnapshot(body, identity, Date.now());
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async #validateAndMapGlobalSnapshot(
    snapshot: GlobalSnapshot,
    identity: PerpsGlobalSnapshotRequest,
    now: number,
  ): Promise<PerpsGlobalSnapshotResult> {
    if (snapshot.schemaVersion !== GLOBAL_SNAPSHOT_SCHEMA_VERSION) {
      throw new Error('Terminal global snapshot schema version mismatch');
    }
    if (
      snapshot.provider !== identity.provider ||
      snapshot.network !== identity.network
    ) {
      throw new Error('Terminal global snapshot identity mismatch');
    }

    const responseDexes = this.#normalizeDexes(snapshot.enabledDexes);
    if (
      responseDexes.length !== identity.enabledDexes.length ||
      responseDexes.some((dex, index) => dex !== identity.enabledDexes[index])
    ) {
      throw new Error('Terminal global snapshot DEX mismatch');
    }
    const expectedFingerprint = await this.#createFingerprint(identity);
    if (snapshot.fingerprint !== expectedFingerprint) {
      throw new Error('Terminal global snapshot fingerprint mismatch');
    }
    if (!snapshot.complete || snapshot.perDexErrors.length > 0) {
      throw new Error('Terminal global snapshot is incomplete');
    }
    if (
      !this.#isNonNegativeSafeInteger(snapshot.generatedAt) ||
      !this.#isNonNegativeSafeInteger(snapshot.receivedAt) ||
      !this.#isPositiveSafeInteger(snapshot.maxAgeMs) ||
      snapshot.receivedAt > snapshot.generatedAt ||
      snapshot.generatedAt > now ||
      snapshot.receivedAt > now
    ) {
      throw new Error('Terminal global snapshot has invalid timestamps');
    }

    const trustedMaxAgeMs = Math.min(
      snapshot.maxAgeMs,
      GLOBAL_SNAPSHOT_CONSUMER_MAX_AGE_MS,
    );
    const expiresAt = snapshot.receivedAt + trustedMaxAgeMs;
    if (now >= expiresAt) {
      throw new Error('Terminal global snapshot is stale');
    }
    if (snapshot.markets.length === 0) {
      throw new Error('Terminal global snapshot has no markets');
    }

    const marketKeys = new Set<string>();
    const representedDexes = new Set<string>();
    const tradableDexes = new Set<string>();
    const markets = snapshot.markets
      .map((market, index) => {
        this.#validateSnapshotMarket(
          market,
          identity,
          index,
          snapshot.generatedAt,
        );
        const key = `${market.dex}:${market.symbol}`;
        if (marketKeys.has(key)) {
          throw new Error(`Terminal global snapshot duplicates market ${key}`);
        }
        marketKeys.add(key);
        representedDexes.add(market.dex);
        return market;
      })
      .filter((market) => {
        if (!market.isDelisted) {
          tradableDexes.add(market.dex);
          return true;
        }
        return false;
      })
      .map((market) => this.#mapSnapshotMarket(market, expiresAt));
    if (identity.enabledDexes.some((dex) => !representedDexes.has(dex))) {
      throw new Error('Terminal global snapshot is missing a requested DEX');
    }
    if (identity.enabledDexes.some((dex) => !tradableDexes.has(dex))) {
      throw new Error(
        'Terminal global snapshot has no tradable market for a requested DEX',
      );
    }
    if (markets.length === 0) {
      throw new Error('Terminal global snapshot has no tradable markets');
    }

    return { markets, expiresAt };
  }

  #validateRequestedIdentity(
    request: PerpsGlobalSnapshotRequest,
  ): PerpsGlobalSnapshotRequest {
    if (request.provider !== 'hyperliquid') {
      throw new Error('Terminal global snapshot provider is unsupported');
    }
    if (request.network !== 'mainnet' && request.network !== 'testnet') {
      throw new Error('Terminal global snapshot network is unsupported');
    }
    return {
      provider: request.provider,
      network: request.network,
      enabledDexes: this.#normalizeDexes(request.enabledDexes),
    };
  }

  #buildGlobalSnapshotUrl(
    baseUrl: string,
    identity: PerpsGlobalSnapshotRequest,
  ): string {
    const query = new URLSearchParams({
      provider: identity.provider,
      network: identity.network,
      dexes: identity.enabledDexes.join(','),
    });
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${query.toString()}`;
  }

  #normalizeDexes(dexes: string[]): string[] {
    if (!Array.isArray(dexes) || dexes.length === 0) {
      throw new Error('Terminal global snapshot requires at least one DEX');
    }
    const normalized = dexes.map((dex) => {
      if (typeof dex !== 'string' || !DEX_PATTERN.test(dex)) {
        throw new Error('Terminal global snapshot contains an invalid DEX');
      }
      return dex;
    });
    if (new Set(normalized).size !== normalized.length) {
      throw new Error('Terminal global snapshot contains duplicate DEXes');
    }
    return normalized.sort();
  }

  async #createFingerprint(
    identity: PerpsGlobalSnapshotRequest,
  ): Promise<string> {
    const canonicalIdentity = JSON.stringify({
      provider: identity.provider,
      network: identity.network,
      enabledDexes: identity.enabledDexes,
    });
    const digest = await sha256(stringToBytes(canonicalIdentity));
    return `sha256:${bytesToHex(digest).slice(2)}`;
  }

  #validateSnapshotMarket(
    market: GlobalSnapshotMarket,
    identity: PerpsGlobalSnapshotRequest,
    index: number,
    generatedAt: number,
  ): void {
    const invalid = (field: string): Error =>
      new Error(
        `Terminal global snapshot market ${String(index)} has invalid ${field}`,
      );
    if (!identity.enabledDexes.includes(market.dex)) {
      throw invalid('dex');
    }
    const expectedPrefix = market.dex === 'main' ? '' : `${market.dex}:`;
    if (
      market.symbol.length === 0 ||
      (expectedPrefix
        ? !market.symbol.startsWith(expectedPrefix)
        : market.symbol.includes(':'))
    ) {
      throw invalid('symbol');
    }
    if (
      !this.#isNonNegativeSafeInteger(market.szDecimals) ||
      !this.#isPositiveSafeInteger(market.maxLeverage) ||
      !this.#isNonNegativeSafeInteger(market.marginTableId) ||
      (market.listedAt !== null &&
        (!this.#isNonNegativeSafeInteger(market.listedAt) ||
          market.listedAt < MINIMUM_EPOCH_MILLISECONDS ||
          market.listedAt > generatedAt))
    ) {
      throw invalid('integer field');
    }

    const decimalFields: [string, string, boolean][] = [
      ['markPrice', market.markPrice, true],
      ['oraclePrice', market.oraclePrice, true],
      ['change24h', market.change24h, false],
      ['change24hPercent', market.change24hPercent, false],
      ['volume24hUsd', market.volume24hUsd, true],
      ['openInterestBase', market.openInterestBase, true],
      ['openInterestUsd', market.openInterestUsd, true],
      ['fundingRate', market.fundingRate, false],
    ];
    if (market.midPrice !== null) {
      decimalFields.push(['midPrice', market.midPrice, true]);
    }
    if (market.minimumOrderSize !== null) {
      decimalFields.push(['minimumOrderSize', market.minimumOrderSize, true]);
    }
    for (const [field, value, nonNegative] of decimalFields) {
      const pattern = nonNegative
        ? NON_NEGATIVE_DECIMAL_PATTERN
        : DECIMAL_PATTERN;
      if (!pattern.test(value) || !Number.isFinite(Number(value))) {
        throw invalid(field);
      }
    }
    const markPrice = Number(market.markPrice);
    const change24h = Number(market.change24h);
    const change24hPercent = Number(market.change24hPercent);
    const previousPrice = markPrice - change24h;
    if (
      markPrice <= 0 ||
      previousPrice <= 0 ||
      !Number.isFinite(previousPrice)
    ) {
      throw invalid('mark/change coherence');
    }
    const derivedPercent = (change24h / previousPrice) * 100;
    if (
      !Number.isFinite(derivedPercent) ||
      Math.abs(change24hPercent - derivedPercent) >
        GLOBAL_SNAPSHOT_PERCENT_TOLERANCE
    ) {
      throw invalid('change24hPercent coherence');
    }

    const openInterestBase = Number(market.openInterestBase);
    const openInterestUsd = Number(market.openInterestUsd);
    const derivedOpenInterestUsd = openInterestBase * markPrice;
    const openInterestRelativeError =
      Math.abs(openInterestUsd - derivedOpenInterestUsd) /
      Math.max(1, derivedOpenInterestUsd);
    if (
      !Number.isFinite(derivedOpenInterestUsd) ||
      !Number.isFinite(openInterestRelativeError) ||
      openInterestRelativeError >
        GLOBAL_SNAPSHOT_OPEN_INTEREST_RELATIVE_TOLERANCE
    ) {
      throw invalid('openInterestUsd coherence');
    }
    for (const [field, values] of [
      ['categories', market.categories],
      ['keywords', market.keywords],
      ['tags', market.tags],
    ] as const) {
      if (
        values.some((value) => value.length === 0) ||
        new Set(values).size !== values.length
      ) {
        throw invalid(field);
      }
    }
    if (
      market.marketType !== null &&
      !VALID_MARKET_TYPES.has(market.marketType)
    ) {
      throw invalid('marketType');
    }
    for (const [field, value] of [
      ['name', market.name],
      ['description', market.description],
      ['iconUrl', market.iconUrl],
    ] as const) {
      if (value !== null && value.length === 0) {
        throw invalid(field);
      }
    }
    let previousTrendTimestamp = -1;
    for (const [timestamp, price] of market.trend) {
      if (
        !this.#isNonNegativeSafeInteger(timestamp) ||
        timestamp < MINIMUM_EPOCH_MILLISECONDS ||
        timestamp > generatedAt ||
        timestamp <= previousTrendTimestamp ||
        !NON_NEGATIVE_DECIMAL_PATTERN.test(price) ||
        !Number.isFinite(Number(price)) ||
        Number(price) <= 0
      ) {
        throw invalid('trend');
      }
      previousTrendTimestamp = timestamp;
    }
  }

  #mapSnapshotMarket(
    market: GlobalSnapshotMarket,
    sourceExpiresAt: number,
  ): PerpsMarketData {
    const formatters = this.#deps.marketDataFormatters;
    // The current Terminal monitor derives both change fields from markPx.
    // Use markPrice for the summary row so price and change share one source
    // semantic. midPrice remains validated for future live-price consumers.
    const price = Number(market.markPrice);
    const change24h = Number(market.change24h);
    const change24hPercent = Number(market.change24hPercent);
    const volume = Number(market.volume24hUsd);
    const openInterestUsd = Number(market.openInterestUsd);
    const isHip3 = market.dex !== 'main';
    const marketType =
      market.marketType === null
        ? undefined
        : (market.marketType as TerminalAssetMetadata['marketType']);

    return {
      symbol: market.symbol,
      name: market.name ?? market.symbol,
      ...(market.description !== null && {
        description: market.description,
      }),
      maxLeverage: `${String(market.maxLeverage)}x`,
      price: formatters.formatPerpsFiat(price, {
        ranges: formatters.priceRangesUniversal,
      }),
      change24h: formatChange(change24h, formatters),
      change24hPercent: formatters.formatPercentage(change24hPercent),
      volume: formatters.formatVolume(volume),
      openInterest: formatters.formatVolume(openInterestUsd),
      fundingRate: Number(market.fundingRate),
      marketSource: isHip3 ? market.dex : undefined,
      marketType,
      isHip3,
      isNewMarket: isHip3 && marketType === undefined,
      ...(market.keywords.length > 0 && { keywords: market.keywords }),
      ...(market.tags.length > 0 && { tags: market.tags }),
      ...(market.categories.length > 0 && { categories: market.categories }),
      ...(market.listedAt !== null && { listedAt: market.listedAt }),
      trend: market.trend,
      dataSource: 'terminal-global-snapshot-mark',
      sourceExpiresAt,
    };
  }

  #cloneGlobalSnapshotResult(
    result: PerpsGlobalSnapshotResult,
  ): PerpsGlobalSnapshotResult {
    return {
      expiresAt: result.expiresAt,
      markets: clonePerpsMarketData(result.markets),
    };
  }

  #isNonNegativeSafeInteger(value: unknown): value is number {
    return (
      typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    );
  }

  #isPositiveSafeInteger(value: unknown): value is number {
    return this.#isNonNegativeSafeInteger(value) && value > 0;
  }

  /**
   * Invalidate the internal cache so the next fetch hits the network.
   */
  clearCache(): void {
    this.#cache = null;
    this.#globalSnapshotGeneration += 1;
    this.#globalSnapshotCache.clear();
    this.#globalSnapshotInFlight.clear();
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
      if (Array.isArray(item.categories) && item.categories.length > 0) {
        entry.categories = item.categories;
      }
      if (
        typeof item.marketType === 'string' &&
        VALID_MARKET_TYPES.has(item.marketType)
      ) {
        entry.marketType =
          item.marketType as TerminalAssetMetadata['marketType'];
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
          data: {
            url: method.includes('globalSnapshot')
              ? this.#deps.terminalApi?.globalSnapshotUrl
              : (this.#deps.terminalApi?.marketDataUrl ??
                this.#deps.terminalApiUrl),
          },
        },
      },
    );
  }
}
