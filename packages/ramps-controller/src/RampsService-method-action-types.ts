/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { RampsService } from './RampsService.js';

/**
 * Returns the default redirect ("fake callback") URL for this service's
 * environment.
 *
 * The quotes API only embeds a `buyURL`/`buyWidget` (the WebView page a
 * non-native provider needs) when a `redirectUrl` is present, so callers
 * that omit one (MM Pay's widened Headless Buy fetch) use this value.
 * Exposing it here makes the service's environment the single runtime source
 * of truth, so the callback can never point at a different environment than
 * the one the quotes themselves came from.
 *
 * `baseUrlOverride` deliberately does not apply. That option overrides the
 * ramps API base URL for local development. In production and staging the
 * callback lives on a different host (`on-ramp-content` versus
 * `on-ramp{-cache}`), so an API override says nothing about where
 * `/regions/fake-callback` lives. In development the callback already shares
 * the API host family (`on-ramp.dev-api`). The redirect URL is also handed
 * to the provider and matched by client UI to detect flow completion, so
 * returning an unrelated local API origin here would break completion
 * detection rather than help it. Point `environment` at
 * {@link RampsEnvironment.Local} for a localhost callback, noting that URL
 * is pinned to `http://localhost:3000` and does not follow a non-3000
 * `baseUrlOverride`.
 *
 * @returns The default redirect callback URL for the configured environment.
 */
export type RampsServiceGetDefaultRedirectCallbackUrlAction = {
  type: `RampsService:getDefaultRedirectCallbackUrl`;
  handler: RampsService['getDefaultRedirectCallbackUrl'];
};

/**
 * Makes a request to the API in order to retrieve the user's geolocation
 * based on their IP address.
 *
 * @returns The user's country/region code (e.g., "US-UT" for Utah, USA).
 */
export type RampsServiceGetGeolocationAction = {
  type: `RampsService:getGeolocation`;
  handler: RampsService['getGeolocation'];
};

/**
 * Makes a request to the cached API to retrieve the list of supported countries.
 * The API returns countries with support information for both buy and sell actions.
 * Filters countries based on aggregator support (preserves OnRampSDK logic).
 *
 * @returns An array of countries filtered by aggregator support.
 */
export type RampsServiceGetCountriesAction = {
  type: `RampsService:getCountries`;
  handler: RampsService['getCountries'];
};

/**
 * Fetches the list of available tokens for a given region and action.
 * Supports optional provider filter.
 *
 * @param region - The region code (e.g., "us", "fr", "us-ny").
 * @param action - The ramp action type ('buy' or 'sell').
 * @param options - Optional query parameters for filtering tokens.
 * @param options.provider - Provider ID(s) to filter by.
 * @returns The tokens response containing topTokens and allTokens.
 */
export type RampsServiceGetTokensAction = {
  type: `RampsService:getTokens`;
  handler: RampsService['getTokens'];
};

/**
 * Fetches the list of providers for a given region.
 * Supports optional query filters: provider, crypto, payments.
 * Region local fiat filtering is applied server-side when `fiat` is omitted.
 *
 * @param regionCode - The region code (e.g., "us", "fr", "us-ny").
 * @param options - Optional query parameters for filtering providers.
 * @param options.provider - Provider ID(s) to filter by.
 * @param options.crypto - Crypto currency ID(s) to filter by.
 * @param options.payments - Payment method ID(s) to filter by.
 * @returns The providers response containing providers array.
 */
export type RampsServiceGetProvidersAction = {
  type: `RampsService:getProviders`;
  handler: RampsService['getProviders'];
};

/**
 * Fetches the list of payment methods for a given region, asset, and provider.
 *
 * Region local fiat filtering is applied server-side when `fiat` is omitted.
 *
 * @param options - Query parameters for filtering payment methods.
 * @param options.region - User's region code (e.g., "us-al").
 * @param options.assetId - CAIP-19 cryptocurrency identifier.
 * @param options.provider - Provider ID path.
 * @returns The payment methods response containing payments array.
 */
export type RampsServiceGetPaymentMethodsAction = {
  type: `RampsService:getPaymentMethods`;
  handler: RampsService['getPaymentMethods'];
};

/**
 * Fetches quotes from all providers for a given set of parameters.
 * Uses the V2 orders API to get quotes for multiple payment methods at once.
 *
 * @param params - The parameters for fetching quotes.
 * @param params.region - User's region code (e.g., "us", "us-ca").
 * @param params.paymentMethods - Array of payment method IDs.
 * @param params.assetId - CAIP-19 cryptocurrency identifier.
 * @param params.fiat - Fiat currency code (e.g., "usd").
 * @param params.amount - The amount (in fiat for buy, crypto for sell).
 * @param params.walletAddress - The destination wallet address.
 * @param params.redirectUrl - Optional redirect URL after order completion.
 * @param params.providers - Optional provider IDs to filter quotes.
 * @param params.action - The ramp action type. Defaults to 'buy'.
 * @param params.isFeeExcludedFromFiat - When true, requests fee-on-top quotes.
 * @returns The quotes response containing success, sorted, error, and customActions.
 */
export type RampsServiceGetQuotesAction = {
  type: `RampsService:getQuotes`;
  handler: RampsService['getQuotes'];
};

/**
 * Fetches the buy widget data from a buy URL endpoint.
 * Makes a request to the buyURL (as provided in a quote) to get the actual
 * provider widget URL, browser type, and order ID.
 *
 * @param buyUrl - The full buy URL endpoint to fetch from.
 * @returns The buy widget data containing the provider widget URL.
 */
export type RampsServiceGetBuyWidgetUrlAction = {
  type: `RampsService:getBuyWidgetUrl`;
  handler: RampsService['getBuyWidgetUrl'];
};

/**
 * Fetches an order from the unified V2 API endpoint.
 * This endpoint returns a normalized `RampsOrder` (DepositOrder shape)
 * for all provider types, including both aggregator and native providers.
 *
 * @param providerCode - The provider code (e.g., "transak", "transak-native", "moonpay"),
 * with or without the `/providers/` prefix.
 * @param orderCode - The order identifier.
 * @param wallet - The wallet address associated with the order.
 * @returns The unified order data.
 */
export type RampsServiceGetOrderAction = {
  type: `RampsService:getOrder`;
  handler: RampsService['getOrder'];
};

/**
 * Extracts an order from a provider callback URL.
 * Sends the callback URL to the V2 API backend, which knows how to parse
 * each provider's callback format and extract the order ID. Then fetches
 * the full order using that ID.
 *
 * This is the V2 equivalent of the aggregator SDK's `getOrderFromCallback`.
 *
 * @param providerCode - The provider code (e.g., "transak", "moonpay"),
 * with or without the `/providers/` prefix.
 * @param callbackUrl - The full callback URL the provider redirected to.
 * @param wallet - The wallet address associated with the order.
 * @returns The unified order data.
 */
export type RampsServiceGetOrderFromCallbackAction = {
  type: `RampsService:getOrderFromCallback`;
  handler: RampsService['getOrderFromCallback'];
};

/**
 * Union of all RampsService action types.
 */
export type RampsServiceMethodActions =
  | RampsServiceGetDefaultRedirectCallbackUrlAction
  | RampsServiceGetGeolocationAction
  | RampsServiceGetCountriesAction
  | RampsServiceGetTokensAction
  | RampsServiceGetProvidersAction
  | RampsServiceGetPaymentMethodsAction
  | RampsServiceGetQuotesAction
  | RampsServiceGetBuyWidgetUrlAction
  | RampsServiceGetOrderAction
  | RampsServiceGetOrderFromCallbackAction;
