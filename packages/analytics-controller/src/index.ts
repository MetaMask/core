// Export controller class
export { AnalyticsController } from './AnalyticsController';
export type { AnalyticsControllerOptions } from './AnalyticsController';

// Export types
export type {
  AnalyticsEventProperties,
  PlatformAdapter,
  AnalyticsControllerState,
} from './types';

// Export state utilities
export { getDefaultAnalyticsControllerState } from './state';

// Export messenger types
export type { AnalyticsControllerMessenger } from './messenger';

// Export action and event types
export type {
  AnalyticsControllerActions,
  AnalyticsControllerEvents,
  AnalyticsControllerGetStateAction,
  AnalyticsControllerTrackEventAction,
  AnalyticsControllerIdentifyAction,
  AnalyticsControllerTrackPageAction,
  AnalyticsControllerSetEnabledAction,
  AnalyticsControllerSetOptedInAction,
  AnalyticsControllerStateChangeEvent,
} from './actions';
