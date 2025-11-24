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
  AnalyticsUserTraits,
  AnalyticsTrackingEvent,
} from './AnalyticsPlatformAdapter.types';
import { analyticsControllerSelectors } from './selectors';
import { validateAnalyticsControllerState } from './analyticsControllerStateValidator';

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
   * Whether the user has opted in to analytics for regular account.
   */
  optedInForRegularAccount: boolean;

  /**
   * Whether the user has opted in to analytics for social account.
   */
  optedInForSocialAccount: boolean;

  /**
   * User's UUIDv4 analytics identifier.
   */
  analyticsId: string;
};

/**
 * The metadata for each property in {@link AnalyticsControllerState}.
 */
const analyticsControllerMetadata = {
  optedInForRegularAccount: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  optedInForSocialAccount: {
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

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'trackEvent',
  'identify',
  'trackView',
  'optInForRegularAccount',
  'optOutForRegularAccount',
  'optInForSocialAccount',
  'optOutForSocialAccount',
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
   * @param options.state - Initial controller state. Defaults: optedInForRegularAccount=false,
   * optedInForSocialAccount=false, analyticsId=auto-generated UUIDv4.
   * For migration from a previous system, pass the existing analytics ID via state.analyticsId.
   * @param options.messenger - Messenger used to communicate with BaseController
   * @param options.platformAdapter - Platform adapter implementation for tracking
   */
  constructor({
    state = {},
    messenger,
    platformAdapter,
  }: AnalyticsControllerOptions) {
    const initialState: AnalyticsControllerState = {
      optedInForRegularAccount: false,
      optedInForSocialAccount: false,
      analyticsId: uuidv4(),
      ...state,
    };

    validateAnalyticsControllerState(initialState);

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
      enabled: analyticsControllerSelectors.selectEnabled(this.state),
      optedIn: this.state.optedInForRegularAccount,
      socialOptedIn: this.state.optedInForSocialAccount,
      analyticsId: this.state.analyticsId,
    });

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

    // Derive sensitivity from presence of sensitiveProperties
    const hasSensitiveProperties =
      Object.keys(event.sensitiveProperties).length > 0;

    // if event does not have properties, send event without properties
    // and return to prevent any additional processing
    if (!event.hasProperties) {
      this.#platformAdapter.track(event.name);
      return;
    }

    // Track regular properties (without isSensitive flag - it's the default)
    // Note: Even if properties object is empty, we still send it to ensure
    // an event with user ID is tracked. When only sensitiveProperties exist,
    // this creates two events: one with empty props (user ID) and one with
    // sensitive props (anonymous ID), which is the expected behavior.
    this.#platformAdapter.track(event.name, {
      ...event.properties,
    });

    // Track sensitive properties in a separate event with isSensitive flag
    if (hasSensitiveProperties) {
      this.#platformAdapter.track(event.name, {
        isSensitive: true,
        ...event.properties,
        ...event.sensitiveProperties,
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
   * Opt in to analytics for regular account.
   * This updates the user's opt-in status for regular account.
   */
  optInForRegularAccount(): void {
    this.update((state) => {
      state.optedInForRegularAccount = true;
    });
  }

  /**
   * Opt out of analytics for regular account.
   * This updates the user's opt-in status for regular account.
   */
  optOutForRegularAccount(): void {
    this.update((state) => {
      state.optedInForRegularAccount = false;
    });
  }

  /**
   * Opt in to analytics for social account.
   * This updates the user's opt-in status for social account.
   */
  optInForSocialAccount(): void {
    this.update((state) => {
      state.optedInForSocialAccount = true;
    });
  }

  /**
   * Opt out of analytics for social account.
   * This updates the user's opt-in status for social account.
   */
  optOutForSocialAccount(): void {
    this.update((state) => {
      state.optedInForSocialAccount = false;
    });
  }
}
