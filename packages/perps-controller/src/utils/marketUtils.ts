import { MARKET_CATEGORIES, MarketCategory } from '../types';
import type {
  GetMarketDataWithPricesParams,
  MarketTypeFilter,
  PerpsMarketData,
} from '../types';
import type { CandleData, CandleStick } from '../types/perps-types';
import { sortMarkets } from './sortMarkets';

// ============================================================================
// Market category classification (pure functions)
// No service dependencies — pure data transformations that can be tested and
// reused independently. `matchesCategory` is the single source of truth for the
// UI category model; `getMarketTypeFilter` is its inverse.
// ============================================================================

/**
 * Returns true when a market matches the given UI filter category.
 *
 * @param market - The market data to test.
 * @param category - The filter category to test against.
 * @returns Whether the market matches the category.
 */
export function matchesCategory(
  market: PerpsMarketData,
  category: MarketTypeFilter,
): boolean {
  switch (category) {
    case 'all':
      return true;
    case 'new':
      return market.isNewMarket === true;
    case 'crypto':
      // Includes non-HIP3 markets AND HIP-3 assets explicitly typed as CryptoCurrency.
      return (
        !market.isHip3 || market.marketType === MarketCategory.CryptoCurrency
      );
    case 'stocks':
      return market.marketType === MarketCategory.Stock;
    case 'pre-ipo':
      return market.marketType === MarketCategory.PreIpo;
    case 'indices':
      return market.marketType === MarketCategory.Index;
    case 'etfs':
      return market.marketType === MarketCategory.Etf;
    case 'commodities':
      return market.marketType === MarketCategory.Commodity;
    case 'forex':
      return market.marketType === MarketCategory.Forex;
    default:
      return true;
  }
}

/**
 * Resolve the category filter pill for a given market — the inverse of
 * {@link matchesCategory}. Returns the granular data-model filter (e.g. 'etfs',
 * 'indices', 'pre-ipo', 'stocks', 'commodities', 'forex', 'crypto'); markets
 * with no matching category (uncategorized HIP-3 / new markets) fall back to
 * 'all' so the opened tab always contains the market.
 *
 * Centralised as the single source of truth so consumers (e.g. category
 * shortcuts, related markets) share one classification instead of re-deriving
 * it per client and drifting as new categories are added.
 *
 * @param market - The market data to classify.
 * @returns The market type filter to apply.
 */
export function getMarketTypeFilter(market: PerpsMarketData): MarketTypeFilter {
  return (
    MARKET_CATEGORIES.find((category) => matchesCategory(market, category)) ??
    'all'
  );
}

/**
 * Applies optional category filtering, sorting, and limit to a list of markets.
 *
 * @param markets - Source market array.
 * @param params - Optional filter/sort/limit params.
 * @returns Filtered, sorted, and/or sliced market array.
 */
export function applyMarketFilters(
  markets: PerpsMarketData[],
  params?: GetMarketDataWithPricesParams,
): PerpsMarketData[] {
  let result = markets;

  if (params?.categories?.length) {
    const { categories } = params;
    result = result.filter((market) =>
      // A market is included if it matches ANY of the requested categories.
      categories.some((category) => matchesCategory(market, category)),
    );
  }

  if (params?.excludeSymbols?.length) {
    const excluded = new Set(params.excludeSymbols);
    result = result.filter((market) => !excluded.has(market.symbol));
  }

  if (params?.sortBy) {
    result = sortMarkets({
      markets: result,
      sortBy: params.sortBy,
      direction: params.direction,
    });
  }

  if (params?.limit !== undefined) {
    result = result.slice(0, params.limit);
  }

  return result;
}

/**
 * Maximum length for market filter patterns (prevents DoS attacks)
 */
export const MAX_MARKET_PATTERN_LENGTH = 100;

export type MarketPatternMatcher = RegExp | string;

export type CompiledMarketPattern = {
  pattern: string;
  matcher: MarketPatternMatcher;
};

export const escapeRegex = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export const validateMarketPattern = (pattern: string): boolean => {
  if (!pattern || pattern.trim().length === 0) {
    throw new Error('Market pattern cannot be empty');
  }

  const normalizedPattern = pattern.trim();

  if (normalizedPattern.length > MAX_MARKET_PATTERN_LENGTH) {
    throw new Error(
      `Market pattern exceeds maximum length (${MAX_MARKET_PATTERN_LENGTH} chars): ${normalizedPattern}`,
    );
  }

  const dangerousChars = /[\\()[\]{}^$+?.|]/u;
  if (dangerousChars.test(normalizedPattern)) {
    throw new Error(
      `Market pattern contains invalid regex characters: ${normalizedPattern}`,
    );
  }

  const validPattern = /^[a-zA-Z0-9:_\-*]+$/u;
  if (!validPattern.test(normalizedPattern)) {
    throw new Error(
      `Market pattern contains invalid characters: ${normalizedPattern}`,
    );
  }

  return true;
};

