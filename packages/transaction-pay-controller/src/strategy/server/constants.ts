/**
 * Default base URL for the server intents API.
 * Override via `payStrategies.server.{quoteUrl,statusUrl,submitUrl}` remote feature flags.
 */
export const SERVER_URL_BASE = 'https://intents.api.cx.metamask.io';

export const SERVER_QUOTE_URL = `${SERVER_URL_BASE}/quote`;

export const SERVER_STATUS_URL = `${SERVER_URL_BASE}/status`;

export const SERVER_SUBMIT_URL = `${SERVER_URL_BASE}/submit`;

/** Polling interval in milliseconds. Mirrors RELAY_POLLING_INTERVAL. */
export const SERVER_POLLING_INTERVAL = 1000;

/**
 * Default provider priority list for server quote requests.
 * Relay is the only supported provider in the first iteration.
 * Override via `payStrategies.server.providerPriority` remote feature flag.
 */
export const SERVER_DEFAULT_PROVIDER_PRIORITY = ['relay'] as const;
