export const controllerName = 'AiDigestController';

export const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export const MAX_CACHE_ENTRIES = 50;

export const AiDigestControllerErrorMessage = {
  API_REQUEST_FAILED: 'API request failed',
  API_INVALID_RESPONSE: 'API returned invalid response',
  INVALID_CAIP_ASSET_TYPE: 'Invalid CAIP asset type',
} as const;
