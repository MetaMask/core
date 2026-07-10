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
 * subdomain (for example `ethereum-mainnet`).
 */
export const BASE_URL_TEMPLATE = 'https://tx-sentinel-{0}.api.cx.metamask.io/';

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
 * The REST path prefix used to poll the status of a submitted relay
 * transaction by UUID.
 */
export const ENDPOINT_RELAY_STATUS = 'smart-transactions';

/**
 * How long the network registry (`/networks`) response is considered fresh.
 * The registry is stable, so caching it avoids re-fetching on every request.
 */
export const NETWORKS_STALE_TIME_MS = 5 * 60 * 1000;
