import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type {
  AnalyticsEventOptions,
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
    options?: AnalyticsEventOptions,
  ) => void | Promise<void>;
};

/**
 * Action to identify a user
 */
export type AnalyticsControllerIdentifyAction = {
  type: `${typeof controllerName}:identify`;
  handler: (userId: string, traits?: AnalyticsEventProperties) => void | Promise<void>;
};

/**
 * Action to track a page view
 */
export type AnalyticsControllerTrackPageAction = {
  type: `${typeof controllerName}:trackPage`;
  handler: (pageName: string, properties?: AnalyticsEventProperties) => void | Promise<void>;
};

/**
 * Action to enable analytics
 */
export type AnalyticsControllerEnableAction = {
  type: `${typeof controllerName}:enable`;
  handler: () => void;
};

/**
 * Action to disable analytics
 */
export type AnalyticsControllerDisableAction = {
  type: `${typeof controllerName}:disable`;
  handler: () => void;
};

/**
 * Action to set opted-in state
 */
export type AnalyticsControllerSetOptedInAction = {
  type: `${typeof controllerName}:setOptedIn`;
  handler: (optedIn: boolean) => void;
};

/**
 * Actions exposed by the {@link AnalyticsController}.
 */
export type AnalyticsControllerActions =
  | AnalyticsControllerGetStateAction
  | AnalyticsControllerTrackEventAction
  | AnalyticsControllerIdentifyAction
  | AnalyticsControllerTrackPageAction
  | AnalyticsControllerEnableAction
  | AnalyticsControllerDisableAction
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

/**
 * Actions that this controller is allowed to call.
 */
type AllowedActions = never;

/**
 * Events that this controller is allowed to subscribe to.
 */
type AllowedEvents = never;

export { controllerName };

