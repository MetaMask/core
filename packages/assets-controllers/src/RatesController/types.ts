import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';

import type { fetchMultiExchangeRate as defaultFetchExchangeRate } from '../crypto-compare-service';
import type { name as ratesControllerName } from './RatesController';

/**
 * Represents the conversion rates from one currency to others, including the conversion date.
 * The `conversionRate` field is a string that maps a cryptocurrency code (e.g., "BTC") to its conversion rate.
 * The `usdConversionRate` provides the conversion rate to USD as a string, or `null` if the conversion rate to USD is not available.
 * The `conversionDate` is a Unix timestamp (number) indicating when the conversion rate was last updated.
 */
export type Rate = {
  conversionRate: string;
  usdConversionRate: string | null;
  conversionDate: number;
};

/**
 * Represents the conversion rates for multiple cryptocurrencies.
 * Each key is a string representing the cryptocurrency symbol (e.g., "BTC", "SOL"),
 * and its value is a `Rate` object containing conversion rates from that cryptocurrency
 * to various fiat currencies or other cryptocurrencies.
 */
export type ConversionRates = Record<string, Rate>;

/**
 * Represents the state structure for the RatesController.
 */
export type RatesControllerState = {
  /**
   * The base currency for conversion rates.
   */
  currency: string;
  /**
   * The conversion rates for multiple cryptocurrencies.
   */
  rates: ConversionRates;
  /**
   * A list of supported cryptocurrency symbols.
   */
  fromCurrencies: string[];
};

/**
 * Type definition for RatesController state change events.
 */
export type RatesControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof ratesControllerName,
  RatesControllerState
>;

export type RatesControllerPollingStartedEvent = {
  type: `${typeof ratesControllerName}:pollingStarted`;
  payload: [];
};

export type RatesControllerPollingStoppedEvent = {
  type: `${typeof ratesControllerName}:pollingStopped`;
  payload: [];
};

/**
 * Defines the events that the RatesController can emit.
 */
export type RatesControllerEvents =
  | RatesControllerStateChangeEvent
  | RatesControllerPollingStartedEvent
  | RatesControllerPollingStoppedEvent;

export type RatesControllerGetStateAction = ControllerGetStateAction<
  typeof ratesControllerName,
  RatesControllerState
>;

/**
 * Defines the actions that can be performed to get the state of the RatesController.
 */
export type RatesControllerActions = RatesControllerGetStateAction;

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
 * The options required to initialize a RatesController.
 */
export type RatesControllerOptions = {
  /**
   * Whether to include USD rates in the conversion rates.
   */
  includeUsdRate: boolean;
  /**
   * The polling interval in milliseconds.
   */
  interval?: number;
  /**
   * The messenger instance for communication.
   */
  messenger: RatesMessenger;
  /**
   * The initial state of the controller.
   */
  state?: Partial<RatesControllerState>;
  /**
   * The function to fetch exchange rates.
   */
  fetchMultiExchangeRate?: typeof defaultFetchExchangeRate;
};
