/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MarketingConsentController } from './MarketingConsentController.js';

/**
 * Confirms the requested consent was saved to AUS.
 *
 * @param expectedConsent - The consent value the caller asked to save.
 */
export type MarketingConsentControllerWaitForSyncAction = {
  type: `MarketingConsentController:waitForSync`;
  handler: MarketingConsentController['waitForSync'];
};

/**
 * Re-reads consent from AUS, e.g. when the wallet UI opens or the app
 * returns to the foreground.
 */
export type MarketingConsentControllerRefreshAction = {
  type: `MarketingConsentController:refresh`;
  handler: MarketingConsentController['refresh'];
};

/**
 * Union of all MarketingConsentController action types.
 */
export type MarketingConsentControllerMethodActions =
  | MarketingConsentControllerWaitForSyncAction
  | MarketingConsentControllerRefreshAction;
