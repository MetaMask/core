// Export controller class and state utilities
export {
  AnalyticsController,
  getDefaultAnalyticsControllerState,
} from './AnalyticsController';
export type { AnalyticsControllerOptions } from './AnalyticsController';

// Export errors
export { AnalyticsPlatformAdapterSetupError } from './AnalyticsPlatformAdapterSetupError';

// Export types
export type {
  AnalyticsEventProperties,
  AnalyticsUserTraits,
  AnalyticsPlatformAdapter,
  AnalyticsTrackingEvent,
} from './AnalyticsPlatformAdapter.types';

// Export state types
export type { AnalyticsControllerState } from './AnalyticsController';

// Export selectors
export { analyticsControllerSelectors } from './selectors';

// Export messenger types
export type { AnalyticsControllerMessenger } from './AnalyticsController';

// Export action and event types
export type {
  AnalyticsControllerActions,
  AnalyticsControllerEvents,
  AnalyticsControllerGetStateAction,
  AnalyticsControllerStateChangeEvent,
} from './AnalyticsController';
export type {
  AnalyticsControllerTrackEventAction,
  AnalyticsControllerIdentifyAction,
  AnalyticsControllerTrackViewAction,
  AnalyticsControllerOptInAction,
  AnalyticsControllerOptOutAction,
  AnalyticsControllerMethodActions,
} from './AnalyticsController-method-action-types';
