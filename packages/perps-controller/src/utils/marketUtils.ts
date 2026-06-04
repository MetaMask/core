import { MarketCategory } from '../types';
import type { MarketType, MarketTypeFilter, PerpsMarketData } from '../types';
import type { CandleData, CandleStick } from '../types/perps-types';

/**
 * Stock-like market categories that share the 'stocks' UI filter and follow
 * traditional market hours. These replaced the former 'equity' `MarketType`.
 */
export const STOCK_LIKE_MARKET_TYPES: ReadonlySet<MarketType> = new Set([
  MarketCategory.Stock,
  MarketCategory.PreIpo,
  MarketCategory.Index,
  MarketCategory.Etf,
]);

/**
 * Check whether a market type is a stock-like asset (stock, pre-ipo, index,
 * etf). Stock-like assets share the 'stocks' category filter and follow
 * traditional market hours.
 *
 * @param marketType - The market type from {@link PerpsMarketData}.
 * @returns True if the asset is a stock, pre-ipo, index, or etf.
 */
export const isEquityAsset = (marketType?: string): boolean =>
  marketType !== undefined &&
  STOCK_LIKE_MARKET_TYPES.has(marketType as MarketType);

/**
 * Resolve the category filter pill to pre-select for a given market.
 *
 * Maps the {@link MarketCategory} data model onto the UI {@link MarketTypeFilter}
 * pills. Stock-like categories (stock, pre-ipo, index, etf) collapse to the
 * single 'stocks' pill via {@link isEquityAsset}. Any HIP-3 signal — `isHip3`,
 * `isNewMarket`, or a `marketSource` DEX id — on an otherwise-uncategorized
 * market resolves to 'all' rather than 'crypto', because the crypto pill only
 * contains main-DEX (non-HIP-3) markets. Only true main-DEX markets resolve to
 * 'crypto'.
 *
 * Centralised here so consumers (e.g. category shortcuts, related markets) share
 * one classification instead of re-deriving it per client and drifting as new
 * categories are added.
 *
 * @param market - Market data (marketType, isNewMarket, isHip3, marketSource).
 * @returns The market type filter to apply.
 */
export const getMarketTypeFilter = (
  market: Pick<
    PerpsMarketData,
    'marketType' | 'isNewMarket' | 'isHip3' | 'marketSource'
  >,
): MarketTypeFilter => {
  if (isEquityAsset(market.marketType)) {
    return 'stocks';
  }
  if (market.marketType === MarketCategory.Commodity) {
    return 'commodities';
  }
  if (market.marketType === MarketCategory.Forex) {
    return 'forex';
  }
  if (market.isNewMarket || market.isHip3 || market.marketSource) {
    return 'all';
  }
  return 'crypto';
};

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
