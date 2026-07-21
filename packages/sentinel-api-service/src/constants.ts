/**
 * The name of the {@link SentinelApiService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'SentinelApiService';

/**
 * JSON-RPC method used to simulate transactions against the Sentinel API.
 */
export const RPC_METHOD_SIMULATE = 'infura_simulateTransactions';

/**
 * JSON-RPC method used to submit a signed relay (gas station) transaction to
 * the Sentinel API.
 */
export const RPC_METHOD_SEND_RELAY = 'eth_sendRelayTransaction';

/**
 * Template for the Sentinel API base URL. `{0}` is replaced with the network
 * subdomain (for example `ethereum-mainnet`) and `{1}` with the environment
 * API-domain segment (see {@link ENVIRONMENT_DOMAIN}).
 */
export const BASE_URL_TEMPLATE = 'https://tx-sentinel-{0}.{1}.cx.metamask.io/';

/**
 * The Sentinel API environments. Each maps to a distinct API domain segment;
 * see {@link ENVIRONMENT_DOMAIN}.
 */
export enum SentinelEnvironment {
  /** Development environment (`dev-api.cx.metamask.io`). */
  Dev = 'dev',
  /** User-acceptance-testing environment (`uat-api.cx.metamask.io`). */
  Uat = 'uat',
  /** Production environment (`api.cx.metamask.io`). */
  Prod = 'prod',
}

/**
 * Maps a {@link SentinelEnvironment} to the API-domain segment substituted into
 * {@link BASE_URL_TEMPLATE} (the `{1}` placeholder).
 */
export const ENVIRONMENT_DOMAIN: Record<SentinelEnvironment, string> = {
  [SentinelEnvironment.Dev]: 'dev-api',
  [SentinelEnvironment.Uat]: 'uat-api',
  [SentinelEnvironment.Prod]: 'api',
};

/**
 * The default {@link SentinelEnvironment} used when the constructor does not
 * specify one. Production, matching the behaviour of the clients this service
 * replaces.
 */
export const DEFAULT_ENVIRONMENT = SentinelEnvironment.Prod;

/**
 * The subdomain used for network-registry lookups. The `/networks` endpoint
 * returns identical data regardless of subdomain, so a stable one is used.
 */
export const NETWORKS_SUBDOMAIN = 'ethereum-mainnet';

/**
 * The REST path used to retrieve the supported-network registry.
 */
export const ENDPOINT_NETWORKS = 'networks';

/**
 * The REST path prefix used to poll the status of a submitted smart
 * transaction by UUID.
 */
export const ENDPOINT_SMART_TRANSACTIONS = 'smart-transactions';

/**
 * How long the network registry (`/networks`) response is considered fresh.
 * The registry is stable, so caching it avoids re-fetching on every request.
 */
export const NETWORKS_STALE_TIME_MS = 5 * 60 * 1000;
