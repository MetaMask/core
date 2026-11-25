import type { Infer } from '@metamask/superstruct';
import {
  array,
  boolean,
  define,
  enums,
  is,
  nullable,
  number,
  object,
  optional,
  string,
  type,
  union,
  unknown,
} from '@metamask/superstruct';
import { bytesToHex, sha256, stringToBytes } from '@metamask/utils';

import {
  canonicalizeHyperLiquidDexes,
  HYPERLIQUID_VENUE_MARGIN_MODES,
  isUnrestrictedMarginMode,
} from '../constants/hyperLiquidConfig.js';
import {
  PERPS_CONSTANTS,
  TERMINAL_API_CONFIG,
} from '../constants/perpsConfig.js';
import { buildMarketNumericValues } from '../internal/marketNumericValues.js';
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
import {
  clonePerpsMarketData,
  getSnapshotMarketIdentity,
} from '../utils/marketUtils.js';

const VALID_MARKET_TYPES = new Set<string>(Object.values(MarketCategory));
const GLOBAL_SNAPSHOT_SCHEMA_VERSION = 4;
const GLOBAL_SNAPSHOT_CONSUMER_MAX_AGE_MS = 30_000;
const GLOBAL_SNAPSHOT_MAX_PAYLOAD_BYTES = 1_048_576;
const GLOBAL_SNAPSHOT_PERCENT_TOLERANCE = 0.01;
const GLOBAL_SNAPSHOT_MAX_FUTURE_CLOCK_SKEW_MS = 5_000;
const MINIMUM_EPOCH_MILLISECONDS = Date.UTC(2000, 0, 1);
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const NON_NEGATIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/u;
const DEX_PATTERN = /^(?:main|[a-z0-9][a-z0-9-]*)$/u;

