/**
 * Supported environments for the Money Account APY Tracking API.
 */
export enum Env {
  DEV = 'dev',
  UAT = 'uat',
  PRD = 'prd',
}

/**
 * Base URL map for the Money Account APY Tracking API, keyed by environment.
 */
export const MONEY_ACCOUNT_API_URL_MAP: Record<Env, string> = {
  [Env.DEV]: 'https://money.dev-api.cx.metamask.io',
  [Env.UAT]: 'https://money.uat-api.cx.metamask.io',
  [Env.PRD]: 'https://money.api.cx.metamask.io',
};

/**
 * Default stale time (ms) for position/interest/history queries.
 * Matches the server-side cache TTL of 30 seconds.
 */
export const DEFAULT_STALE_TIME_MS = 30_000;

/**
 * Default stale time (ms) for rate-history queries.
 * Matches the server-side cache TTL of 5 minutes.
 */
export const RATE_HISTORY_STALE_TIME_MS = 300_000;
