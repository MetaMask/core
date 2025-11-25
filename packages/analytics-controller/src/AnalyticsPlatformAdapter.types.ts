import type { Json } from '@metamask/utils';

/**
 * Analytics event properties
 */
export type AnalyticsEventProperties = Record<string, Json>;

/**
 * User traits/properties for analytics identification
 */
export type AnalyticsUserTraits = Record<string, Json>;

/**
 * Event properties structure with two distinct properties lists for regular and sensitive data.
 * Similar to ITrackingEvent from legacy analytics but decoupled for platform agnosticism.
 * Sensitivity is derived from the presence of sensitiveProperties (if sensitiveProperties has keys, the event is sensitive).
 */
export type AnalyticsTrackingEvent = {
  readonly name: string;
  properties: AnalyticsEventProperties;
  sensitiveProperties: AnalyticsEventProperties;
  /**
   * Legacy property handled by the mobile app.
   * This property is ignored by the analytics controller and will be removed from the type in the future.
   * The mobile app will use the future analytics privacy controller to handle this functionality.
   */
  saveDataRecording: boolean;
  readonly hasProperties: boolean;
};

/**
 * Platform adapter interface for analytics tracking
 * Implementations should handle platform-specific details (Segment SDK, etc.)
 */
export type AnalyticsPlatformAdapter = {
  /**
   * Track an analytics event.
   *
   * This is the same as trackEvent in the old analytics system
   *
   * @param eventName - The name of the event
   * @param properties - Event properties. If not provided, the event has no properties.
   * The privacy plugin should check for `isSensitive === true` to determine if an event contains sensitive data.
   */
  track(eventName: string, properties?: AnalyticsEventProperties): void;

  /**
   * Identify a user with traits.
   *
   * @param userId - The user identifier (e.g., metametrics ID)
   * @param traits - User traits/properties
   */
  identify(userId: string, traits?: AnalyticsUserTraits): void;

  /**
   * Track a UI unit (page or screen) view depending on the platform
   *
   * This method delegates to platform-specific Segment SDK methods:
   * - Web adapters should call `analytics.page(name, properties)`
   * - Mobile adapters should call `analytics.screen(name, properties)`
   *
   * @param name - The identifier/name of the page or screen being viewed (e.g., "home", "settings", "wallet")
   * @param properties - Optional properties associated with the view
   */
  view(name: string, properties?: AnalyticsEventProperties): void;

  /**
   * Lifecycle hook called after the AnalyticsController is fully initialized.
   *
   * This hook allows platform-specific adapters to perform setup that requires
   * access to the controller's state (e.g., analyticsId).
   *
   * The controller calls this method once after initialization, passing the
   * analyticsId from controller state. The analyticsId is guaranteed to be set
   * when this method is called - this is the definition of "completed" setup.
   *
   * @param analyticsId - The analytics ID from controller state. Always set (never empty).
   * @throws {AnalyticsPlatformAdapterSetupError} May throw errors during setup (e.g., configuration errors, network failures).
   * Errors thrown by this method are caught and logged by the controller, but do not prevent
   * controller initialization from completing successfully.
   *
   * @example
   * ```typescript
   * async onSetupCompleted(analyticsId: string): Promise<void> {
   *   // Add platform-specific plugins that require analyticsId
   *   client.add({
   *     plugin: new PrivacyPlugin(analyticsId),
   *   });
   * }
   * ```
   */
  onSetupCompleted(analyticsId: string): Promise<void>;
};
