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
 * Create an event fragment.
 *
 * A fragment accumulates properties across a user journey so that several
 * parts of a client can contribute to the same set of events without
 * re-deriving them. Declaring `successEvent` and `failureEvent` turns the
 * fragment into a funnel that {@link finalizeEventFragment} closes. Declaring
 * none of the event names makes it a pure property bag that the client reads
 * back with {@link getEventFragmentById} when it emits its own events.
 *
 * Any existing fragment with the same ID is replaced, so a new journey never
 * inherits properties from a stale one.
 *
 * Nothing is created unless the user is opted in, or undecided with the
 * pre-consent queue enabled, so an opted-out user accumulates no fragment
 * data.
 *
 * @param options - The fragment definition. An ID is generated when one is
 * not supplied.
 * @returns The created fragment, or `undefined` when the event fragments
 * feature is disabled or the consent state does not allow capture.
 */
export type AnalyticsControllerCreateEventFragmentAction = {
  type: `AnalyticsController:createEventFragment`;
  handler: AnalyticsController['createEventFragment'];
};

/**
 * Write to an event fragment, creating a property bag if none exists.
 *
 * This is the ergonomic entry point for contributors that do not know
 * whether the journey has been started yet, and it avoids the read then
 * write race a caller would otherwise have to implement itself.
 *
 * @param id - The fragment ID.
 * @param payload - The properties and context to merge in.
 */
export type AnalyticsControllerUpsertEventFragmentAction = {
  type: `AnalyticsController:upsertEventFragment`;
  handler: AnalyticsController['upsertEventFragment'];
};

/**
 * Write to an existing event fragment.
 *
 * @param id - The fragment ID.
 * @param payload - The properties and context to merge in.
 * @throws Error if no fragment has that ID. Use {@link upsertEventFragment}
 * when the fragment may not exist yet.
 */
export type AnalyticsControllerUpdateEventFragmentAction = {
  type: `AnalyticsController:updateEventFragment`;
  handler: AnalyticsController['updateEventFragment'];
};

/**
 * Read an event fragment.
 *
 * @param id - The fragment ID.
 * @returns The fragment, or `undefined` when no fragment has that ID, the
 * event fragments feature is disabled, or the consent state does not allow
 * capture.
 */
export type AnalyticsControllerGetEventFragmentByIdAction = {
  type: `AnalyticsController:getEventFragmentById`;
  handler: AnalyticsController['getEventFragmentById'];
};

/**
 * Discard an event fragment without emitting anything.
 *
 * @param id - The fragment ID.
 */
export type AnalyticsControllerDeleteEventFragmentAction = {
  type: `AnalyticsController:deleteEventFragment`;
  handler: AnalyticsController['deleteEventFragment'];
};

/**
 * Close an event fragment, emitting its closing event and discarding it.
 *
 * The event emitted is `failureEvent` when the journey was abandoned and
 * `successEvent` otherwise. A fragment that does not declare the relevant
 * event name is discarded silently, which is what makes a pure property bag
 * possible.
 *
 * @param id - The fragment ID.
 * @param options - Finalization options.
 * @param options.abandoned - Whether the journey was abandoned.
 * @param options.context - Context merged over the fragment's own context.
 * @throws Error if no fragment has that ID.
 */
export type AnalyticsControllerFinalizeEventFragmentAction = {
  type: `AnalyticsController:finalizeEventFragment`;
  handler: AnalyticsController['finalizeEventFragment'];
};

/**
 * Opt in to analytics.
 *
 * Records that a consent decision has been made and replays any events that
 * were queued while the user was undecided.
 *
 * When geolocation enrichment is enabled, geolocation is resolved here (once
 * the user has consented) and awaited before the queued events are replayed,
 * so those events are enriched with the resolved location as they are sent.
 *
 * @returns A promise that resolves once opt-in processing has completed.
 */
export type AnalyticsControllerOptInAction = {
  type: `AnalyticsController:optIn`;
  handler: AnalyticsController['optIn'];
};

/**
 * Opt out of analytics.
 *
 * Records that a consent decision has been made and discards any persisted
 * events and in-progress event fragments so nothing captured before the
 * decision is ever delivered.
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
 *
 * In-progress event fragments are kept only while the undecided user can
 * still accumulate them, and discarded otherwise, so no fragment outlives the
 * consent state that allowed it.
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
  | AnalyticsControllerCreateEventFragmentAction
  | AnalyticsControllerUpsertEventFragmentAction
  | AnalyticsControllerUpdateEventFragmentAction
  | AnalyticsControllerGetEventFragmentByIdAction
  | AnalyticsControllerDeleteEventFragmentAction
  | AnalyticsControllerFinalizeEventFragmentAction
  | AnalyticsControllerOptInAction
  | AnalyticsControllerOptOutAction
  | AnalyticsControllerResetConsentDecisionAction;
