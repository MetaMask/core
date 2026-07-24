/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AnalyticsController } from './AnalyticsController.js';

/**
 * Track an analytics event.
 *
 * Events are only tracked if analytics is enabled.
 *
 * @param event - Analytics event with properties and sensitive properties
 * @param context - Optional platform-specific context forwarded to the platform adapter.
 */
export type AnalyticsControllerTrackEventAction = {
  type: `AnalyticsController:trackEvent`;
  handler: AnalyticsController['trackEvent'];
};

/**
 * Identify a user for analytics.
 *
 * @param traits - User traits/properties
 * @param context - Optional platform-specific context forwarded to the platform adapter.
 */
export type AnalyticsControllerIdentifyAction = {
  type: `AnalyticsController:identify`;
  handler: AnalyticsController['identify'];
};

/**
 * Track a page or screen view.
 *
 * @param name - The identifier/name of the page or screen being viewed (e.g., "home", "settings", "wallet")
 * @param properties - Optional properties associated with the view
 * @param context - Optional platform-specific context forwarded to the platform adapter.
 */
export type AnalyticsControllerTrackViewAction = {
  type: `AnalyticsController:trackView`;
  handler: AnalyticsController['trackView'];
};

/**
 * Opt in to analytics.
 *
 * Records that a consent decision has been made and replays any events that
 * were queued while the user was undecided.
 */
export type AnalyticsControllerOptInAction = {
  type: `AnalyticsController:optIn`;
  handler: AnalyticsController['optIn'];
};

/**
 * Opt out of analytics.
 *
 * Records that a consent decision has been made and discards any persisted
 * events so nothing captured before the decision is ever delivered.
 */
export type AnalyticsControllerOptOutAction = {
  type: `AnalyticsController:optOut`;
  handler: AnalyticsController['optOut'];
};

/**
 * Reset the consent decision back to undecided.
 *
 * Intended for client flows that restart onboarding. Clears the opt-in
 * preference and discards the delivery queue, but preserves any pre-consent
 * events so they can still be replayed if the user opts in again. The user is
 * treated as undecided again.
 */
export type AnalyticsControllerResetConsentDecisionAction = {
  type: `AnalyticsController:resetConsentDecision`;
  handler: AnalyticsController['resetConsentDecision'];
};

/**
 * Union of all AnalyticsController action types.
 */
export type AnalyticsControllerMethodActions =
  | AnalyticsControllerTrackEventAction
  | AnalyticsControllerIdentifyAction
  | AnalyticsControllerTrackViewAction
  | AnalyticsControllerOptInAction
  | AnalyticsControllerOptOutAction
  | AnalyticsControllerResetConsentDecisionAction;
