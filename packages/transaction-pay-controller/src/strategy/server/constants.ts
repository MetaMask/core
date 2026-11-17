/**
 * Default base URL for the server intents API.
 * Override via `payStrategies.server.baseUrl` remote feature flag.
 */
export const SERVER_URL_BASE = 'https://intents.api.cx.metamask.io';

/** Server chain IDs of supported non-EVM chains, keyed by CAIP-2 chain ID. */
export const SERVER_NON_EVM_CHAIN_IDS: Record<string, number> = {
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 792703809,
};

/** Polling interval in milliseconds. */
export const SERVER_POLLING_INTERVAL = 2000;
