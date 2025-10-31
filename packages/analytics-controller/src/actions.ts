import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type {
  AnalyticsEventProperties,
  AnalyticsControllerState,
} from './types';

// Unique name for the controller
const controllerName = 'AnalyticsController';

/**
 * Returns the state of the {@link AnalyticsController}.
 */
export type AnalyticsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AnalyticsControllerState
>;

/**
 * Action to track an analytics event
 */
export type AnalyticsControllerTrackEventAction = {
  type: `${typeof controllerName}:trackEvent`;
  handler: (
    eventName: string,
    properties: AnalyticsEventProperties,
  ) => void;
};

/**
 * Action to identify a user
 */
export type AnalyticsControllerIdentifyAction = {
  type: `${typeof controllerName}:identify`;
  handler: (userId: string, traits?: AnalyticsEventProperties) => void;
};

/**
 * Action to track a page view
 */
export type AnalyticsControllerTrackPageAction = {
  type: `${typeof controllerName}:trackPage`;
  handler: (pageName: string, properties?: AnalyticsEventProperties) => void;
};

/**
 * Action to set enabled state
 */
export type AnalyticsControllerSetEnabledAction = {
  type: `${typeof controllerName}:setEnabled`;
  handler: (enabled?: boolean) => void;
};

/**
 * Action to set opted-in state
 */
export type AnalyticsControllerSetOptedInAction = {
  type: `${typeof controllerName}:setOptedIn`;
  handler: (optedIn?: boolean) => void;
};

/**
 * Actions exposed by the {@link AnalyticsController}.
 */
export type AnalyticsControllerActions =
  | AnalyticsControllerGetStateAction
  | AnalyticsControllerTrackEventAction
  | AnalyticsControllerIdentifyAction
  | AnalyticsControllerTrackPageAction
  | AnalyticsControllerSetEnabledAction
  | AnalyticsControllerSetOptedInAction;

/**
 * Event emitted when the state of the {@link AnalyticsController} changes.
 */
export type AnalyticsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AnalyticsControllerState
>;

/**
 * Events that can be emitted by the {@link AnalyticsController}
 */
export type AnalyticsControllerEvents = AnalyticsControllerStateChangeEvent;

export { controllerName };

