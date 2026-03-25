/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { PhishingController } from './PhishingController';

/**
 * Conditionally update the phishing configuration.
 *
 * If the stalelist configuration is out of date, this function will call `updateStalelist`
 * to update the configuration. This will automatically grab the hotlist,
 * so it isn't necessary to continue on to download the hotlist and the c2 domain blocklist.
 *
 */
export type PhishingControllerMaybeUpdateStateAction = {
  type: `PhishingController:maybeUpdateState`;
  handler: PhishingController['maybeUpdateState'];
};

/**
 * Determines if a given origin is unapproved.
 *
 * It is strongly recommended that you call {@link maybeUpdateState} before calling this,
 * to check whether the phishing configuration is up-to-date. It will be updated if necessary
 * by calling {@link updateStalelist} or {@link updateHotlist}.
 *
 * @param origin - Domain origin of a website.
 * @returns Whether the origin is an unapproved origin.
 */
export type PhishingControllerTestOriginAction = {
  type: `PhishingController:testOrigin`;
  handler: PhishingController['testOrigin'];
};

/**
 * Checks if a request URL's domain is blocked against the request blocklist.
 *
 * This method is used to determine if a specific request URL is associated with a malicious
 * command and control (C2) domain. The URL's hostname is hashed and checked against a configured
 * blocklist of known malicious domains.
 *
 * @param origin - The full request URL to be checked.
 * @returns An object indicating whether the URL's domain is blocked and relevant metadata.
 */
export type PhishingControllerIsBlockedRequestAction = {
  type: `PhishingController:isBlockedRequest`;
  handler: PhishingController['isBlockedRequest'];
};

/**
 * Temporarily marks a given origin as approved.
 *
 * @param origin - The origin to mark as approved.
 */
export type PhishingControllerBypassAction = {
  type: `PhishingController:bypass`;
  handler: PhishingController['bypass'];
};

/**
 * Scan a URL for phishing. It will only scan the hostname of the URL. It also only supports
 * web URLs.
 *
 * @param url - The URL to scan.
 * @returns The phishing detection scan result.
 */
export type PhishingControllerScanUrlAction = {
  type: `PhishingController:scanUrl`;
  handler: PhishingController['scanUrl'];
};

/**
 * Scan multiple URLs for phishing in bulk. It will only scan the hostnames of the URLs.
 * It also only supports web URLs.
 *
 * @param urls - The URLs to scan.
 * @returns A mapping of URLs to their phishing detection scan results and errors.
 */
export type PhishingControllerBulkScanUrlsAction = {
  type: `PhishingController:bulkScanUrls`;
  handler: PhishingController['bulkScanUrls'];
};

/**
 * Scan an address for security alerts.
 *
 * @param chainId - The chain ID in hex format (e.g., '0x1' for Ethereum).
 * @param address - The address to scan.
 * @returns The address scan result.
 */
export type PhishingControllerScanAddressAction = {
  type: `PhishingController:scanAddress`;
  handler: PhishingController['scanAddress'];
};

/**
 * Scan multiple tokens for malicious activity in bulk.
 *
 * @param request - The bulk scan request containing chainId and tokens.
 * @param request.chainId - The chain identifier. Accepts a hex chain ID for
 * EVM chains (e.g. `'0x1'` for Ethereum) or a chain name for non-EVM chains
 * (e.g. `'solana'`).
 * @param request.tokens - Array of token addresses to scan.
 * @returns A mapping of token addresses to their scan results. For EVM chains,
 * addresses are lowercased; for non-EVM chains, original casing is preserved.
 * Tokens that fail to scan are omitted.
 */
export type PhishingControllerBulkScanTokensAction = {
  type: `PhishingController:bulkScanTokens`;
  handler: PhishingController['bulkScanTokens'];
};

/**
 * Union of all PhishingController action types.
 */
export type PhishingControllerMethodActions =
  | PhishingControllerMaybeUpdateStateAction
  | PhishingControllerTestOriginAction
  | PhishingControllerIsBlockedRequestAction
  | PhishingControllerBypassAction
  | PhishingControllerScanUrlAction
  | PhishingControllerBulkScanUrlsAction
  | PhishingControllerScanAddressAction
  | PhishingControllerBulkScanTokensAction;
