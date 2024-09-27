import type {
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';

import type { fetchMultiExchangeRate as defaultFetchExchangeRate } from '../crypto-compare-service';
import type {
  name as ratesControllerName,
  Cryptocurrency,
} from './RatesController';

/**
 * Represents the conversion rates from one currency to others, including the conversion date.
 * The `conversionRate` field is a string that maps a cryptocurrency code (e.g., "BTC") to its
 * conversion rate. For this field we use string as the data type to avoid potential rounding
 * errors and precision loss.
 * The `usdConversionRate` provides the conversion rate to USD as a string, or `null` if the
 * conversion rate to USD is not available. We also use string for the same reason as stated before.
 * The `conversionDate` is a Unix timestamp (number) indicating when the conversion rate was last updated.
 */
export type Rate = {
  conversionRate: string;
  conversionDate: number;
  usdConversionRate?: string;
};

/**
 * Represents the conversion rates for multiple cryptocurrencies.
 * Each key is a string representing the cryptocurrency symbol (e.g., "BTC", "SOL"),
 * and its value is a `Rate` object containing conversion rates from that cryptocurrency
 * to a fiat currencies and an optional USD rate.
 */
export type ConversionRates = Record<string, Rate>;

/**
 * Represents the state structure for the RatesController.
 */
export type RatesControllerState = {
  /**
   * The fiat currency in which conversion rates are expressed
   * (i.e., the "to" currency).
   */
  fiatCurrency: string;
  /**
   * The conversion rates for multiple cryptocurrencies.
   */
  rates: ConversionRates;
  /**
   * A list of supported cryptocurrency symbols.
   * (i.e., the "from" currencies).
   */
  cryptocurrencies: Cryptocurrency[];
};

/**
 * Type definition for RatesController state change events.
 */
export type RatesControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof ratesControllerName,
  RatesControllerState
>;

/**
 * Type definition for the RatesController polling started event.
 */
export type RatesControllerPollingStartedEvent = {
  type: `${typeof ratesControllerName}:pollingStarted`;
  payload: [];
};

/**
 * Type definition for the RatesController polling stopped event.
 */
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
export type RatesControllerMessenger = RestrictedControllerMessenger<
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
  messenger: RatesControllerMessenger;
  /**
   * The initial state of the controller.
   */
  state?: Partial<RatesControllerState>;
  /**
   * The function to fetch exchange rates.
   */
  fetchMultiExchangeRate?: typeof defaultFetchExchangeRate;
};
