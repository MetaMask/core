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

/**
 * Default stale time (ms) for current vault rate queries.
 * Matches the server-side cache TTL of 5 minutes.
 */
export const VAULT_RATE_STALE_TIME_MS = 300_000;

/**
 * Statement embedded in every Money Account VBA SIWE challenge.
 *
 * Pinned to the Money Account API's SIWE template
 * (`buildSiweMessage` in `vba-siwe.service.ts`). Changing it on the API
 * requires a matching client release, otherwise every challenge is rejected.
 */
export const MONEY_ACCOUNT_SIWE_STATEMENT =
  'Sign in to view your VBA transfers.';

/**
 * Chain ID every Money Account VBA SIWE challenge is bound to (Monad).
 *
 * Pinned to the Money Account API's SIWE template, which resolves this chain
 * ID for the `test-monad`, `uat`, and `production` deployments. Changing it on
 * the API requires a matching client release.
 */
export const MONEY_ACCOUNT_SIWE_CHAIN_ID = 143;

/**
 * Validity window (ms) encoded in every Money Account VBA SIWE challenge.
 *
 * Mirrors `NONCE_TTL_SECONDS` in the Money Account API's SIWE service. Changing
 * it on the API requires a matching client release.
 */
export const MONEY_ACCOUNT_SIWE_CHALLENGE_TTL_MS = 300_000;

/**
 * Clock skew (ms) tolerated when checking that a challenge's `Issued At` is not
 * in the future. This is a client-side tolerance only; the Money Account API
 * still rejects future-dated challenges on its own clock.
 */
export const MONEY_ACCOUNT_SIWE_CLOCK_SKEW_MS = 60_000;

/**
 * Maximum number of distinct transaction hashes the Money Account API accepts
 * per vault share valuations request.
 */
export const VAULT_SHARE_VALUATIONS_MAX_TX_HASHES = 50;

/**
 * Stale time (ms) for a vault share valuations batch where every requested
 * transaction is indexed. Matches the API's `private, max-age=86400`.
 */
export const VAULT_SHARE_VALUATIONS_COMPLETE_STALE_TIME_MS = 86_400_000;

/**
 * Stale time (ms) for a batch with any missing transaction, which may only mean
 * the transaction is newer than the indexer cursor. Matches the API's
 * `private, max-age=30`.
 */
export const VAULT_SHARE_VALUATIONS_PARTIAL_STALE_TIME_MS = 30_000;
