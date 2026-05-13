// packages/transaction-pay-controller/src/strategy/generic/constants.ts

/**
 * Default base URL for the generic intents API.
 * Points to a local development instance by default.
 * Override via `payStrategies.generic.{quoteUrl,statusUrl,submitUrl}` remote feature flags.
 */
export const GENERIC_URL_BASE = 'http://localhost:3000';

export const GENERIC_QUOTE_URL = `${GENERIC_URL_BASE}/quote`;

export const GENERIC_STATUS_URL = `${GENERIC_URL_BASE}/status`;

export const GENERIC_SUBMIT_URL = `${GENERIC_URL_BASE}/submit`;

/** Polling interval in milliseconds. Mirrors RELAY_POLLING_INTERVAL. */
export const GENERIC_POLLING_INTERVAL = 1000;

/**
 * Default provider priority list for generic quote requests.
 * Relay is the only supported provider in the first iteration.
 * Override via `payStrategies.generic.providerPriority` remote feature flag.
 */
export const GENERIC_DEFAULT_PROVIDER_PRIORITY = ['relay'] as const;
