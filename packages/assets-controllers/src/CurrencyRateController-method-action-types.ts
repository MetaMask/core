/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { CurrencyRateController } from './CurrencyRateController';

/**
 * Sets a currency to track.
 *
 * @param currentCurrency - ISO 4217 currency code.
 */
export type CurrencyRateControllerSetCurrentCurrencyAction = {
  type: `CurrencyRateController:setCurrentCurrency`;
  handler: CurrencyRateController['setCurrentCurrency'];
};

/**
 * Updates the exchange rate for the current currency and native currency pairs.
 *
 * @param nativeCurrencies - The native currency symbols to fetch exchange rates for.
 */
export type CurrencyRateControllerUpdateExchangeRateAction = {
  type: `CurrencyRateController:updateExchangeRate`;
  handler: CurrencyRateController['updateExchangeRate'];
};

/**
 * Union of all CurrencyRateController action types.
 */
export type CurrencyRateControllerMethodActions =
  | CurrencyRateControllerSetCurrentCurrencyAction
  | CurrencyRateControllerUpdateExchangeRateAction;