export const compileMarketPattern = (pattern: string): MarketPatternMatcher => {
  const normalizedPattern = pattern.trim();
  validateMarketPattern(normalizedPattern);

  if (normalizedPattern.endsWith(':*')) {
    const prefix = normalizedPattern.slice(0, -2);
    return new RegExp(`^${escapeRegex(prefix)}:`, 'u');
  }

  if (!normalizedPattern.includes(':')) {
    return new RegExp(`^${escapeRegex(normalizedPattern)}:`, 'u');
  }

  return normalizedPattern;
};

export const matchesMarketPattern = (
  symbol: string,
  matcher: MarketPatternMatcher,
): boolean => {
  if (typeof matcher === 'string') {
    return symbol === matcher;
  }

  return matcher.test(symbol);
};

export const shouldIncludeMarket = (
  symbol: string,
  dex: string | null,
  hip3Enabled: boolean,
  compiledEnabledPatterns: CompiledMarketPattern[],
  compiledBlockedPatterns: CompiledMarketPattern[],
): boolean => {
  if (dex === null) {
    return true;
  }

  if (!hip3Enabled) {
    return false;
  }

  if (compiledEnabledPatterns.length > 0) {
    const whitelisted = compiledEnabledPatterns.some(({ matcher }) =>
      matchesMarketPattern(symbol, matcher),
    );
    if (!whitelisted) {
      return false;
    }
  }

  if (compiledBlockedPatterns.length === 0) {
    return true;
  }

  const blacklisted = compiledBlockedPatterns.some(({ matcher }) =>
    matchesMarketPattern(symbol, matcher),
  );

  return !blacklisted;
};

export const getPerpsDisplaySymbol = (symbol: string): string => {
  if (!symbol || typeof symbol !== 'string') {
    return symbol;
  }

  const colonIndex = symbol.indexOf(':');
  if (colonIndex > 0 && colonIndex < symbol.length - 1) {
    return symbol.substring(colonIndex + 1);
  }

  return symbol;
};

export const getPerpsDexFromSymbol = (symbol: string): string | null => {
  if (!symbol || typeof symbol !== 'string') {
    return null;
  }

  const colonIndex = symbol.indexOf(':');
  if (colonIndex > 0 && colonIndex < symbol.length - 1) {
    return symbol.substring(0, colonIndex);
  }

  return null;
};

type FundingCountdownParams = {
  nextFundingTime?: number;
  fundingIntervalHours?: number;
};

export const calculateFundingCountdown = (
  params?: FundingCountdownParams,
): string => {
  const now = new Date();
  const nowMs = now.getTime();

  if (params?.nextFundingTime && params.nextFundingTime > nowMs) {
    const msUntilFunding = params.nextFundingTime - nowMs;
    const hoursUntilFunding = msUntilFunding / (1000 * 60 * 60);

    if (hoursUntilFunding <= 1.1) {
      const totalSeconds = Math.floor(msUntilFunding / 1000);

      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const formattedHours = String(hours).padStart(2, '0');
      const formattedMinutes = String(minutes).padStart(2, '0');
      const formattedSeconds = String(seconds).padStart(2, '0');

      return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
    }
  }

  const utcMinutes = now.getUTCMinutes();
  const utcSeconds = now.getUTCSeconds();

  const minutesUntilNextHour = 59 - utcMinutes;
  const secondsUntilNextHour = 60 - utcSeconds;

  const finalSeconds = secondsUntilNextHour === 60 ? 0 : secondsUntilNextHour;
  const finalMinutes =
    secondsUntilNextHour === 60
      ? minutesUntilNextHour + 1
      : minutesUntilNextHour;

  const finalHours = finalMinutes === 60 ? 1 : 0;
  const adjustedMinutes = finalMinutes === 60 ? 0 : finalMinutes;

  const formattedHours = String(finalHours).padStart(2, '0');
  const formattedMinutes = String(adjustedMinutes).padStart(2, '0');
  const formattedSeconds = String(finalSeconds).padStart(2, '0');

  return `${formattedHours}:${formattedMinutes}:${formattedSeconds}`;
};

export const calculate24hHighLow = (
  candleData: CandleData | null,
): { high: number; low: number } => {
  if (!candleData?.candles || candleData.candles.length === 0) {
    return { high: 0, low: 0 };
  }

  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

  let last24hCandles = candleData.candles.filter(
    (candle: CandleStick) => candle.time >= twentyFourHoursAgo,
  );

  if (last24hCandles.length === 0) {
    last24hCandles = [...candleData.candles];
  }

  const highs = last24hCandles.map((candle: CandleStick) =>
    parseFloat(candle.high),
  );
  const lows = last24hCandles.map((candle: CandleStick) =>
    parseFloat(candle.low),
  );

  return {
    high: Math.max(...highs),
    low: Math.min(...lows),
  };
};

export const filterMarketsByQuery = (
  markets: PerpsMarketData[],
  searchQuery: string,
): PerpsMarketData[] => {
  if (!searchQuery?.trim()) {
    return markets;
  }

  const lowerQuery = searchQuery.toLowerCase().trim();

  return markets.filter(
    (market) =>
      market.symbol?.toLowerCase().includes(lowerQuery) ||
      market.name?.toLowerCase().includes(lowerQuery),
  );
};
