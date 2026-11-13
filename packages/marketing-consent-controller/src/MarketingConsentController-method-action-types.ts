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
 * Before sign-in finishes (e.g. during onboarding), the change is applied
 * locally and saved to AUS once the wallet is unlocked and signed in; the
 * call resolves without waiting for that.
 *
 * A call overtaken by a newer choice (a newer call, or other code changing
 * consent in AnalyticsController) resolves without waiting; the newer
 * choice is saved on its own.
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
