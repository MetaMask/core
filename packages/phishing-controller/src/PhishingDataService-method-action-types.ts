/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { PhishingDataService } from './PhishingDataService.js';

/**
 * Fetches the full phishing detection stalelist.
 *
 * @returns The stalelist response.
 */
export type PhishingDataServiceGetStalelistAction = {
  type: `PhishingDataService:getStalelist`;
  handler: PhishingDataService['getStalelist'];
};

/**
 * Fetches the hotlist diffs recorded since the given timestamp.
 *
 * @param timestamp - The timestamp (in seconds) to fetch diffs since.
 * @returns The hotlist diffs response.
 */
export type PhishingDataServiceGetHotlistDiffsAction = {
  type: `PhishingDataService:getHotlistDiffs`;
  handler: PhishingDataService['getHotlistDiffs'];
};

/**
 * Fetches the C2 domain blocklist changes recorded since the given
 * timestamp, or the current blocklist if no timestamp is given.
 *
 * @param timestamp - The timestamp (in seconds) to fetch changes since.
 * @returns The C2 domain blocklist response.
 */
export type PhishingDataServiceGetC2DomainBlocklistAction = {
  type: `PhishingDataService:getC2DomainBlocklist`;
  handler: PhishingDataService['getC2DomainBlocklist'];
};

/**
 * Scans a URL for phishing via the dapp-scanning API.
 *
 * @param url - The prepared URL parameter to scan (hostname, or hostname
 * plus path for shared gateways).
 * @returns The phishing detection scan result.
 */
export type PhishingDataServiceScanUrlAction = {
  type: `PhishingDataService:scanUrl`;
  handler: PhishingDataService['scanUrl'];
};

/**
 * Scans a batch of URLs for phishing via the dapp-scanning API.
 *
 * Results are cached per hostname using the same query keys as
 * {@link PhishingDataService.scanUrl}, so results are shared between single
 * and bulk scans. Only hostnames without a fresh cached result are sent to
 * the API, in requests of up to 50 URLs.
 *
 * @param urls - The URLs to scan.
 * @returns The scan results, keyed by URL, and any batch-level errors.
 */
export type PhishingDataServiceBulkScanUrlsAction = {
  type: `PhishingDataService:bulkScanUrls`;
  handler: PhishingDataService['bulkScanUrls'];
};

/**
 * Scans a token for malicious activity via the security-alerts API.
 *
 * Requests made while a bulk scan is being assembled are coalesced into a
 * single request to the bulk scanning endpoint.
 *
 * @param chain - The chain name (e.g. `ethereum`).
 * @param token - The token address to scan.
 * @returns The token scan result, or `null` if the API returned no result
 * for the token.
 */
export type PhishingDataServiceScanTokenAction = {
  type: `PhishingDataService:scanToken`;
  handler: PhishingDataService['scanToken'];
};

/**
 * Scans a batch of tokens for malicious activity via the security-alerts
 * API.
 *
 * Results are cached per token; only tokens without a fresh cached result
 * are sent to the API, in requests of up to 100 tokens.
 *
 * @param chain - The chain name (e.g. `ethereum`).
 * @param tokens - The token addresses to scan.
 * @returns The token scan results, keyed by token address. Tokens for which
 * the API returned no result are omitted.
 */
export type PhishingDataServiceBulkScanTokensAction = {
  type: `PhishingDataService:bulkScanTokens`;
  handler: PhishingDataService['bulkScanTokens'];
};

/**
 * Scans an address for security alerts via the security-alerts API.
 *
 * @param chain - The chain name (e.g. `ethereum`).
 * @param address - The address to scan.
 * @returns The address scan result.
 */
export type PhishingDataServiceScanAddressAction = {
  type: `PhishingDataService:scanAddress`;
  handler: PhishingDataService['scanAddress'];
};

/**
 * Gets token approvals for an address with security enrichments via the
 * security-alerts API. Approvals reflect live account state and are never
 * cached.
 *
 * @param chain - The chain name (e.g. `ethereum`).
 * @param address - The address to get approvals for.
 * @returns The approvals response.
 */
export type PhishingDataServiceGetApprovalsAction = {
  type: `PhishingDataService:getApprovals`;
  handler: PhishingDataService['getApprovals'];
};

/**
 * Union of all PhishingDataService action types.
 */
export type PhishingDataServiceMethodActions =
  | PhishingDataServiceGetStalelistAction
  | PhishingDataServiceGetHotlistDiffsAction
  | PhishingDataServiceGetC2DomainBlocklistAction
  | PhishingDataServiceScanUrlAction
  | PhishingDataServiceBulkScanUrlsAction
  | PhishingDataServiceScanTokenAction
  | PhishingDataServiceBulkScanTokensAction
  | PhishingDataServiceScanAddressAction
  | PhishingDataServiceGetApprovalsAction;
