import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';
import { cloneDeep } from 'lodash';
import { v4 as uuid } from 'uuid';

import type { AnalyticsControllerMethodActions } from './AnalyticsController-method-action-types.js';
import { validateAnalyticsControllerState } from './analyticsControllerStateValidator.js';
import { projectLogger as log } from './AnalyticsLogger.js';
import type {
  AnalyticsPlatformAdapter,
  AnalyticsDeliveryOptions,
  AnalyticsContext,
  AnalyticsEventProperties,
  AnalyticsUserTraits,
  AnalyticsTrackingEvent,
} from './AnalyticsPlatformAdapter.types';
import { analyticsControllerSelectors } from './selectors.js';

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

  /**
   * Persisted queue of analytics events waiting for delivery acknowledgement.
   * This is only used when event queue persistence is enabled.
   */
  eventQueue?: Record<string, Json>;

  /**
   * Whether the user has made a consent decision (opted in or opted out).
   *
   * This distinguishes the "undecided" state (e.g. during onboarding, before
   * the user has answered the analytics prompt) from an explicit opt-out.
   * Defaults to `false` and is set to `true` by {@link AnalyticsController.optIn}
   * or {@link AnalyticsController.optOut}, and back to `false` by
   * {@link AnalyticsController.resetConsentDecision}. Optional for backward
   * compatibility with persisted state that predates this field.
   */
  consentDecisionMade?: boolean;

  /**
   * Persisted queue of track events ({@link AnalyticsQueuedTrackEvent}) captured
   * while the user is undecided (no consent decision made yet). Replayed on
   * opt-in and cleared on opt-out.
   * Preserved across {@link AnalyticsController.resetConsentDecision} so onboarding
   * restarts do not drop install-time events.
   * This is only used when the pre-consent queue is enabled.
   */
  preConsentEventQueue?: Record<string, Json>;
};

/**
 * Event types supported by the persisted analytics event queue.
 */
export type AnalyticsQueuedEventType = 'track' | 'identify' | 'view';

/**
 * Base persisted event queue entry.
 */
export type AnalyticsQueuedEventBase = {
  /**
   * Event type used to replay the payload with the platform adapter.
   */
  type: AnalyticsQueuedEventType;

  /**
   * Stable identifier for the analytics payload.
   */
  messageId: string;

  /**
   * Original payload timestamp serialized for persistence.
   */
  timestamp: string;
};

/**
 * Persisted track event queue entry.
 */
export type AnalyticsQueuedTrackEvent = AnalyticsQueuedEventBase & {
  type: 'track';
  eventName: string;
  properties?: AnalyticsEventProperties;
  context?: AnalyticsContext;
};

/**
 * Persisted identify event queue entry.
 */
export type AnalyticsQueuedIdentifyEvent = AnalyticsQueuedEventBase & {
  type: 'identify';
  userId: string;
  traits?: AnalyticsUserTraits;
  context?: AnalyticsContext;
};

/**
 * Persisted view event queue entry.
 */
export type AnalyticsQueuedViewEvent = AnalyticsQueuedEventBase & {
  type: 'view';
  name: string;
  properties?: AnalyticsEventProperties;
  context?: AnalyticsContext;
};

/**
 * Persisted analytics event queue entry.
 */
export type AnalyticsQueuedEvent =
  | AnalyticsQueuedTrackEvent
  | AnalyticsQueuedIdentifyEvent
  | AnalyticsQueuedViewEvent;

/**
 * Persisted analytics event queue keyed by message ID.
 */
export type AnalyticsEventQueue = Record<string, AnalyticsQueuedEvent>;

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
    consentDecisionMade: false,
  };
}

/**
 * The metadata for each property in {@link AnalyticsControllerState}.
 *
 * Both `optedIn` and `analyticsId` are persisted (`persist: true`).
 * The platform must supply a valid UUIDv4 `analyticsId` on first run.
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
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
  eventQueue: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
  consentDecisionMade: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  preConsentEventQueue: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
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
  'resetConsentDecision',
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
   * The platform is responsible for generating the ID on first run.
   * It is then persisted with controller state when using a persisted store.
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
  isAnonymousEventsFeatureEnabled?: boolean;

  /**
   * Whether analytics event queue persistence is enabled.
   *
   * When enabled, AnalyticsController persists each platform adapter payload
   * until the adapter reports successful delivery.
   *
   * @default false
   */
  isEventQueuePersistenceEnabled?: boolean;

  /**
   * Whether the pre-consent event queue is enabled.
   *
   * When enabled, track events received while the user is undecided
   * (no consent decision made yet) are persisted and replayed on opt-in,
   * or dropped on opt-out. When disabled, such events are dropped immediately,
   * preserving the legacy behavior.
   *
   * @default false
   */
  isPreConsentQueueEnabled?: boolean;
};

