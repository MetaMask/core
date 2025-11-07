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
 * Platform adapter interface for analytics tracking
 * Implementations should handle platform-specific details (Segment SDK, etc.)
 */
export interface AnalyticsPlatformAdapter {
  /**
   * Track an analytics event.
   *
   * This is the same as trackEvent in the old analytics system
   *
   * @param eventName - The name of the event
   * @param properties - Event properties
   */
  track(eventName: string, properties: AnalyticsEventProperties): void;

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
   * This is the same as page in Segment web SDK and screen in Segment mobile SDK.
   * Each platform adapter should implement this method to track UI views
   * using the appropriate method for the platform: "pages" for web, "screen" for mobile.
   *
   * @param name - The name of the UI item being viewed (pages for web, screen for mobile)
   * @param properties - Page properties
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
}
