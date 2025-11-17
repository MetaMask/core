import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import {
  v4 as uuidv4,
  validate as uuidValidate,
  version as uuidVersion,
} from 'uuid';

import type { AnalyticsControllerMethodActions } from './AnalyticsController-method-action-types';
import { projectLogger } from './AnalyticsLogger';
import type {
  AnalyticsPlatformAdapter,
  AnalyticsEventProperties,
  AnalyticsUserTraits,
  AnalyticsTrackingEvent,
} from './AnalyticsPlatformAdapter.types';
import { computeEnabledState } from './analyticsStateComputer';

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
   * User domain: Whether the user has opted in to analytics.
   */
  user_optedIn: boolean;

  /**
   * User domain: Whether the user has opted in to analytics through social account.
   */
  user_socialOptedIn: boolean;

  /**
   * User domain: User's UUIDv4 analytics identifier.
   */
  user_analyticsId: string;
};

/**
 * The metadata for each property in {@link AnalyticsControllerState}.
 */
const analyticsControllerMetadata = {
  user_optedIn: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  user_socialOptedIn: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  user_analyticsId: {
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
    user_optedIn: false,
    user_socialOptedIn: false,
    user_analyticsId: uuidv4(),
  };
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'trackEvent',
  'identify',
  'trackView',
  'optIn',
  'optOut',
  'socialOptIn',
  'socialOptOut',
  'getAnalyticsId',
  'isEnabled',
  'isOptedIn',
  'isSocialOptedIn',
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
   * @param options.state - Initial controller state (defaults from getDefaultAnalyticsControllerState).
   * For migration from a previous system, pass the existing analytics ID via state.user_analyticsId.
   * @param options.messenger - Messenger used to communicate with BaseController
   * @param options.platformAdapter - Platform adapter implementation for tracking
   */
  constructor({
    state = {},
    messenger,
    platformAdapter,
  }: AnalyticsControllerOptions) {
    const initialState = {
      ...getDefaultAnalyticsControllerState(),
      ...state,
    };

    super({
      name: controllerName,
      metadata: analyticsControllerMetadata,
      state: initialState,
      messenger,
    });

    this.#platformAdapter = platformAdapter;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    projectLogger('AnalyticsController initialized and ready', {
      enabled: computeEnabledState(this.state),
      optedIn: this.state.user_optedIn,
      socialOptedIn: this.state.user_socialOptedIn,
      analyticsId: this.state.user_analyticsId,
    });

    // Call onSetupCompleted lifecycle hook after initialization
    // Only call if analyticsId is set and is a valid UUIDv4 (this is the definition of "completed" setup)
    if (
      this.state.user_analyticsId &&
      uuidValidate(this.state.user_analyticsId) &&
      uuidVersion(this.state.user_analyticsId) === 4
    ) {
      try {
        this.#platformAdapter.onSetupCompleted(this.state.user_analyticsId);
      } catch (error) {
        // Log error but don't throw - adapter setup failure shouldn't break controller
        projectLogger('Error calling platformAdapter.onSetupCompleted', error);
      }
    } else {
      // analyticsId is undefined, null, empty string, or not a valid UUIDv4
      throw new Error(
        `Invalid analyticsId: expected a valid UUIDv4, but got ${JSON.stringify(this.state.user_analyticsId)}`,
      );
    }
  }

  /**
   * Track an analytics event.
   *
   * Events are only tracked if analytics is enabled.
   *
   * @param event - Analytics event with properties and sensitive properties
   */
  trackEvent(event: AnalyticsTrackingEvent): void {
    // Don't track if analytics is disabled
    if (!computeEnabledState(this.state)) {
      return;
    }

    // if event does not have properties, only send the non-anonymous empty event
    // and return to prevent any additional processing
    if (!event.hasProperties) {
      this.#platformAdapter.track(event.name, {
        anonymous: false,
      } as AnalyticsEventProperties);

      return;
    }

    // Log all non-anonymous properties, or an empty event if there's no non-anon props.
    this.#platformAdapter.track(event.name, {
      anonymous: false,
      ...event.properties,
    } as AnalyticsEventProperties);

    // Track all sensitive properties in an anonymous event
    if (event.isAnonymous) {
      this.#platformAdapter.track(event.name, {
        anonymous: true,
        ...event.properties,
        ...event.sensitiveProperties,
      } as AnalyticsEventProperties);
    }
  }

  /**
   * Identify a user for analytics.
   *
   * @param traits - User traits/properties
   */
  identify(traits?: AnalyticsUserTraits): void {
    if (!computeEnabledState(this.state)) {
      return;
    }

    // Delegate to platform adapter if supported, using the current analytics ID
    if (this.#platformAdapter.identify) {
      this.#platformAdapter.identify(this.state.user_analyticsId, traits);
    }
  }

  /**
   * Track a page view.
   *
   * @param name - The name of the UI item being viewed (pages for web, screen for mobile)
   * @param properties - UI item properties
   */
  trackView(name: string, properties?: AnalyticsEventProperties): void {
    if (!computeEnabledState(this.state)) {
      return;
    }

    // Delegate to platform adapter
    this.#platformAdapter.view(name, properties);
  }

  /**
   * Opt in to analytics.
   * This updates the user's opt-in status.
   */
  optIn(): void {
    this.update((state) => {
      state.user_optedIn = true;
    });
  }

  /**
   * Opt out of analytics.
   * This updates the user's opt-in status.
   */
  optOut(): void {
    this.update((state) => {
      state.user_optedIn = false;
    });
  }

  /**
   * Opt in to analytics through social account.
   * This updates the user's social opt-in status.
   */
  socialOptIn(): void {
    this.update((state) => {
      state.user_socialOptedIn = true;
    });
  }

  /**
   * Opt out of analytics through social account.
   * This updates the user's social opt-in status.
   */
  socialOptOut(): void {
    this.update((state) => {
      state.user_socialOptedIn = false;
    });
  }

  /**
   * Get the analytics ID from the controller state.
   *
   * @returns The current analytics ID.
   */
  getAnalyticsId(): string {
    return this.state.user_analyticsId;
  }

  /**
   * Get the enabled status from the controller state.
   * This is computed from user state via the state machine.
   *
   * @returns The current enabled status.
   */
  isEnabled(): boolean {
    return computeEnabledState(this.state);
  }

  /**
   * Get the opted in status from the controller state.
   *
   * @returns The current opted in status.
   */
  isOptedIn(): boolean {
    return this.state.user_optedIn;
  }

  /**
   * Get the social opted in status from the controller state.
   *
   * @returns The current social opted in status.
   */
  isSocialOptedIn(): boolean {
    return this.state.user_socialOptedIn;
  }
}