/**
 * Returns whether a value is a non-array object.
 *
 * @param value - The value to check.
 * @returns True if the value is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Returns whether a value is a valid persisted analytics event.
 *
 * @param value - The value to check.
 * @returns True if the value is a queued analytics event.
 */
function isAnalyticsQueuedEvent(value: unknown): value is AnalyticsQueuedEvent {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.messageId !== 'string' ||
    typeof value.timestamp !== 'string'
  ) {
    return false;
  }

  if (value.type === 'track') {
    return (
      typeof value.eventName === 'string' &&
      (value.properties === undefined || isRecord(value.properties)) &&
      (value.context === undefined || isRecord(value.context))
    );
  }

  if (value.type === 'identify') {
    return (
      typeof value.userId === 'string' &&
      (value.traits === undefined || isRecord(value.traits)) &&
      (value.context === undefined || isRecord(value.context))
    );
  }

  if (value.type === 'view') {
    return (
      typeof value.name === 'string' &&
      (value.properties === undefined || isRecord(value.properties)) &&
      (value.context === undefined || isRecord(value.context))
    );
  }

  return false;
}

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
 * The controller persists `optedIn` and `analyticsId` when composed with a persisted
 * store. The platform must supply a valid `analyticsId` on first launch.
 */
export class AnalyticsController extends BaseController<
  'AnalyticsController',
  AnalyticsControllerState,
  AnalyticsControllerMessenger
