import type { Json } from '@metamask/utils';

/**
 * Analytics event properties
 */
export type AnalyticsEventProperties = Record<string, Json>;

/**
 * Platform adapter interface for analytics tracking
 * Implementations should handle platform-specific details (Segment SDK, etc.)
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
