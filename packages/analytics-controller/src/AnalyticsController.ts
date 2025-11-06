import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { v4 as uuidv4 } from 'uuid';

import type { AnalyticsControllerMethodActions } from './AnalyticsController-method-action-types';
import { projectLogger } from './AnalyticsLogger';
import type {
  AnalyticsPlatformAdapter,
  AnalyticsEventProperties,
} from './AnalyticsPlatformAdapter.types';

// === GENERAL ===

/**
 * The name of the {@link AnalyticsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'AnalyticsController';

// === STATE ===

/**
 * Describes the shape of the state object for {@link AnalyticsController}.
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
   * User's UUIDv4 analytics identifier
   */
  analyticsId: string;
};

/**
 * The metadata for each property in {@link AnalyticsControllerState}.
 */
const analyticsControllerMetadata = {
  enabled: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  optedIn: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  analyticsId: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
} satisfies StateMetadata<AnalyticsControllerState>;

/**
 * Constructs the default {@link AnalyticsController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link AnalyticsController} state.
 */
export function getDefaultAnalyticsControllerState(): AnalyticsControllerState {
  return {
    enabled: true,
    optedIn: false,
    analyticsId: uuidv4(),
  };
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'trackEvent',
  'identify',
  'trackPage',
  'enable',
  'disable',
  'optIn',
  'optOut',
] as const;

/**
 * Returns the state of the {@link AnalyticsController}.
 */
export type AnalyticsControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AnalyticsControllerState
>;

/**
 * Actions that {@link AnalyticsControllerMessenger} exposes to other consumers.
 */
export type AnalyticsControllerActions =
  | AnalyticsControllerGetStateAction
  | AnalyticsControllerMethodActions;

/**
 * Actions from other messengers that {@link AnalyticsControllerMessenger} calls.
 */
type AllowedActions = never;

/**
 * Event emitted when the state of the {@link AnalyticsController} changes.
 */
export type AnalyticsControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AnalyticsControllerState
>;

/**
 * Events that {@link AnalyticsControllerMessenger} exposes to other consumers.
 */
export type AnalyticsControllerEvents = AnalyticsControllerStateChangeEvent;

/**
 * Events from other messengers that {@link AnalyticsControllerMessenger} subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link AnalyticsController}.
 */
export type AnalyticsControllerMessenger = Messenger<
  typeof controllerName,
  AnalyticsControllerActions | AllowedActions,
  AnalyticsControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * The options that AnalyticsController takes.
 */
export type AnalyticsControllerOptions = {
  state?: Partial<AnalyticsControllerState>;
  messenger: AnalyticsControllerMessenger;
  /**
   * Platform adapter implementation for tracking events
   */
  platformAdapter: AnalyticsPlatformAdapter;
};

/**
 * The AnalyticsController manages analytics tracking across platforms (Mobile/Extension).
 * It provides a unified interface for tracking events, identifying users, and managing
 * analytics preferences while delegating platform-specific implementation to an
 * {@link AnalyticsPlatformAdapter}.
 *
 * This controller follows the MetaMask controller pattern and integrates with the
 * messenger system to allow other controllers and components to track analytics events.
 * It delegates platform-specific implementation to an {@link AnalyticsPlatformAdapter}.
 */
export class AnalyticsController extends BaseController<
  'AnalyticsController',
  AnalyticsControllerState,
  AnalyticsControllerMessenger
> {
  readonly #platformAdapter: AnalyticsPlatformAdapter;

  /**
   * Constructs an AnalyticsController instance.
   *
   * @param options - Controller options
   * @param options.state - Initial controller state (defaults from getDefaultAnalyticsControllerState)
   * @param options.messenger - Messenger used to communicate with BaseController
   * @param options.platformAdapter - Platform adapter implementation for tracking
   */
  constructor({
    state = {},
    messenger,
    platformAdapter,
  }: AnalyticsControllerOptions) {
    super({
      name: controllerName,
      metadata: analyticsControllerMetadata,
      state: {
        ...getDefaultAnalyticsControllerState(),
        ...state,
      },
      messenger,
    });

    this.#platformAdapter = platformAdapter;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    projectLogger('AnalyticsController initialized and ready', {
      enabled: this.state.enabled,
      optedIn: this.state.optedIn,
      analyticsId: this.state.analyticsId,
    });
  }

  /**
   * Track an analytics event.
   *
   * Events are only tracked if analytics is enabled.
   *
   * @param eventName - The name of the event
   * @param properties - Event properties
   */
  trackEvent(
    eventName: string,
    properties: AnalyticsEventProperties = {},
  ): void {
    // Don't track if analytics is disabled
    if (!this.state.enabled) {
      return;
    }

    // Delegate to platform adapter
    this.#platformAdapter.trackEvent(eventName, properties);
  }

  /**
   * Identify a user for analytics.
   *
   * @param userId - The user identifier (e.g., metametrics ID)
   * @param traits - User traits/properties
   */
  identify(userId: string, traits?: AnalyticsEventProperties): void {
    if (!this.state.enabled) {
      return;
    }

    // Update state with analytics ID
    this.update((state) => {
      state.analyticsId = userId;
    });

    // Delegate to platform adapter if supported
    if (this.#platformAdapter.identify) {
      this.#platformAdapter.identify(userId, traits);
    }
  }

  /**
   * Track a page view.
   *
   * @param pageName - The name of the page
   * @param properties - Page properties
   */
  trackPage(pageName: string, properties?: AnalyticsEventProperties): void {
    if (!this.state.enabled) {
      return;
    }

    // Delegate to platform adapter if supported
    if (this.#platformAdapter.trackPage) {
      this.#platformAdapter.trackPage(pageName, properties);
    }
  }

  /**
   * Enable analytics tracking.
   */
  enable(): void {
    this.update((state) => {
      state.enabled = true;
    });
  }

  /**
   * Disable analytics tracking.
   */
  disable(): void {
    this.update((state) => {
      state.enabled = false;
    });
  }

  /**
   * Opt in to analytics.
   */
  optIn(): void {
    this.update((state) => {
      state.optedIn = true;
    });
  }

  /**
   * Opt out of analytics.
   */
  optOut(): void {
    this.update((state) => {
      state.optedIn = false;
    });
  }
}