> {
  readonly #platformAdapter: AnalyticsPlatformAdapter;

  readonly #isAnonymousEventsFeatureEnabled: boolean;

  readonly #isEventQueuePersistenceEnabled: boolean;

  readonly #isPreConsentQueueEnabled: boolean;

  #initialized: boolean;

  /**
   * Constructs an AnalyticsController instance.
   *
   * @param options - Controller options
   * @param options.state - Initial controller state. Must include a valid UUIDv4 `analyticsId`.
   * Use `getDefaultAnalyticsControllerState()` for default opt-in preferences.
   * @param options.messenger - Messenger used to communicate with BaseController
   * @param options.platformAdapter - Platform adapter implementation for tracking
   * @param options.isAnonymousEventsFeatureEnabled - Whether the anonymous events feature is enabled
   * @param options.isEventQueuePersistenceEnabled - Whether analytics event queue persistence is enabled
   * @param options.isPreConsentQueueEnabled - Whether the pre-consent event queue is enabled
   * @throws Error if state.analyticsId is missing or not a valid UUIDv4
   * @remarks After construction, call {@link AnalyticsController.init} to complete initialization.
   */
  constructor({
    state,
    messenger,
    platformAdapter,
    isAnonymousEventsFeatureEnabled = false,
    isEventQueuePersistenceEnabled = false,
    isPreConsentQueueEnabled = false,
  }: AnalyticsControllerOptions) {
    const initialState: AnalyticsControllerState = {
      ...getDefaultAnalyticsControllerState(),
      ...state,
    };

    validateAnalyticsControllerState(
      initialState,
      platformAdapter.skipUUIDv4Check === true,
    );

    super({
      name: controllerName,
      metadata: analyticsControllerMetadata,
      state: initialState,
      messenger,
    });

    this.#isAnonymousEventsFeatureEnabled = isAnonymousEventsFeatureEnabled;
    this.#isEventQueuePersistenceEnabled = isEventQueuePersistenceEnabled;
    this.#isPreConsentQueueEnabled = isPreConsentQueueEnabled;
    this.#platformAdapter = platformAdapter;
    this.#initialized = false;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    log('AnalyticsController initialized and ready', {
      enabled: analyticsControllerSelectors.selectEnabled(this.state),
      optedIn: this.state.optedIn,
      consentDecisionMade: this.state.consentDecisionMade,
      analyticsId: this.state.analyticsId,
      eventQueuePersistenceEnabled: this.#isEventQueuePersistenceEnabled,
      preConsentQueueEnabled: this.#isPreConsentQueueEnabled,
    });
  }

  /**
   * Initialize the controller by calling the platform adapter's onSetupCompleted lifecycle hook.
   * This method must be called after construction to complete the setup process.
   */
  init(): void {
    if (this.#initialized) {
      log('AnalyticsController already initialized.');
      return;
    }

    this.#initialized = true;

    // Call onSetupCompleted lifecycle hook after initialization
    // State is already validated, so analyticsId is guaranteed to be a valid UUIDv4
    try {
      this.#platformAdapter.onSetupCompleted(this.state.analyticsId);
    } catch (error) {
      // Log error but don't throw - adapter setup failure shouldn't break controller
      log('Error calling platformAdapter.onSetupCompleted', error);
    }

    this.#replayQueuedEvents();
    this.#reconcilePreConsentEvents();
  }

  /**
   * Send final track payload through the platform adapter or queue it if persistence is enabled.
   *
   * @param eventName - The name of the event.
   * @param properties - Optional event properties.
   * @param context - Optional platform-specific context.
   */
  #sendOrQueueTrackEvent(
    eventName: string,
    properties?: AnalyticsEventProperties,
    context?: AnalyticsContext,
  ): void {
    // Direct delivery: enabled and not persisting.
    if (
      analyticsControllerSelectors.selectEnabled(this.state) &&
      !this.#isEventQueuePersistenceEnabled
    ) {
      this.#platformAdapter.track(eventName, properties, context);
      return;
    }

    const queuedEvent: AnalyticsQueuedTrackEvent = {
      type: 'track',
      eventName,
      messageId: uuid(),
      timestamp: new Date().toISOString(),
      ...(properties === undefined ? {} : { properties }),
      ...(context === undefined ? {} : { context }),
    };

    // Not yet enabled (reached only while undecided with the pre-consent queue
    // enabled): hold the event until the user opts in.
    if (!analyticsControllerSelectors.selectEnabled(this.state)) {
      this.#enqueuePreConsentEvent(queuedEvent);
      return;
    }

    this.#enqueueEvent(queuedEvent);
  }

  /**
   * Send final identify payload through the platform adapter or queue it if persistence is enabled.
   *
   * @param userId - The user ID.
   * @param traits - Optional user traits.
   * @param context - Optional platform-specific context.
   */
  #sendOrQueueIdentifyEvent(
    userId: string,
    traits?: AnalyticsUserTraits,
    context?: AnalyticsContext,
  ): void {
    if (!this.#isEventQueuePersistenceEnabled) {
      this.#platformAdapter.identify(userId, traits, context);
      return;
    }

    const queuedEvent: AnalyticsQueuedIdentifyEvent = {
      type: 'identify',
      userId,
      messageId: uuid(),
      timestamp: new Date().toISOString(),
      ...(traits === undefined ? {} : { traits }),
      ...(context === undefined ? {} : { context }),
    };

    this.#enqueueEvent(queuedEvent);
  }

  /**
   * Send final view payload through the platform adapter or queue it if persistence is enabled.
   *
   * @param name - The view name.
   * @param properties - Optional view properties.
   * @param context - Optional platform-specific context.
   */
  #sendOrQueueViewEvent(
    name: string,
    properties?: AnalyticsEventProperties,
    context?: AnalyticsContext,
  ): void {
    if (!this.#isEventQueuePersistenceEnabled) {
      this.#platformAdapter.view(name, properties, context);
      return;
    }

    const queuedEvent: AnalyticsQueuedViewEvent = {
      type: 'view',
      name,
      messageId: uuid(),
      timestamp: new Date().toISOString(),
      ...(properties === undefined ? {} : { properties }),
      ...(context === undefined ? {} : { context }),
    };

    this.#enqueueEvent(queuedEvent);
  }

  /**
   * Add an analytics event to the queue and send it.
   *
   * @param queuedEvent - The event to enqueue and deliver.
   */
  #enqueueEvent(queuedEvent: AnalyticsQueuedEvent): void {
    const eventQueue: Record<string, Json> = {
      ...(this.state.eventQueue ?? {}),
      [queuedEvent.messageId]: queuedEvent as unknown as Json,
    };

    this.update((state) => {
      state.eventQueue = eventQueue as never;
    });

    this.#sendQueuedEvent(queuedEvent);
  }

  /**
   * Send a queued event through the platform adapter.
   *
   * @param queuedEvent - The queued event to deliver.
   */
  #sendQueuedEvent(queuedEvent: AnalyticsQueuedEvent): void {
    const timestamp = new Date(queuedEvent.timestamp);

    if (Number.isNaN(timestamp.getTime())) {
      log('Dropping queued analytics event with invalid timestamp', {
        messageId: queuedEvent.messageId,
      });
      this.#removeQueuedEvent(queuedEvent.messageId);
      return;
    }

    const options: AnalyticsDeliveryOptions = {
      messageId: queuedEvent.messageId,
      timestamp,
      callback: (error?: unknown) => {
        if (error) {
          log('Queued analytics event delivery failed', {
            messageId: queuedEvent.messageId,
            error,
          });
        }

        this.#removeQueuedEvent(queuedEvent.messageId);
      },
    };

    try {
      if (queuedEvent.type === 'track') {
        this.#platformAdapter.track(
          queuedEvent.eventName,
          cloneDeep(queuedEvent.properties),
          cloneDeep(queuedEvent.context),
          options,
        );
      } else if (queuedEvent.type === 'identify') {
        this.#platformAdapter.identify(
          queuedEvent.userId,
          cloneDeep(queuedEvent.traits),
          cloneDeep(queuedEvent.context),
          options,
        );
      } else {
        this.#platformAdapter.view(
          queuedEvent.name,
          cloneDeep(queuedEvent.properties),
          cloneDeep(queuedEvent.context),
          options,
        );
      }
    } catch (error) {
      log('Error sending queued analytics event', {
        messageId: queuedEvent.messageId,
        error,
      });
    }
  }

  /**
   * Replay persisted analytics events.
   */
  #replayQueuedEvents(): void {
    if (!this.#isEventQueuePersistenceEnabled || !this.state.eventQueue) {
      return;
    }

    if (!analyticsControllerSelectors.selectEnabled(this.state)) {
      this.#clearQueuedEvents();
      return;
    }

    for (const [messageId, queuedEvent] of Object.entries(
      this.state.eventQueue,
    )) {
      if (
        !isAnalyticsQueuedEvent(queuedEvent) ||
        queuedEvent.messageId !== messageId
      ) {
        log('Dropping invalid queued analytics event', { messageId });
        this.#removeQueuedEvent(messageId);
        continue;
      }

      this.#sendQueuedEvent(queuedEvent);
    }
  }

  /**
   * Remove a queued analytics event.
   *
   * @param messageId - The queued event message ID.
   */
  #removeQueuedEvent(messageId: string): void {
    const currentEventQueue = this.state.eventQueue;

    if (
      !currentEventQueue ||
      !Object.prototype.hasOwnProperty.call(currentEventQueue, messageId)
    ) {
      return;
    }

    const { [messageId]: _deletedEvent, ...eventQueue } = currentEventQueue;

    this.update((state) => {
      state.eventQueue = eventQueue as never;
    });
  }

  /**
   * Clear all queued analytics events.
   */
  #clearQueuedEvents(): void {
    if (
      !this.state.eventQueue ||
      Object.keys(this.state.eventQueue).length === 0
    ) {
      return;
    }

    this.update((state) => {
      state.eventQueue = {} as never;
    });
  }

  /**
   * Add an event to the pre-consent queue without delivering it.
   *
   * @param queuedEvent - The event to hold until the user opts in.
   */
  #enqueuePreConsentEvent(queuedEvent: AnalyticsQueuedEvent): void {
    const preConsentEventQueue: Record<string, Json> = {
      ...(this.state.preConsentEventQueue ?? {}),
      [queuedEvent.messageId]: queuedEvent as unknown as Json,
    };

    this.update((state) => {
      state.preConsentEventQueue = preConsentEventQueue as never;
    });
  }

  /**
   * Replay queued pre-consent events through the delivery path.
   *
   * Called on opt-in, once analytics is enabled. The queue is cleared before
   * replaying so events cannot be re-queued or replayed twice.
   */
  #replayPreConsentEvents(): void {
    if (!this.#isPreConsentQueueEnabled) {
      return;
    }

    const queue = this.state.preConsentEventQueue;

    if (!queue) {
      return;
    }

    this.#clearPreConsentEvents();

    for (const [messageId, queuedEvent] of Object.entries(queue)) {
      if (
        !isAnalyticsQueuedEvent(queuedEvent) ||
        queuedEvent.messageId !== messageId
      ) {
        log('Dropping invalid queued pre-consent analytics event', {
          messageId,
        });
        continue;
      }

      if (this.#isEventQueuePersistenceEnabled) {
        this.#enqueueEvent(queuedEvent);
      } else {
        this.#sendQueuedEvent(queuedEvent);
      }
    }
  }

  /**
   * Clear all queued pre-consent events.
   */
  #clearPreConsentEvents(): void {
    if (!this.state.preConsentEventQueue) {
      return;
    }

    this.update((state) => {
      state.preConsentEventQueue = {} as never;
    });
  }

  /**
   * Reconcile the pre-consent queue on initialization.
   *
   * The queue should normally be empty unless the user is still undecided. This
   * handles the rare cases where a consent decision was persisted but the queue
   * was not flushed/cleared (e.g. an interrupted shutdown): replay it if the
   * user is opted in, or clear it if they opted out.
   *
   * If the pre-consent queue is disabled, any stale persisted entries (e.g. from
   * a previous session where it was enabled) are dropped so they can never be
   * replayed.
   */
  #reconcilePreConsentEvents(): void {
    const queue = this.state.preConsentEventQueue;

    if (!queue) {
      return;
    }

    if (!this.#isPreConsentQueueEnabled) {
      this.#clearPreConsentEvents();
      return;
    }

    if (this.state.optedIn) {
      this.#replayPreConsentEvents();
    } else if (this.state.consentDecisionMade) {
      this.#clearPreConsentEvents();
    }
  }

  /**
   * Track an analytics event.
   *
   * Events are only tracked if analytics is enabled.
   *
   * @param event - Analytics event with properties and sensitive properties
   * @param context - Optional platform-specific context forwarded to the platform adapter.
   */
  trackEvent(event: AnalyticsTrackingEvent, context?: AnalyticsContext): void {
    if (!analyticsControllerSelectors.selectEnabled(this.state)) {
      // While the user is undecided, fall through so the event is processed and
      // captured in the pre-consent queue (see #sendOrQueueTrackEvent) to be
      // replayed if they later opt in. Otherwise (opted out, or pre-consent
      // queue disabled) drop it.
      const shouldQueuePreConsent =
        this.#isPreConsentQueueEnabled && !this.state.consentDecisionMade;
      if (!shouldQueuePreConsent) {
        return;
      }
    }

    // if event does not have properties, send event without properties
    // and return to prevent any additional processing
    if (!event.hasProperties) {
      this.#sendOrQueueTrackEvent(event.name, undefined, context);
      return;
    }

    // Track regular properties first if anonymous events feature is enabled
    if (this.#isAnonymousEventsFeatureEnabled) {
      // Note: Even if regular properties object is empty, we still send it to ensure
      // an event with user ID is tracked.
      this.#sendOrQueueTrackEvent(
        event.name,
        {
          ...event.properties,
        },
        context,
      );
    }

    const hasSensitiveProperties =
      Object.keys(event.sensitiveProperties).length > 0;

    if (!this.#isAnonymousEventsFeatureEnabled || hasSensitiveProperties) {
      this.#sendOrQueueTrackEvent(
        event.name,
        {
          ...event.properties,
          ...event.sensitiveProperties,
          ...(hasSensitiveProperties && { anonymous: true }),
        },
        context,
      );
    }
  }

  /**
   * Identify a user for analytics.
   *
   * @param traits - User traits/properties
   * @param context - Optional platform-specific context forwarded to the platform adapter.
   */
  identify(traits?: AnalyticsUserTraits, context?: AnalyticsContext): void {
    if (!analyticsControllerSelectors.selectEnabled(this.state)) {
      return;
    }

    // Delegate to platform adapter using the current analytics ID
    this.#sendOrQueueIdentifyEvent(this.state.analyticsId, traits, context);
  }

  /**
   * Track a page or screen view.
   *
   * @param name - The identifier/name of the page or screen being viewed (e.g., "home", "settings", "wallet")
   * @param properties - Optional properties associated with the view
   * @param context - Optional platform-specific context forwarded to the platform adapter.
   */
  trackView(
    name: string,
    properties?: AnalyticsEventProperties,
    context?: AnalyticsContext,
  ): void {
    if (!analyticsControllerSelectors.selectEnabled(this.state)) {
      return;
    }

    // Delegate to platform adapter
    this.#sendOrQueueViewEvent(name, properties, context);
  }

  /**
   * Opt in to analytics.
   *
   * Records that a consent decision has been made and replays any events that
   * were queued while the user was undecided.
   */
  optIn(): void {
    this.update((state) => {
      state.optedIn = true;
      state.consentDecisionMade = true;
    });

    this.#replayPreConsentEvents();
  }

  /**
   * Opt out of analytics.
   *
   * Records that a consent decision has been made and discards any persisted
   * events so nothing captured before the decision is ever delivered.
   */
  optOut(): void {
    this.update((state) => {
      state.optedIn = false;
      state.consentDecisionMade = true;
    });

    this.#clearQueuedEvents();
    this.#clearPreConsentEvents();
  }

  /**
   * Reset the consent decision back to undecided.
   *
   * Intended for client flows that restart onboarding. Clears the opt-in
   * preference and discards the delivery queue, but preserves any pre-consent
   * events so they can still be replayed if the user opts in again. The user is
   * treated as undecided again.
   */
  resetConsentDecision(): void {
    this.update((state) => {
      state.optedIn = false;
      state.consentDecisionMade = false;
    });

    this.#clearQueuedEvents();
  }
}
