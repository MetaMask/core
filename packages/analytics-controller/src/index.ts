// Export controller class
export { AnalyticsController } from './AnalyticsController';
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

// Export state types and utilities
export type { AnalyticsControllerState } from './AnalyticsController';
export { getDefaultAnalyticsControllerState } from './AnalyticsController';

// Export messenger types
export type { AnalyticsControllerMessenger } from './AnalyticsController';

// Export action and event types
export type {
  AnalyticsControllerActions,
  AnalyticsControllerEvents,
  AnalyticsControllerGetStateAction,
  AnalyticsControllerStateChangeEvent,
  controllerName,
} from './AnalyticsController';
export type {
  AnalyticsControllerTrackEventAction,
  AnalyticsControllerIdentifyAction,
  AnalyticsControllerTrackViewAction,
  AnalyticsControllerOptInAction,
  AnalyticsControllerOptOutAction,
  AnalyticsControllerSocialOptInAction,
  AnalyticsControllerSocialOptOutAction,
  AnalyticsControllerGetAnalyticsIdAction,
  AnalyticsControllerIsEnabledAction,
  AnalyticsControllerIsOptedInAction,
  AnalyticsControllerIsSocialOptedInAction,
  AnalyticsControllerMethodActions,
} from './AnalyticsController-method-action-types';
