// Export controller class
export { AnalyticsController } from './AnalyticsController';
export type { AnalyticsControllerOptions } from './AnalyticsController';

// Export types
export type {
  AnalyticsEventProperties,
  AnalyticsUserTraits,
  AnalyticsPlatformAdapter,
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
  AnalyticsControllerEnableAction,
  AnalyticsControllerDisableAction,
  AnalyticsControllerOptInAction,
  AnalyticsControllerOptOutAction,
  AnalyticsControllerGetAnalyticsIdAction,
  AnalyticsControllerIsEnabledAction,
  AnalyticsControllerMethodActions,
} from './AnalyticsController-method-action-types';
