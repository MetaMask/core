import {
  MARKET_SORTING_CONFIG,
  PERPS_CONSTANTS,
} from '../constants/perpsConfig.js';
import { getPerpsDisplaySymbol } from '../internal/perpsDisplaySymbol.js';
import type {
  MarketSortField,
  PerpsMarketData,
  SortDirection,
} from '../types/index.js';

export type SortMarketsParams = {
  markets: PerpsMarketData[];
  sortBy: MarketSortField;
  direction?: SortDirection;
  /** Where markets without a value for `sortBy` go: `last` (default) in either direction. */
  missing?: 'last';
};

const VOLUME_SUFFIX_REGEX = /\$?([\d.,]+)([KMBT])?/u;

const multipliers: Record<string, number> = {
  K: 1e3,
  M: 1e6,
  B: 1e9,
  T: 1e12,
} as const;

const removeCommas = (str: string): string => str.replace(/,/gu, '');

/**
 * Parse a formatted volume string (e.g., "$1.5M", "$2.3B") to a numeric value.
 * Extracted from hooks/usePerpsMarkets.ts for portability.
 *
 * @param volumeStr - The formatted volume string to parse.
 * @returns The numeric volume value, or -1 if unparseable.
 */
export const parseVolume = (volumeStr: string | undefined): number => {
  if (!volumeStr) {
    return -1;
  }

  if (volumeStr === PERPS_CONSTANTS.FallbackPriceDisplay) {
    return -1;
  }
  if (volumeStr === '$<1') {
    return 0.5;
  }

  const suffixMatch = VOLUME_SUFFIX_REGEX.exec(volumeStr);
  if (suffixMatch) {
    const [, numberPart, suffix] = suffixMatch;
    const baseValue = Number.parseFloat(removeCommas(numberPart));

    if (Number.isNaN(baseValue)) {
      return -1;
    }

    return suffix ? baseValue * multipliers[suffix] : baseValue;
  }

  // Fallback: try to parse as plain number
  const cleaned = volumeStr.replace(/[$,]/gu, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isNaN(parsed) ? -1 : parsed;
};

const compareText = (first: string, second: string): number =>
  first.localeCompare(second, undefined, { sensitivity: 'base' });

const toFinite = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isFinite(value) ? value : undefined;

const toNonNegative = (value: number | undefined): number | undefined =>
  value !== undefined && value >= 0 ? toFinite(value) : undefined;

// parseVolume reports an unreadable display string as -1.
const parseAmount = (display: string | undefined): number | undefined =>
  toNonNegative(parseVolume(display));

/**
 * Unformatted value of a market row for a numeric sort field. Reads
 * `PerpsMarketData.numericValues`. Only a row built without `numericValues`
 * falls back to parsing its display strings: producers write placeholders such
 * as `-100.00%`, `+0.00%` or `$0` there when a value is missing.
 *
 * @param market - The market row.
 * @param sortBy - The numeric field.
 * @returns The value, or undefined when the market has none.
 */
const getNumericSortValue = (
  market: PerpsMarketData,
  sortBy: Exclude<MarketSortField, 'name'>,
): number | undefined => {
  const values = market.numericValues;
  switch (sortBy) {
    case MARKET_SORTING_CONFIG.SortFields.Volume:
      return values ? toNonNegative(values.volume) : parseAmount(market.volume);
    case MARKET_SORTING_CONFIG.SortFields.OpenInterest:
      return values
        ? toNonNegative(values.openInterest)
        : parseAmount(market.openInterest);
    case 'price':
      return values ? toNonNegative(values.price) : parseAmount(market.price);
    case MARKET_SORTING_CONFIG.SortFields.PriceChange:
      return toFinite(
        values
          ? values.change24hPercent
          : Number.parseFloat(market.change24hPercent?.replace(/[%+]/gu, '')),
      );
    case MARKET_SORTING_CONFIG.SortFields.FundingRate:
      return toFinite(market.fundingRate);
    default:
      return undefined;
  }
};

/**
 * Sorts markets by an unformatted value: volume, price change, funding rate,
 * open interest or price, or by `name`: the display symbol, case-insensitive,
 * then the full symbol. Markets without a value for the field sort last in
 * either direction (`missing: 'last'`, the only and default placement).
 * Rows with `numericValues` sort on them only; their display strings are not
 * parsed.
 *
 * @param options0 - The sorting configuration.
 * @param options0.markets - The array of market data to sort.
 * @param options0.sortBy - The field to sort by.
 * @param options0.direction - The sort direction: defaults to `asc` for
 * `name` and `desc` for every other field.
 * @returns A new sorted array of market data.
 */
export const sortMarkets = ({
  markets,
  sortBy,
  direction = sortBy === 'name'
    ? 'asc'
    : MARKET_SORTING_CONFIG.DefaultDirection,
}: SortMarketsParams): PerpsMarketData[] => {
  const sign = direction === MARKET_SORTING_CONFIG.DefaultDirection ? -1 : 1;

  return [...markets].sort((a, b) => {
    if (sortBy === 'name') {
      return (
        sign *
        (compareText(
          getPerpsDisplaySymbol(a.symbol),
          getPerpsDisplaySymbol(b.symbol),
        ) || compareText(a.symbol, b.symbol))
      );
    }
    const valueA = getNumericSortValue(a, sortBy);
    const valueB = getNumericSortValue(b, sortBy);
    if (valueA === undefined || valueB === undefined) {
      return Number(valueA === undefined) - Number(valueB === undefined);
    }
    return sign * (valueA - valueB);
  });
};
