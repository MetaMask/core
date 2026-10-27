import type {
  Env,
  GeolocationApiService,
} from '@metamask/geolocation-controller';

type GeolocationApiServiceOptions = ConstructorParameters<
  typeof GeolocationApiService
>[0];

/**
 * Per-instance options for the wallet's `GeolocationApiService`.
 *
 * All fields are optional. The service defaults to production and
 * `globalThis.fetch`.
 */
export type GeolocationApiServiceInstanceOptions = {
  env?: Env;
  fetch?: GeolocationApiServiceOptions['fetch'];
  ttlMs?: GeolocationApiServiceOptions['ttlMs'];
  policyOptions?: GeolocationApiServiceOptions['policyOptions'];
};
