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
 * Best-effort: if the fetch fails, the last known location code (or
 * {@link UNKNOWN_LOCATION}) is returned rather than throwing.
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
 * Unlike {@link getGeolocation}, this rejects when resolution fails instead
 * of returning a stale value, so callers can distinguish a fresh result from
 * a failed lookup (and, for example, omit location rather than enrich with a
 * previous session's data).
 *
 * @returns The geolocation data, where each field is `null` when it could
 * not be determined.
 * @throws When the geolocation service fails to resolve.
 */
export type GeolocationControllerGetGeolocationDataAction = {
  type: `GeolocationController:getGeolocationData`;
  handler: GeolocationController['getGeolocationData'];
};

/**
 * Forces a fresh geolocation fetch, bypassing the service's cache.
 *
 * Best-effort: if the fetch fails, the last known location code (or
 * {@link UNKNOWN_LOCATION}) is returned rather than throwing.
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