const isTrend = (value: unknown): value is [number, string][] =>
  Array.isArray(value) &&
  value.every(
    (point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      typeof point[0] === 'number' &&
      !Number.isNaN(point[0]) &&
      typeof point[1] === 'string',
  );

// `array(tuple([number(), string()]))` makes superstruct create generators and
// copy its path/branch arrays for every point of every market, which dominated
// validation time on Hermes. One `define` checks the whole trend in one pass.
const TrendStruct = define<[number, string][]>('Trend', isTrend);

export const GlobalSnapshotMarketStruct = type({
  id: string(),
  symbol: string(),
  network: string(),
  provider: string(),
  dex: string(),
  name: nullable(string()),
  description: nullable(string()),
  iconUrl: nullable(string()),
  szDecimals: number(),
  maxLeverage: number(),
  markPrice: string(),
  price: string(),
  midPrice: nullable(string()),
  oraclePrice: string(),
  change24h: string(),
  changePercent24h: number(),
  change5m: nullable(string()),
  changePercent5m: nullable(number()),
  change1h: nullable(string()),
  changePercent1h: nullable(number()),
  funding: string(),
  volume24h: string(),
  openInterest: string(),
  category: nullable(string()),
  keywords: nullable(array(string())),
  tags: nullable(array(string())),
  listedAt: nullable(number()),
  trend: TrendStruct,
  onlyIsolated: optional(nullable(boolean())),
  marginMode: optional(nullable(enums(HYPERLIQUID_VENUE_MARGIN_MODES))),
  marketKey: optional(nullable(string())),
  priceScale: optional(nullable(number())),
  venueMarketId: optional(nullable(string())),
});

const GlobalSnapshotStruct = type({
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
  // Rows are checked by `assertSnapshotMarketTypes`, not by this struct.
  markets: array(unknown()),
});

type GlobalSnapshotMarket = Infer<typeof GlobalSnapshotMarketStruct>;
type GlobalSnapshot = Omit<Infer<typeof GlobalSnapshotStruct>, 'markets'> & {
  markets: GlobalSnapshotMarket[];
};

const REQUIRED_STRING_FIELDS = [
  'id',
  'symbol',
  'network',
  'provider',
  'dex',
  'markPrice',
  'price',
  'oraclePrice',
  'change24h',
  'funding',
  'volume24h',
  'openInterest',
];
const REQUIRED_NUMBER_FIELDS = [
  'szDecimals',
  'maxLeverage',
  'changePercent24h',
];
const NULLABLE_STRING_FIELDS = [
  'name',
  'description',
  'iconUrl',
  'midPrice',
  'change5m',
  'change1h',
  'category',
];
const NULLABLE_NUMBER_FIELDS = [
  'changePercent5m',
  'changePercent1h',
  'listedAt',
];
const NULLABLE_STRING_LIST_FIELDS = ['keywords', 'tags'];
const OPTIONAL_NULLABLE_FIELDS: [string, 'string' | 'number' | 'boolean'][] = [
  ['onlyIsolated', 'boolean'],
  ['marketKey', 'string'],
  ['venueMarketId', 'string'],
  ['priceScale', 'number'],
];

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && !Number.isNaN(value);

/**
 * Check every market row against `GlobalSnapshotMarketStruct`, field by field,
 * with plain `typeof` checks.
 *
 * `GlobalSnapshotMarketStruct` stays the schema and the source of the row type,
 * but running it over every row makes superstruct allocate several generators
 * and path copies per value, which blocked the Hermes JS thread for hundreds of
 * milliseconds per refresh. The tests assert that this check and the struct
 * accept and reject the same rows.
 *
 * @param markets - Raw market rows from the parsed snapshot.
 * @throws If any row does not match `GlobalSnapshotMarketStruct`.
 */
function assertSnapshotMarketTypes(
  markets: unknown[],
): asserts markets is GlobalSnapshotMarket[] {
  const valid = markets.every((row) => {
    if (typeof row !== 'object' || row === null) {
      return false;
    }
    const market = row as Record<string, unknown>;
    return (
      REQUIRED_STRING_FIELDS.every((name) => isString(market[name])) &&
      REQUIRED_NUMBER_FIELDS.every((name) => isNumber(market[name])) &&
      NULLABLE_STRING_FIELDS.every(
        (name) => market[name] === null || isString(market[name]),
      ) &&
      NULLABLE_NUMBER_FIELDS.every(
        (name) => market[name] === null || isNumber(market[name]),
      ) &&
      NULLABLE_STRING_LIST_FIELDS.every((name) => {
        const list = market[name];
        return list === null || (Array.isArray(list) && list.every(isString));
      }) &&
      isTrend(market.trend) &&
      OPTIONAL_NULLABLE_FIELDS.every(([name, kind]) => {
        const value = market[name];
        return (
          value === undefined ||
          value === null ||
          (kind === 'number' ? isNumber(value) : typeof value === kind)
        );
      }) &&
      (market.marginMode === undefined ||
        market.marginMode === null ||
        (HYPERLIQUID_VENUE_MARGIN_MODES as readonly unknown[]).includes(
          market.marginMode,
        ))
    );
  });
  if (!valid) {
    throw new Error('Terminal global snapshot failed schema validation');
  }
}

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
   * Fetch, authenticate by exact identity, and map a schema-v4 atomic market
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
      assertSnapshotMarketTypes(body.markets);
      return this.#validateAndMapGlobalSnapshot(
        body as GlobalSnapshot,
        identity,
        Date.now(),
      );
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

    const responseDexes = this.#normalizeDexes(
      snapshot.enabledDexes,
      identity.provider,
    );
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
      snapshot.generatedAt > now + GLOBAL_SNAPSHOT_MAX_FUTURE_CLOCK_SKEW_MS ||
      snapshot.receivedAt > now + GLOBAL_SNAPSHOT_MAX_FUTURE_CLOCK_SKEW_MS
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
    const mapped = snapshot.markets
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
      .map((market) =>
        this.#mapSnapshotMarket(market, identity.provider, expiresAt),
      );
    const markets = mapped.map((market) => market.marketData);
    const marketInfos = mapped.map((market) => market.marketInfo);
    if (identity.enabledDexes.some((dex) => !representedDexes.has(dex))) {
      throw new Error('Terminal global snapshot is missing a requested DEX');
    }
    if (markets.length === 0) {
      throw new Error('Terminal global snapshot has no tradable markets');
    }

    return { markets, marketInfos, expiresAt };
  }

  #validateRequestedIdentity(
    request: PerpsGlobalSnapshotRequest,
  ): PerpsGlobalSnapshotRequest {
    if (request.provider !== 'hyperliquid' && request.provider !== 'lighter') {
      throw new Error('Terminal global snapshot provider is unsupported');
    }
    if (request.network !== 'mainnet' && request.network !== 'testnet') {
      throw new Error('Terminal global snapshot network is unsupported');
    }
    return {
      provider: request.provider,
      network: request.network,
      enabledDexes: this.#normalizeDexes(
        request.enabledDexes,
        request.provider,
      ),
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

  #normalizeDexes(
    dexes: string[],
    provider: PerpsGlobalSnapshotRequest['provider'],
  ): string[] {
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
    if (!normalized.includes('main')) {
      throw new Error('Terminal global snapshot requires the main DEX');
    }
    if (provider === 'lighter') {
      // Lighter has one order-book venue and no HIP-3 style DEXes.
      if (normalized.length !== 1) {
        throw new Error('Terminal global snapshot Lighter DEX must be main');
      }
      return normalized;
    }
    return canonicalizeHyperLiquidDexes(normalized);
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
    if (market.id.length === 0) {
      throw invalid('id');
    }
    if (market.network !== identity.network) {
      throw invalid('network');
    }
    if (!identity.enabledDexes.includes(market.dex)) {
      throw invalid('dex');
    }
    // `provider` is the venue, including HyperLiquid HIP-3 markets whose
    // DEX lives in `dex`: HyperLiquid rows are `provider: "hyperliquid"` for
    // both `main` and `xyz`; HIP-3 identity is `dex`, not `provider`.
    if (market.provider !== identity.provider) {
      throw invalid('provider');
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
      (market.listedAt !== null &&
        (!this.#isNonNegativeSafeInteger(market.listedAt) ||
          market.listedAt < MINIMUM_EPOCH_MILLISECONDS ||
          market.listedAt > generatedAt))
    ) {
      throw invalid('integer field');
    }

    const decimalFields: [string, string, boolean][] = [
      ['markPrice', market.markPrice, true],
      ['price', market.price, true],
      ['oraclePrice', market.oraclePrice, true],
      ['change24h', market.change24h, false],
      ['volume24h', market.volume24h, true],
      ['openInterest', market.openInterest, true],
      ['funding', market.funding, false],
    ];
    if (market.midPrice !== null) {
      decimalFields.push(['midPrice', market.midPrice, true]);
    }
    if (market.change5m !== null) {
      decimalFields.push(['change5m', market.change5m, false]);
    }
    if (market.change1h !== null) {
      decimalFields.push(['change1h', market.change1h, false]);
    }
    for (const [field, value, nonNegative] of decimalFields) {
      const pattern = nonNegative
        ? NON_NEGATIVE_DECIMAL_PATTERN
        : DECIMAL_PATTERN;
      if (!pattern.test(value) || !Number.isFinite(Number(value))) {
        throw invalid(field);
      }
    }
    if (market.price !== market.markPrice) {
      throw invalid('deprecated price alias');
    }
    if (
      Number(market.oraclePrice) <= 0 ||
      (market.midPrice !== null && Number(market.midPrice) <= 0)
    ) {
      throw invalid('reference price');
    }
    const price = Number(market.markPrice);
    const change24h = Number(market.change24h);
    const { changePercent24h } = market;
    if (price <= 0) {
      throw invalid('markPrice');
    }
    if (identity.provider === 'lighter') {
      // Lighter measures daily change from its last trade. The snapshot has
      // the mark price but omits the last trade price and rounds the delta.
      if (
        !Number.isFinite(changePercent24h) ||
        changePercent24h <= -100 ||
        (change24h !== 0 &&
          Math.sign(change24h) !== Math.sign(changePercent24h))
      ) {
        throw invalid('changePercent24h coherence');
      }
    } else {
      const previousPrice = price - change24h;
      if (previousPrice <= 0 || !Number.isFinite(previousPrice)) {
        throw invalid('mark/change coherence');
      }
      const derivedPercent = (change24h / previousPrice) * 100;
      if (
        !Number.isFinite(derivedPercent) ||
        !Number.isFinite(changePercent24h) ||
        Math.abs(changePercent24h - derivedPercent) >
          GLOBAL_SNAPSHOT_PERCENT_TOLERANCE
      ) {
        throw invalid('changePercent24h coherence');
      }
    }
    this.#validateRollingPair(
      market.change5m,
      market.changePercent5m,
      'change5m',
      invalid,
    );
    this.#validateRollingPair(
      market.change1h,
      market.changePercent1h,
      'change1h',
      invalid,
    );
    for (const [field, values] of [
      ['keywords', market.keywords],
      ['tags', market.tags],
    ] as const) {
      if (
        values !== null &&
        (values.some((value) => value.length === 0) ||
          new Set(values).size !== values.length)
      ) {
        throw invalid(field);
      }
    }
    for (const [field, value] of [
      ['name', market.name],
      ['description', market.description],
      ['iconUrl', market.iconUrl],
      ['category', market.category],
      ['marketKey', market.marketKey],
    ] as const) {
      if (value?.length === 0) {
        throw invalid(field);
      }
    }
    if (
      market.priceScale !== undefined &&
      market.priceScale !== null &&
      (!Number.isFinite(market.priceScale) || market.priceScale <= 0)
    ) {
      throw invalid('priceScale');
    }
    if (market.venueMarketId === '') {
      throw invalid('venueMarketId');
    }
    let previousTrendTimestamp = -1;
    for (const [timestamp, trendPrice] of market.trend) {
      if (
        !this.#isNonNegativeSafeInteger(timestamp) ||
        timestamp < MINIMUM_EPOCH_MILLISECONDS ||
        timestamp > generatedAt ||
        timestamp <= previousTrendTimestamp ||
        !NON_NEGATIVE_DECIMAL_PATTERN.test(trendPrice) ||
        !Number.isFinite(Number(trendPrice)) ||
        Number(trendPrice) <= 0
      ) {
        throw invalid('trend');
      }
      previousTrendTimestamp = timestamp;
    }
  }

  #mapSnapshotMarket(
    market: GlobalSnapshotMarket,
    provider: PerpsGlobalSnapshotRequest['provider'],
    sourceExpiresAt: number,
  ): { marketData: PerpsMarketData; marketInfo: MarketInfo } {
    const formatters = this.#deps.marketDataFormatters;
    // Keep both provider price semantics explicit in the wire contract. Core
    // maps markPrice to its UI price while retaining validation of midPrice.
    const price = Number(market.markPrice);
    const change24h = Number(market.change24h);
    const volume = Number(market.volume24h);
    const openInterest = Number(market.openInterest);
    const identity = getSnapshotMarketIdentity(market);
    const isHip3 = market.dex !== 'main';
    const marketType = this.#marketTypeFor(
      provider,
      market.dex,
      market.category,
    );
    const change5m = this.#mapRollingWindow(
      market.change5m,
      market.changePercent5m,
      formatters,
    );
    const change1h = this.#mapRollingWindow(
      market.change1h,
      market.changePercent1h,
      formatters,
    );

    return {
      marketData: {
        id: market.id,
        providerId: provider,
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
        change24hPercent: formatters.formatPercentage(market.changePercent24h),
        change5m: change5m.change,
        changePercent5m: change5m.percent,
        change1h: change1h.change,
        changePercent1h: change1h.percent,
        volume: formatters.formatVolume(volume),
        openInterest: formatters.formatVolume(openInterest),
        numericValues: buildMarketNumericValues({
          price,
          change24hPercent: market.changePercent24h,
          volume,
          openInterest,
        }),
        fundingRate: Number(market.funding),
        marketSource: isHip3 ? market.dex : undefined,
        marketType,
        isHip3,
        isNewMarket: isHip3 && marketType === undefined,
        ...(market.keywords && { keywords: market.keywords }),
        ...(market.tags && { tags: market.tags }),
        ...(market.category && { categories: [market.category] }),
        ...(market.listedAt !== null && { listedAt: market.listedAt }),
        ...(market.iconUrl !== null && { iconUrl: market.iconUrl }),
        ...identity,
        trend: market.trend,
        dataSource: 'terminal-global-snapshot-mark',
        sourceExpiresAt,
      },
      // v4 markets carry szDecimals and maxLeverage. They do not carry a margin table.
      marketInfo: {
        name: market.symbol,
        szDecimals: market.szDecimals,
        maxLeverage: market.maxLeverage,
        marginTableId: 0,
        ...identity,
        ...(market.onlyIsolated === true && { onlyIsolated: true as const }),
        // `normal` is no restriction, so it stays out of `marginMode`.
        ...(!isUnrestrictedMarginMode(market.marginMode) && {
          marginMode: market.marginMode,
        }),
      },
    };
  }

  #validateRollingPair(
    absolute: string | null,
    percent: number | null,
    field: string,
    invalid: (name: string) => Error,
  ): void {
    if (
      (absolute === null) !== (percent === null) ||
      (percent !== null && !Number.isFinite(percent))
    ) {
      throw invalid(`${field} pair`);
    }
  }

  #mapRollingWindow(
    absolute: string | null,
    percent: number | null,
    formatters: PerpsPlatformDependencies['marketDataFormatters'],
  ): { change: string; percent: string } {
    if (absolute === null || percent === null) {
      return {
        change: PERPS_CONSTANTS.FallbackDataDisplay,
        percent: PERPS_CONSTANTS.FallbackPercentageDisplay,
      };
    }
    return {
      change: formatChange(Number(absolute), formatters),
      percent: formatters.formatPercentage(percent),
    };
  }

  #marketTypeFor(
    provider: PerpsGlobalSnapshotRequest['provider'],
    dex: string,
    category: string | null,
  ): TerminalAssetMetadata['marketType'] | undefined {
    // Only HyperLiquid's main DEX is crypto-only. Lighter lists stocks, FX
    // and commodities on its single DEX, so its category decides.
    if (provider === 'hyperliquid' && dex === 'main') {
      return MarketCategory.CryptoCurrency;
    }
    if (category === 'stocks') {
      return MarketCategory.Stock;
    }
    if (category === 'pre_ipo') {
      return MarketCategory.PreIpo;
    }
    if (category && VALID_MARKET_TYPES.has(category)) {
      return category as TerminalAssetMetadata['marketType'];
    }
    return undefined;
  }

  #cloneGlobalSnapshotResult(
    result: PerpsGlobalSnapshotResult,
  ): PerpsGlobalSnapshotResult {
    return {
      expiresAt: result.expiresAt,
      markets: clonePerpsMarketData(result.markets),
      marketInfos: result.marketInfos.map((market) => ({ ...market })),
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
