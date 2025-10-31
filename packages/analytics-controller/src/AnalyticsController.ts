import { BaseController } from '@metamask/base-controller';
import type { AnalyticsControllerMessenger } from './messenger';
import { controllerName, type AnalyticsControllerActions, type AnalyticsControllerEvents } from './actions';
import { getDefaultAnalyticsControllerState, controllerMetadata } from './state';
import type {
  PlatformAdapter,
  AnalyticsControllerState,
  AnalyticsEventProperties,
  AnalyticsEventOptions,
} from './types';

/**
 * The options that AnalyticsController takes.
 */
export type AnalyticsControllerOptions = {
  state?: Partial<AnalyticsControllerState>;
  messenger: AnalyticsControllerMessenger;
  /**
   * Platform adapter implementation for tracking events
   */
  platformAdapter: PlatformAdapter;
  /**
   * Initial enabled state (default: true)
   */
  enabled?: boolean;
  /**
   * Initial opted-in state (default: false)
   */
  optedIn?: boolean;
};

/**
 * The AnalyticsController manages analytics tracking across platforms (Mobile/Extension).
 * It provides a unified interface for tracking events, identifying users, and managing
 * analytics preferences while delegating platform-specific implementation to a
 * PlatformAdapter.
 *
 * This controller follows the MetaMask controller pattern and integrates with the
 * messenger system to allow other controllers and components to track analytics events.
 */
export class AnalyticsController extends BaseController<
  typeof controllerName,
  AnalyticsControllerState,
  AnalyticsControllerMessenger
> {
  readonly #platformAdapter: PlatformAdapter;

  /**
   * Constructs an AnalyticsController instance.
   *
   * @param options - Controller options
   * @param options.state - Initial controller state
   * @param options.messenger - Messenger used to communicate with BaseController
   * @param options.platformAdapter - Platform adapter implementation for tracking
   * @param options.enabled - Initial enabled state (default: true)
   * @param options.optedIn - Initial opted-in state (default: false)
   */
  constructor({
    state = {},
    messenger,
    platformAdapter,
    enabled = true,
    optedIn = false,
  }: AnalyticsControllerOptions) {
    super({
      name: controllerName,
      metadata: controllerMetadata,
      state: {
        ...getDefaultAnalyticsControllerState(),
        enabled,
        optedIn,
        platform: platformAdapter.platform,
        ...state,
      },
      messenger,
    });

    this.#platformAdapter = platformAdapter;

    // Register action handlers
    this.#registerActionHandlers();
  }

  /**
   * Register action handlers for messenger system
   */
  #registerActionHandlers(): void {
    this.messenger.registerActionHandler(
      `${controllerName}:trackEvent`,
      this.trackEvent.bind(this),
    );

    if (this.#platformAdapter.identify) {
      this.messenger.registerActionHandler(
        `${controllerName}:identify`,
        this.identify.bind(this),
      );
    }

    if (this.#platformAdapter.trackPage) {
      this.messenger.registerActionHandler(
        `${controllerName}:trackPage`,
        this.trackPage.bind(this),
      );
    }

    this.messenger.registerActionHandler(
      `${controllerName}:enable`,
      this.enable.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:disable`,
      this.disable.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:setOptedIn`,
      this.setOptedIn.bind(this),
    );
  }

  /**
   * Track an analytics event.
   *
   * Events are only tracked if analytics is enabled and either:
   * - The user has opted in, OR
   * - The event is not opt-in required (isOptIn: false or undefined)
   *
   * @param eventName - The name of the event
   * @param properties - Event properties
   * @param options - Event options
   */
  trackEvent(
    eventName: string,
    properties: AnalyticsEventProperties = {},
    options: AnalyticsEventOptions = {},
  ): void | Promise<void> {
    const { isOptIn = false, excludeFromMetrics = false } = options;

    // Don't track if analytics is disabled
    if (!this.state.enabled) {
      return;
    }

    // Don't track if user hasn't opted in and this is an opt-in event
    if (!this.state.optedIn && isOptIn) {
      return;
    }

    // Don't track if explicitly excluded
    if (excludeFromMetrics) {
      return;
    }

    // Delegate to platform adapter
    const result = this.#platformAdapter.trackEvent(eventName, properties, options);

    // Update state
    this.update((state) => {
      state.eventsTracked += 1;
    });

    return result;
  }

  /**
   * Identify a user for analytics.
   *
   * @param userId - The user identifier (e.g., metametrics ID)
   * @param traits - User traits/properties
   */
  identify(userId: string, traits?: AnalyticsEventProperties): void | Promise<void> {
    if (!this.state.enabled) {
      return;
    }

    // Update state with analytics ID
    this.update((state) => {
      state.analyticsId = userId;
    });

    // Delegate to platform adapter if supported
    if (this.#platformAdapter.identify) {
      return this.#platformAdapter.identify(userId, traits);
    }
  }

  /**
   * Track a page view.
   *
   * @param pageName - The name of the page
   * @param properties - Page properties
   */
  trackPage(
    pageName: string,
    properties?: AnalyticsEventProperties,
  ): void | Promise<void> {
    if (!this.state.enabled) {
      return;
    }

    // Delegate to platform adapter if supported
    if (this.#platformAdapter.trackPage) {
      return this.#platformAdapter.trackPage(pageName, properties);
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
   * Set the opted-in state.
   *
   * @param optedIn - Whether the user has opted in to analytics
   */
  setOptedIn(optedIn: boolean): void {
    this.update((state) => {
      state.optedIn = optedIn;
    });
  }
}

