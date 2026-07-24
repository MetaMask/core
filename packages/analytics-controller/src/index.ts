// Export controller class and state utilities
export {
  AnalyticsController,
  getDefaultAnalyticsControllerState,
} from './AnalyticsController.js';
export type { AnalyticsControllerOptions } from './AnalyticsController.js';

// Export errors
export { AnalyticsPlatformAdapterSetupError } from './AnalyticsPlatformAdapterSetupError.js';

// Export types
export type {
  AnalyticsContext,
  AnalyticsEventProperties,
  AnalyticsDeliveryOptions,
  AnalyticsInvocationCallback,
  AnalyticsUserTraits,
  AnalyticsPlatformAdapter,
  AnalyticsTrackingEvent,
} from './AnalyticsPlatformAdapter.types';

// Export state types
export type {
  AnalyticsControllerState,
  AnalyticsEventQueue,
  AnalyticsQueuedEvent,
  AnalyticsQueuedEventType,
  AnalyticsQueuedTrackEvent,
  AnalyticsQueuedIdentifyEvent,
  AnalyticsQueuedViewEvent,
} from './AnalyticsController.js';

// Export selectors
export { analyticsControllerSelectors } from './selectors.js';

// Export messenger types
export type { AnalyticsControllerMessenger } from './AnalyticsController.js';

// Export action and event types
export type {
  AnalyticsControllerActions,
  AnalyticsControllerEvents,
  AnalyticsControllerGetStateAction,
  AnalyticsControllerStateChangeEvent,
} from './AnalyticsController.js';
export type {
  AnalyticsControllerTrackEventAction,
  AnalyticsControllerIdentifyAction,
  AnalyticsControllerTrackViewAction,
  AnalyticsControllerOptInAction,
  AnalyticsControllerOptOutAction,
  AnalyticsControllerResetConsentDecisionAction,
  AnalyticsControllerMethodActions,
} from './AnalyticsController-method-action-types.js';
