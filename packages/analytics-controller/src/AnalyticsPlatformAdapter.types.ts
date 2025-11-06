import type { Json } from '@metamask/utils';

/**
 * Analytics event properties
 */
export type AnalyticsEventProperties = Record<string, Json>;

/**
 * Platform adapter interface for analytics tracking
 * Implementations should handle platform-specific details (Segment SDK, etc.)
 *
 * @todo This type is work in progress and will be updated as we
 * integrate with the new analytics system on mobile.
 * We have this draft type to help us iterate on the implementation.
 * It will be updated with proper types as we create the mobile adapter
 * And the controller package will be released only when this is completed.
 */
export type AnalyticsPlatformAdapter = {
  /**
   * Track an analytics event
   *
   * @param eventName - The name of the event
   * @param properties - Event properties
   */
  trackEvent(eventName: string, properties: AnalyticsEventProperties): void;

  /**
   * Identify a user
   *
   * @param userId - The user identifier (e.g., metametrics ID)
   * @param traits - User traits/properties
   */
  identify?(userId: string, traits?: AnalyticsEventProperties): void;

  /**
   * Track a page view
   *
   * @param pageName - The name of the page
   * @param properties - Page properties
   */
  trackPage?(pageName: string, properties?: AnalyticsEventProperties): void;
};
