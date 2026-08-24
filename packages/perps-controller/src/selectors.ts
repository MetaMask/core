import { createSelector } from 'reselect';

import { VISIBLE_CANDLE_COUNT_CONFIG } from './constants/chartConfig.js';
import {
  MARKET_SORTING_CONFIG,
  PERPS_CONSTANTS,
  SortOptionId,
  DEFAULT_ORDER_BOOK_PREFERENCES,
  DEFAULT_PRO_LAYOUT_PREFERENCES,
  DEFAULT_PERPS_MODE,
  DEFAULT_SELECTED_ORDER_TYPE,
} from './constants/perpsConfig.js';
import type {
  OrderBookPreferences,
  PerpsMode,
  ProLayoutPreferences,
} from './constants/perpsConfig.js';
import type { PerpsControllerState } from './PerpsController.js';
import type {
  OrderType,
  PerpsSelectedPaymentToken,
  SortDirection,
} from './types/index.js';

/**
 * Select whether the user is a first-time perps user
 *
 * @param state - PerpsController state
 * @returns true if user is first-time, false otherwise
 */
export const selectIsFirstTimeUser = (
  state: PerpsControllerState | undefined,
): boolean => {
  if (state?.isTestnet) {
    return state?.isFirstTimeUser?.testnet ?? true;
  }
  return state?.isFirstTimeUser?.mainnet ?? true;
};

/**
 * Select whether user has ever placed their first successful order
 *
 * @param state - PerpsController state
 * @returns boolean indicating if first order was placed
 */
export const selectHasPlacedFirstOrder = (
  state: PerpsControllerState,
): boolean => {
  if (state?.isTestnet) {
    return state?.hasPlacedFirstOrder?.testnet ?? false;
  }
  return state?.hasPlacedFirstOrder?.mainnet ?? false;
};

/**
 * Select watchlist markets for the current network
 *
 * @param state - PerpsController state
 * @returns Array of watchlist market symbols for current network
 */
export const selectWatchlistMarkets = (
  state: PerpsControllerState,
): string[] => {
  if (state?.isTestnet) {
    return state?.watchlistMarkets?.testnet ?? [];
  }
  return state?.watchlistMarkets?.mainnet ?? [];
};

/**
 * Check if a specific market is in the watchlist on the current network
 *
 * @param state - PerpsController state
 * @param symbol - Market symbol to check (e.g., 'BTC', 'ETH')
 * @returns boolean indicating if market is in watchlist
 */
export const selectIsWatchlistMarket = (
  state: PerpsControllerState,
  symbol: string,
): boolean => {
  const watchlist = selectWatchlistMarkets(state);
  return watchlist.includes(symbol);
};

/**
 * Select recently viewed markets for the current network.
 *
 * Returns up to PERPS_CONSTANTS.RecentlyViewedMarketsLimit symbols, ordered
 * newest-first, filtered to entries within PERPS_CONSTANTS.RecentlyViewedMarketsTtlMs
 * (24 hours). Returns an empty array when no qualifying entries exist.
 *
 * @param state - PerpsController state
 * @returns Ordered array of recently viewed market symbols
 */
export const selectRecentlyViewedMarkets = (
  state: PerpsControllerState,
): string[] => {
  const network = state?.isTestnet ? 'testnet' : 'mainnet';
  const entries = state?.recentlyViewedMarkets?.[network] ?? [];
  const cutoff = Date.now() - PERPS_CONSTANTS.RecentlyViewedMarketsTtlMs;

  return entries
    .filter((entry) => entry.viewedAt > cutoff)
    .map((entry) => entry.symbol)
    .slice(0, PERPS_CONSTANTS.RecentlyViewedMarketsLimit);
};

/**
 * Select trade configuration for a specific market on the current network.
 * Uses memoization to return stable object references and prevent unnecessary re-renders.
 *
 * Usage: selectTradeConfiguration(state, coin)
 *
 * @param state - The perps controller state.
 * @param coin - The market coin symbol.
 * @returns The trade configuration for the specified market, or undefined.
 */

