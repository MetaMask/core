import type { Json } from '@metamask/utils';

/**
 * Platform type identifier for analytics
 */
export type Platform = 'EXTENSION' | 'MOBILE';

/**
 * Analytics event properties
 */
export type AnalyticsEventProperties = Record<string, Json>;

/**
 * Analytics event options
 */
export type AnalyticsEventOptions = {
  /**
   * Whether this event is sensitive and should respect user opt-out preferences
   */
  isOptIn?: boolean;

  /**
   * Whether to exclude this event from being sent
   */
  excludeFromMetrics?: boolean;

  /**
   * Additional metadata to include with the event
   */
  metadata?: AnalyticsEventProperties;
};

/**
 * Platform adapter interface for analytics tracking
 * Implementations should handle platform-specific details (Segment SDK, etc.)
 */
export interface PlatformAdapter {
  /**
   * The platform identifier
   */
  platform: Platform;

  /**
   * Track an analytics event
   *
   * @param eventName - The name of the event
   * @param properties - Event properties
   * @param options - Event options
   */
  trackEvent(
    eventName: string,
    properties: AnalyticsEventProperties,
    options?: AnalyticsEventOptions,
  ): void | Promise<void>;

  /**
   * Identify a user
   *
   * @param userId - The user identifier (e.g., metametrics ID)
   * @param traits - User traits/properties
   */
  identify?(userId: string, traits?: AnalyticsEventProperties): void | Promise<void>;

  /**
   * Track a page view
   *
   * @param pageName - The name of the page
   * @param properties - Page properties
   */
  trackPage?(pageName: string, properties?: AnalyticsEventProperties): void | Promise<void>;
}

/**
 * The state of the AnalyticsController
 */
export type AnalyticsControllerState = {
  /**
   * Whether analytics tracking is enabled
   */
  enabled: boolean;

  /**
   * Whether the user has opted in to analytics
   */
  optedIn: boolean;

  /**
   * User's analytics identifier (e.g., metametrics ID)
   */
  analyticsId: string | null;

  /**
   * Platform identifier
   */
  platform: Platform | null;

  /**
   * Total number of events tracked
   */
  eventsTracked: number;
};

