export const controllerName = 'RewardsController'; // Default timeout for all API requests (10 seconds)
export const DEFAULT_REQUEST_TIMEOUT_MS = 10000; // Default blocked regions for rewards (ISO 3166-1 alpha-2 codes)

export const DEFAULT_BLOCKED_REGIONS = ['UK'];
// Silent authentication constants
export const AUTH_GRACE_PERIOD_MS = 1000 * 60 * 10; // 10 minutes
// Perps discount refresh threshold
export const PERPS_DISCOUNT_CACHE_THRESHOLD_MS = 1000 * 60 * 5; // 5 minutes
// Season status cache threshold
export const SEASON_STATUS_CACHE_THRESHOLD_MS = 1000 * 60 * 1; // 1 minute
// Referral details cache threshold
export const REFERRAL_DETAILS_CACHE_THRESHOLD_MS = 1000 * 60 * 10; // 10 minutes
