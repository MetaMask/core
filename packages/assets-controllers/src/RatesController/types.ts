import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';

import type { fetchMultiExchangeRate as defaultFetchExchangeRate } from '../crypto-compare-service';
import type { name as ratesControllerName } from './RatesController';

/**
 * Represents the conversion rates from one currency to others.
 * Each key is a string representing the cryptocurrency code (e.g., "BTC", "SOL"),
 * and its value is either a number representing the conversion rate to that currency,
 * or `null` if the conversion rate is not available.
 */
export type Rate = Record<string, number | null>;

/**
 * Represents the conversion rates for multiple cryptocurrencies.
 * Each key is a string representing the cryptocurrency symbol (e.g., "BTC", "SOL"),
 * and its value is a `Rate` object containing conversion rates from that cryptocurrency
 * to various fiat currencies or other cryptocurrencies.
 */
export type ConversionRates = Record<string, Rate>;

/**
 * Represents the state structure for the BtcRateController.
 */
export type RatesState = {
  currency: string;
  rates: ConversionRates;
  cryptocurrencyList: string[];
};

/**
 * Type definition for BtcRateController state change events.
 */
export type RatesStateChange = ControllerStateChangeEvent<
  typeof ratesControllerName,
  RatesState
>;

export type RatesControllerEvents = RatesStateChange;

export type GetRatesState = ControllerGetStateAction<
  typeof ratesControllerName,
  RatesState
>;

export type RatesControllerActions = GetRatesState;

export type RatesMessenger = RestrictedControllerMessenger<
  typeof ratesControllerName,
  RatesControllerActions,
  RatesControllerEvents,
  never,
  never
>;

export type RatesControllerArgs = {
  includeUsdRate?: boolean;
  interval?: number;
  messenger: RatesMessenger;
  state?: Partial<RatesState>;
  fetchMultiExchangeRate?: typeof defaultFetchExchangeRate;
  onStart?: () => Promise<unknown>;
  onStop?: () => Promise<unknown>;
};
