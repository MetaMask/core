/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ProfileMetricsService } from './ProfileMetricsService';

/**
 * Fetch single-use nonces from the auth API, one per identifier.
 *
 * Requests larger than {@link MAX_NONCE_BATCH_SIZE} are split into multiple
 * `POST /api/v2/nonce/batch` calls fired in parallel; the resulting maps are
 * merged into a single record. Each chunk independently goes through the
 * service policy (retry, circuit-breaker, degraded). If any chunk ultimately
 * fails, the whole call rejects so the caller can soft-degrade the entire
 * entropy-source batch consistently.
 *
 * The returned record is keyed by the auth API's echoed `identifier` field
 * (`response[i].identifier -> response[i].nonce`). The call asserts that
 * the response identifier set is exactly the requested set; any mismatch
 * (missing, extra, or duplicated identifier) causes the chunk to throw so
 * the caller never silently proceeds with partial nonces.
 *
 * @param data - The identifiers to mint nonces for, plus the optional
 * entropy source ID used to scope the bearer token.
 * @returns A map of identifier -> nonce.
 * @throws {RangeError} if no identifiers are provided.
 */
export type ProfileMetricsServiceFetchNoncesAction = {
  type: `ProfileMetricsService:fetchNonces`;
  handler: ProfileMetricsService['fetchNonces'];
};

/**
 * Submit metrics to the API.
 *
 * @param data - The data to send in the metrics update request.
 * @returns The response from the API.
 */
export type ProfileMetricsServiceSubmitMetricsAction = {
  type: `ProfileMetricsService:submitMetrics`;
  handler: ProfileMetricsService['submitMetrics'];
};

/**
 * Union of all ProfileMetricsService action types.
 */
export type ProfileMetricsServiceMethodActions =
  | ProfileMetricsServiceFetchNoncesAction
  | ProfileMetricsServiceSubmitMetricsAction;
