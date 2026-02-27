import type { FetchGeolocationOptions } from './geolocation-api-service';

export {
  GeolocationApiService,
  UNKNOWN_LOCATION,
} from './geolocation-api-service';
export type {
  GeolocationApiServiceOptions,
  FetchGeolocationOptions,
} from './geolocation-api-service';

/**
 * Messenger action that invokes
 * {@link GeolocationApiService.fetchGeolocation}.
 *
 * Register this action on the root messenger so that controllers and other
 * packages can call the service directly:
 *
 * ```ts
 * rootMessenger.registerActionHandler(
 *   'GeolocationApiService:fetchGeolocation',
 *   service.fetchGeolocation.bind(service),
 * );
 * ```
 */
export type GeolocationApiServiceFetchGeolocationAction = {
  type: 'GeolocationApiService:fetchGeolocation';
  handler: (options?: FetchGeolocationOptions) => Promise<string>;
};