export const selectTradeConfiguration = createSelector(
  [
    (state: PerpsControllerState): boolean | undefined => state?.isTestnet,
    (
      state: PerpsControllerState,
      _coin: string,
    ): PerpsControllerState['tradeConfigurations'] | undefined =>
      state?.tradeConfigurations,
    (_state: PerpsControllerState, coin: string): string => coin,
  ],
  (isTestnet, configs, coin): { leverage?: number } | undefined => {
    const network = isTestnet ? 'testnet' : 'mainnet';
    const config = configs?.[network]?.[coin];

    if (!config?.leverage) {
      return undefined;
    }

    return { leverage: config.leverage };
  },
);

/**
 * Pending trade configuration as returned to consumers (timestamp stripped).
 */
type PendingTradeConfiguration = {
  amount?: string;
  leverage?: number;
  takeProfitPrice?: string;
  stopLossPrice?: string;
  limitPrice?: string;
  orderType?: OrderType;
  reduceOnly?: boolean;
  selectedPaymentToken?: PerpsSelectedPaymentToken | null;
};

/**
 * Memoized extractor for the raw pending trade configuration of a market.
 *
 * Keyed on `isTestnet`, `tradeConfigurations`, and `coin` so it yields a stable
 * object reference (both the stripped `config` and its `timestamp`) while those
 * inputs are unchanged. The TTL is deliberately NOT evaluated here: because the
 * result is memoized, evaluating expiry inside this selector would freeze the
 * `Date.now()` check between input changes. Expiry is applied per-call by
 * `selectPendingTradeConfiguration` instead.
 *
 * @param state - The perps controller state.
 * @param coin - The market coin symbol.
 * @returns The stripped config and its save timestamp, or undefined.
 */

const selectRawPendingTradeConfiguration = createSelector(
  [
    (state: PerpsControllerState): boolean | undefined => state?.isTestnet,
    (
      state: PerpsControllerState,
      _coin: string,
    ): PerpsControllerState['tradeConfigurations'] | undefined =>
      state?.tradeConfigurations,
    (_state: PerpsControllerState, coin: string): string => coin,
  ],
  (
    isTestnet,
    configs,
    coin,
  ): { timestamp: number; config: PendingTradeConfiguration } | undefined => {
    const network = isTestnet ? 'testnet' : 'mainnet';
    const config = configs?.[network]?.[coin]?.pendingConfig;

    if (!config) {
      return undefined;
    }

    const { timestamp, ...configWithoutTimestamp } = config;
    return { timestamp, config: configWithoutTimestamp };
  },
);

/**
 * Select pending trade configuration for a specific market on the current network.
 * Returns undefined if config doesn't exist or has expired.
 *
 * The underlying data extraction is memoized for stable object references, but
 * the TTL is checked on every call (using `Date.now()`) so expiry stays accurate
 * even when the memoized inputs have not changed. This mirrors
 * `PerpsController.getPendingTradeConfiguration`, which also evaluates time on
 * every call.
 *
 * Usage: selectPendingTradeConfiguration(state, coin)
 *
 * @param state - The perps controller state.
 * @param coin - The market coin symbol.
 * @returns The pending trade configuration, or undefined if expired or not found.
 */
export const selectPendingTradeConfiguration = (
  state: PerpsControllerState,
  coin: string,
): PendingTradeConfiguration | undefined => {
  const raw = selectRawPendingTradeConfiguration(state, coin);

  if (!raw) {
    return undefined;
  }

  const age = Date.now() - raw.timestamp;

  if (age > PERPS_CONSTANTS.PendingTradeConfigurationTtlMs) {
    // Config expired, return undefined
    return undefined;
  }

  return raw.config;
};

/**
 * Select market filter preferences (network-independent)
 *
 * @param state - PerpsController state
 * @returns Sort/filter preferences object with optionId and direction
 */
