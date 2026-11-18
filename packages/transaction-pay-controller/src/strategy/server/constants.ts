import type { CaipAssetType } from '@metamask/utils';

/**
 * Default base URL for the server intents API.
 * Override via `payStrategies.server.baseUrl` remote feature flag.
 */
export const SERVER_URL_BASE = 'https://intents.api.cx.metamask.io';

/** Polling interval in milliseconds. */
export const SERVER_POLLING_INTERVAL = 2000;

/**
 * CAIP-19 asset ID the server intents API uses for USDC in the Hyperliquid
 * perps margin account, in 8 decimals.
 */
export const SERVER_HYPERLIQUID_PERPS_USDC_ASSET =
  'hyperliq:mainnet/perps:usdc' as CaipAssetType;
