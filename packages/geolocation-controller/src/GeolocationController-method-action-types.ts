/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { GeolocationController } from './GeolocationController.js';

/**
 * Returns the geolocation code. Delegates to the
 * {@link GeolocationApiService} for network fetching and caching, then
 * updates controller state with the result.
 *
 * @returns The ISO 3166-2 location code string.
 */
export type GeolocationControllerGetGeolocationAction = {
  type: `GeolocationController:getGeolocation`;
  handler: GeolocationController['getGeolocation'];
};

/**
 * Returns the country, region, and timezone for the current client.
 * Delegates to the {@link GeolocationApiService} for network fetching and
 * caching, then updates controller state with the result.
 *
 * @returns The geolocation data, where each field is `null` when it could
 * not be determined.
 */
export type GeolocationControllerGetGeolocationDataAction = {
  type: `GeolocationController:getGeolocationData`;
  handler: GeolocationController['getGeolocationData'];
};

/**
 * Forces a fresh geolocation fetch, bypassing the service's cache.
 *
 * @returns The ISO 3166-2 location code string.
 */
export type GeolocationControllerRefreshGeolocationAction = {
  type: `GeolocationController:refreshGeolocation`;
  handler: GeolocationController['refreshGeolocation'];
};

/**
 * Union of all GeolocationController action types.
 */
export type GeolocationControllerMethodActions =
  | GeolocationControllerGetGeolocationAction
  | GeolocationControllerGetGeolocationDataAction
  | GeolocationControllerRefreshGeolocationAction;
