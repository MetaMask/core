/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MarketingConsentController } from './MarketingConsentController.js';

/**
 * Sets the user's marketing consent and saves it to AUS.
 *
 * Turning consent off also turns off the AUS marketing notification
 * channels, before consent is saved.
 *
 * While the wallet is locked or signed out, the change is applied locally
 * and saved to AUS on the next unlock and sign-in; the call resolves
 * without waiting for that.
 *
 * @param enabled - Whether the user consents to marketing.
 * @throws If AUS did not save the change. AUS is the source of truth, so
 * the change is then dropped and local consent is re-read from AUS.
 */
export type MarketingConsentControllerSetMarketingConsentAction = {
  type: `MarketingConsentController:setMarketingConsent`;
  handler: MarketingConsentController['setMarketingConsent'];
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
  | MarketingConsentControllerSetMarketingConsentAction
  | MarketingConsentControllerRefreshAction;
