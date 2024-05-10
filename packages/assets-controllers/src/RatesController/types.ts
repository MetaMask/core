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
 * Represents the state structure for the RatesController.
 * @property {string} currency - The base currency for conversion rates.
 * @property {ConversionRates} rates - The conversion rates for multiple cryptocurrencies.
 * @property {string[]} cryptocurrencyList - A list of supported cryptocurrency symbols.
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

/**
 * Defines the events that the RatesController can emit.
 */
export type RatesControllerEvents = RatesStateChange;

export type GetRatesState = ControllerGetStateAction<
  typeof ratesControllerName,
  RatesState
>;

/**
 * Defines the actions that can be performed to get the state of the RatesController.
 */
export type RatesControllerActions = GetRatesState;

/**
 * Defines the actions that the RatesController can perform.
 */
export type RatesMessenger = RestrictedControllerMessenger<
  typeof ratesControllerName,
  RatesControllerActions,
  RatesControllerEvents,
  never,
  never
>;

/**
 * The arguments required to initialize a RatesController.
 * @property {boolean} [includeUsdRate] - Whether to include USD rates in the conversion rates.
 * @property {number} [interval] - The polling interval in milliseconds.
 * @property {RatesMessenger} messenger - The messenger instance for communication.
 * @property {Partial<RatesState>} [state] - The initial state of the controller.
 * @property {typeof defaultFetchExchangeRate} [fetchMultiExchangeRate] - The function to fetch exchange rates.
 * @property {() => Promise<unknown>} [onStart] - A function to execute when the controller starts.
 * @property {() => Promise<unknown>} [onStop] - A function to execute when the controller stops.
 */
export type RatesControllerArgs = {
  includeUsdRate?: boolean;
  interval?: number;
  messenger: RatesMessenger;
  state?: Partial<RatesState>;
  fetchMultiExchangeRate?: typeof defaultFetchExchangeRate;
  onStart?: () => Promise<unknown>;
  onStop?: () => Promise<unknown>;
};
