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
 * Callback invoked by the platform adapter after an analytics payload is
 * delivered or fails.
 */
export type AnalyticsInvocationCallback = (error?: unknown) => void;

/**
 * Internal delivery metadata used by AnalyticsController when event queue
 * persistence is enabled.
 */
export type AnalyticsDeliveryOptions = {
  /**
   * Stable identifier for the analytics payload.
   */
  messageId?: string;

  /**
   * Original timestamp for the analytics payload.
   */
  timestamp?: Date;

  /**
   * Callback for delivery acknowledgement.
   */
  callback?: AnalyticsInvocationCallback;
};

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
 * Optional analytics context payload (for example Segment-style context).
 */
export type AnalyticsContext = Record<string, Json>;

/**
 * Platform adapter interface for analytics tracking
 * Implementations should handle platform-specific details (Segment SDK, etc.)
 */
export type AnalyticsPlatformAdapter = {
  /**
   * When `true`, the controller accepts any non-empty `analyticsId` string
   * instead of requiring UUIDv4 format. Defaults to validation against UUIDv4 when omitted or `false`.
   */
  skipUUIDv4Check?: boolean;

  /**
   * Track an analytics event.
   *
   * This is the same as trackEvent in the old analytics system
   *
   * @param eventName - The name of the event
   * @param properties - Event properties. If not provided, the event has no properties.
   * The privacy plugin should check for `isSensitive === true` to determine if an event contains sensitive data.
   * @param context - Optional platform-specific context attached to the invocation.
   * @param options - Optional delivery metadata for platform adapters.
   */
  track(
    eventName: string,
    properties?: AnalyticsEventProperties,
    context?: AnalyticsContext,
    options?: AnalyticsDeliveryOptions,
  ): void;

  /**
   * Identify a user with traits.
   *
   * @param userId - The user identifier (e.g., metametrics ID)
   * @param traits - User traits/properties
   * @param context - Optional platform-specific context attached to the invocation.
   * @param options - Optional delivery metadata for platform adapters.
   */
  identify(
    userId: string,
    traits?: AnalyticsUserTraits,
    context?: AnalyticsContext,
    options?: AnalyticsDeliveryOptions,
  ): void;

  /**
   * Track a UI unit (page or screen) view depending on the platform
   *
   * This method delegates to platform-specific Segment SDK methods:
   * - Web adapters should call `analytics.page(name, properties)`
   * - Mobile adapters should call `analytics.screen(name, properties)`
   *
   * @param name - The identifier/name of the page or screen being viewed (e.g., "home", "settings", "wallet")
   * @param properties - Optional properties associated with the view
   * @param context - Optional platform-specific context attached to the invocation.
   * @param options - Optional delivery metadata for platform adapters.
   */
  view(
    name: string,
    properties?: AnalyticsEventProperties,
    context?: AnalyticsContext,
    options?: AnalyticsDeliveryOptions,
  ): void;

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
   * onSetupCompleted(analyticsId: string): void {
   *   // Add platform-specific plugins that require analyticsId
   *   client.add({
   *     plugin: new PrivacyPlugin(analyticsId),
   *   });
   * }
   * ```
   */
  onSetupCompleted(analyticsId: string): void;
};