export const selectMarketFilterPreferences = (
  state: PerpsControllerState,
): { optionId: SortOptionId; direction: SortDirection } => {
  const pref = state?.marketFilterPreferences;

  // Handle legacy string format (backward compatibility)
  if (typeof pref === 'string') {
    // Map legacy compound IDs to new format
    // Old format: 'priceChange-desc' or 'priceChange-asc'
    // New format: { optionId: 'priceChange', direction: 'desc'/'asc' }
    if (pref === 'priceChange-desc') {
      return {
        optionId: 'priceChange',
        direction: 'desc',
      };
    }
    if (pref === 'priceChange-asc') {
      return {
        optionId: 'priceChange',
        direction: 'asc',
      };
    }

    // Handle other simple legacy strings (e.g., 'volume', 'openInterest', etc.)
    return {
      optionId: pref as SortOptionId,
      direction: MARKET_SORTING_CONFIG.DefaultDirection,
    };
  }

  // Return new object format or default
  return (
    pref ?? {
      optionId: MARKET_SORTING_CONFIG.DefaultSortOptionId,
      direction: MARKET_SORTING_CONFIG.DefaultDirection,
    }
  );
};

/**
 * Select pro-mode layout preferences (network-independent).
 *
 * Merges over defaults so callers always receive a fully-populated object,
 * even when the state slice (or a nested field) is missing.
 *
 * @param state - PerpsController state
 * @returns The pro-mode layout preferences object
 */
export const selectProLayoutPreferences = (
  state: PerpsControllerState,
): ProLayoutPreferences => ({
  ...DEFAULT_PRO_LAYOUT_PREFERENCES,
  ...state?.proLayoutPreferences,
});

/**
 * Select market-agnostic Pro order-book display preferences.
 *
 * @param state - PerpsController state
 * @returns The order-book display preferences
 */
export const selectOrderBookPreferences = (
  state: PerpsControllerState,
): OrderBookPreferences => ({
  ...DEFAULT_ORDER_BOOK_PREFERENCES,
  ...state?.orderBookPreferences,
});

/**
 * Select the market-agnostic order type.
 *
 * @param state - PerpsController state
 * @returns The selected order type
 */
export const selectSelectedOrderType = (
  state: PerpsControllerState,
): OrderType => state?.selectedOrderType ?? DEFAULT_SELECTED_ORDER_TYPE;

/**
 * Select the visible candle count shared by Lite and Pro.
 *
 * @param state - PerpsController state
 * @returns The visible candle count
 */
export const selectVisibleCandleCount = (state: PerpsControllerState): number =>
  Number.isFinite(state?.visibleCandleCount)
    ? state.visibleCandleCount
    : VISIBLE_CANDLE_COUNT_CONFIG.Default;

/**
 * Select the current Perps interface mode (lite/pro).
 *
 * Falls back to the default mode when the state slice is missing.
 *
 * @param state - PerpsController state
 * @returns The current Perps mode
 */
export const selectPerpsMode = (state: PerpsControllerState): PerpsMode =>
  state?.mode ?? DEFAULT_PERPS_MODE;

/**
 * Select order book grouping for a specific market on the current network.
 *
 * Usage: selectOrderBookGrouping(state, coin)
 *
 * @param state - The perps controller state.
 * @param coin - The market coin symbol.
 * @returns The order book grouping value, or undefined.
 */

export const selectOrderBookGrouping = createSelector(
  [
    (state: PerpsControllerState): boolean | undefined => state?.isTestnet,
    (
      state: PerpsControllerState,
      _coin: string,
    ): PerpsControllerState['tradeConfigurations'] | undefined =>
      state?.tradeConfigurations,
    (_state: PerpsControllerState, coin: string): string => coin,
  ],
  (isTestnet, configs, coin): number | undefined => {
    const network = isTestnet ? 'testnet' : 'mainnet';
    return configs?.[network]?.[coin]?.orderBookGrouping;
  },
);
