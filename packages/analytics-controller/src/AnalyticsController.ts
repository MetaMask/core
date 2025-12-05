import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { AnalyticsControllerMethodActions } from './AnalyticsController-method-action-types';
import { validateAnalyticsControllerState } from './analyticsControllerStateValidator';
import { projectLogger } from './AnalyticsLogger';
import type {
  AnalyticsPlatformAdapter,
  AnalyticsEventProperties,
  AnalyticsUserTraits,
  AnalyticsTrackingEvent,
} from './AnalyticsPlatformAdapter.types';
import { analyticsControllerSelectors } from './selectors';

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
   * Whether the user has opted in to analytics.
   */
  optedIn: boolean;

  /**
   * User's UUIDv4 analytics identifier.
   * This is an identity (unique per user), not a preference.
   * Must be provided by the platform - the controller does not generate it.
   */
  analyticsId: string;
};

/**
 * Returns default values for AnalyticsController state.
 *
 * Note: analyticsId is NOT included - it's an identity that must be
 * provided by the platform (generated once on first run, then persisted).
 *
 * @returns Default state without analyticsId
 */
export function getDefaultAnalyticsControllerState(): Omit<
  AnalyticsControllerState,
  'analyticsId'
> {
  return {
    optedIn: false,
  };
}

/**
 * The metadata for each property in {@link AnalyticsControllerState}.
 *
 * Note: `persist` is set to `false` for all fields because the platform
 * is responsible for persistence via the `stateChange` event listener.
 */
const analyticsControllerMetadata = {
  optedIn: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  analyticsId: {
    includeInStateLogs: true,
    persist: false,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
} satisfies StateMetadata<AnalyticsControllerState>;

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'trackEvent',
  'identify',
  'trackView',
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
  /**
   * Initial controller state. Must include a valid UUIDv4 `analyticsId`.
   * The platform is responsible for generating and persisting the analyticsId.
   */
  state: AnalyticsControllerState;
  /**
   * Messenger used to communicate with BaseController and other controllers.
   */
  messenger: AnalyticsControllerMessenger;
  /**
   * Platform adapter implementation for tracking events.
   */
  platformAdapter: AnalyticsPlatformAdapter;

  /**
   * Whether the anonymous events feature is enabled.
   *
   * @default false
   */
  anonymousEventsFeature?: boolean;
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
 *
 * Note: This controller does not persist state internally (`persist: false` in metadata).
 * The platform is responsible for:
 * - Providing the initial state (including a valid UUIDv4 analyticsId)
 * - Subscribing to `AnalyticsController:stateChange` event to persist changes
 */
export class AnalyticsController extends BaseController<
  'AnalyticsController',
  AnalyticsControllerState,
  AnalyticsControllerMessenger
> {
  readonly #platformAdapter: AnalyticsPlatformAdapter;

  readonly #anonymousEventsFeature: boolean;

  #initialized: boolean;

  /**
   * Constructs an AnalyticsController instance.
   *
   * @param options - Controller options
   * @param options.state - Initial controller state. Must include a valid UUIDv4 `analyticsId`.
   * Use `getDefaultAnalyticsControllerState()` for default opt-in preferences.
   * @param options.messenger - Messenger used to communicate with BaseController
   * @param options.platformAdapter - Platform adapter implementation for tracking
   * @param options.anonymousEventsFeature - Whether the anonymous events feature is enabled
   * @throws Error if state.analyticsId is missing or not a valid UUIDv4
   * @remarks After construction, call {@link AnalyticsController.init} to complete initialization.
   */
  constructor({
    state,
    messenger,
    platformAdapter,
    anonymousEventsFeature = false,
  }: AnalyticsControllerOptions) {

    const initialState: AnalyticsControllerState = {
      ...getDefaultAnalyticsControllerState(),
      ...state,
    };

    validateAnalyticsControllerState(initialState);

    super({
      name: controllerName,
      metadata: analyticsControllerMetadata,
      state: initialState,
      messenger,
    }); 

    this.#anonymousEventsFeature = anonymousEventsFeature;
    this.#platformAdapter = platformAdapter;
    this.#initialized = false;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    projectLogger('AnalyticsController initialized and ready', {
      enabled: analyticsControllerSelectors.selectEnabled(this.state),
      optedIn: this.state.optedIn,
      analyticsId: this.state.analyticsId,
    });
  }

  /**
   * Initialize the controller by calling the platform adapter's onSetupCompleted lifecycle hook.
   * This method must be called after construction to complete the setup process.
   *
   * @throws Error if called multiple times
   */
  init(): void {
    if (this.#initialized) {
      throw new Error('AnalyticsController already initialized.');
    }

    this.#initialized = true;

    // Call onSetupCompleted lifecycle hook after initialization
    // State is already validated, so analyticsId is guaranteed to be a valid UUIDv4
    try {
      this.#platformAdapter.onSetupCompleted(this.state.analyticsId);
    } catch (error) {
      // Log error but don't throw - adapter setup failure shouldn't break controller
      projectLogger('Error calling platformAdapter.onSetupCompleted', error);
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
    if (!analyticsControllerSelectors.selectEnabled(this.state)) {
      return;
    }

    // if event does not have properties, send event without properties
    // and return to prevent any additional processing
    if (!event.hasProperties) {
      this.#platformAdapter.track(event.name);
      return;
    }

    // Track regular properties first if anonymous events feature is enabled
    if (this.#anonymousEventsFeature) {
      // Note: Even if regular properties object is empty, we still send it to ensure
      // an event with user ID is tracked.
      this.#platformAdapter.track(event.name, {
        ...event.properties,
      });
    }

    const hasSensitiveProperties =
      Object.keys(event.sensitiveProperties).length > 0;

    if (!this.#anonymousEventsFeature || hasSensitiveProperties) {
      this.#platformAdapter.track(event.name, {
        ...event.properties,
        ...event.sensitiveProperties,
        ...(hasSensitiveProperties && { anonymous: true }),
      });
    }
  }

  /**
   * Identify a user for analytics.
   *
   * @param traits - User traits/properties
   */
  identify(traits?: AnalyticsUserTraits): void {
    if (!analyticsControllerSelectors.selectEnabled(this.state)) {
      return;
    }

    // Delegate to platform adapter using the current analytics ID
    this.#platformAdapter.identify(this.state.analyticsId, traits);
  }

  /**
   * Track a page or screen view.
   *
   * @param name - The identifier/name of the page or screen being viewed (e.g., "home", "settings", "wallet")
   * @param properties - Optional properties associated with the view
   */
  trackView(name: string, properties?: AnalyticsEventProperties): void {
    if (!analyticsControllerSelectors.selectEnabled(this.state)) {
      return;
    }

    // Delegate to platform adapter
    this.#platformAdapter.view(name, properties);
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
