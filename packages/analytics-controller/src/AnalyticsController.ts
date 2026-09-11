import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  GeolocationControllerGetGeolocationDataAction,
  GeolocationData,
} from '@metamask/geolocation-controller';
import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';
import { cloneDeep } from 'lodash-es';
import { v4 as uuid } from 'uuid';

import type { AnalyticsControllerMethodActions } from './AnalyticsController-method-action-types.js';
import { validateAnalyticsControllerState } from './analyticsControllerStateValidator.js';
import { projectLogger as log } from './AnalyticsLogger.js';
import type {
  AnalyticsPlatformAdapter,
  AnalyticsDeliveryOptions,
  AnalyticsContext,
  AnalyticsEventProperties,
  AnalyticsLocationContext,
  AnalyticsUserTraits,
  AnalyticsTrackingEvent,
} from './AnalyticsPlatformAdapter.types.js';
import type {
  AnalyticsEventFragment,
  AnalyticsEventFragmentFinalizeOptions,
  AnalyticsEventFragmentOptions,
  AnalyticsEventFragmentPayload,
  AnalyticsEventFragments,
  ReadonlyAnalyticsEventFragment,
} from './EventFragment.types.js';
import { analyticsControllerSelectors } from './selectors.js';

// === GENERAL ===

/**
 * The name of the {@link AnalyticsController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'AnalyticsController';

/**
 * Maximum age of a persisted event fragment, measured from
 * {@link AnalyticsEventFragment.lastUpdated}.
 *
 * Fragments older than this are discarded during {@link AnalyticsController.init}
 * without emitting a success or failure event. Confirmation journeys that span a
 * restart are expected to resume within this window; abandoned ones must not keep
 * `properties` or `sensitiveProperties` in storage indefinitely.
 */
export const EVENT_FRAGMENT_MAX_AGE = 24 * 60 * 60 * 1000;

/**
 * Consent lane for a named analytics payload.
 *
 * Chosen from the marketing-events list at capture, then stored as
 * `context.marketing` so queues and fragments do not look up the name again.
 */
const AnalyticsLane = {
  Marketing: 'marketing',
  Product: 'product',
} as const;

type AnalyticsLane = (typeof AnalyticsLane)[keyof typeof AnalyticsLane];

/**
 * Persisted queue fields on {@link AnalyticsControllerState}.
 */
const AnalyticsQueueField = {
  Event: 'eventQueue',
  PreConsent: 'preConsentEventQueue',
} as const;

type AnalyticsQueueField =
  (typeof AnalyticsQueueField)[keyof typeof AnalyticsQueueField];

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
   * Whether the user has opted in to marketing analytics.
   *
   * Independent of {@link optedIn}. Named events in the remote marketing list
   * are governed only by this flag. Optional for backward compatibility with
   * persisted state that predates this field. Missing values are treated as
   * `false`.
   */
  optedInToMarketing?: boolean;

  /**
   * Whether the user has made a marketing consent decision (opted in or opted
   * out). Mirrors {@link consentDecisionMade} for the marketing lane.
   * Optional for backward compatibility. Missing values are treated as `false`.
   */
  marketingConsentDecisionMade?: boolean;

  /**
   * Cached marketing event names from the config registry. Used to classify
   * events when offline. Optional for backward compatibility.
   */
  marketingEventNames?: string[];

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

  /**
   * Persisted event fragments ({@link AnalyticsEventFragment}) keyed by
   * fragment ID. Fragments accumulate properties across a user journey and are
   * removed when the journey is finalized or deleted. Fragments that set
   * `persist: true` can survive {@link AnalyticsController.init}, but only
   * while younger than {@link EVENT_FRAGMENT_MAX_AGE}.
   * This is only used when the event fragments feature is enabled.
   */
  eventFragments?: AnalyticsEventFragments;
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
    optedInToMarketing: false,
    marketingConsentDecisionMade: false,
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
  optedInToMarketing: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  marketingConsentDecisionMade: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  marketingEventNames: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
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
  eventFragments: {
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
  'optInToMarketing',
  'optOutOfMarketing',
  'resetMarketingConsentDecision',
  'createEventFragment',
  'upsertEventFragment',
  'updateEventFragment',
  'getEventFragmentById',
  'deleteEventFragment',
  'finalizeEventFragment',
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
type ConfigRegistryApiServiceFetchMarketingEventsAction = {
  type: 'ConfigRegistryApiService:fetchMarketingEvents';
  handler: (options?: { etag?: string }) => Promise<{
    modified: boolean;
    etag?: string;
    data?: {
      data: {
        version: string;
        timestamp: number;
        eventNames: string[];
      };
    };
  }>;
};

type AllowedActions =
  | GeolocationControllerGetGeolocationDataAction
  | ConfigRegistryApiServiceFetchMarketingEventsAction;

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

  /**
   * Whether geolocation enrichment is enabled.
   *
   * When enabled, {@link AnalyticsController.init} resolves the user's
   * country, region, and timezone via `GeolocationController:getGeolocationData`
   * and attaches them to `context.location` on non-anonymous payloads.
   * Compositions must register that action when this is enabled. When disabled,
   * the controller never calls the geolocation action and events are delivered
   * without location.
   *
   * @default false
   */
  isGeolocationEnabled?: boolean;

  /**
   * Whether the event fragments feature is enabled.
   *
   * When enabled, clients can accumulate analytics properties across a user
   * journey with {@link AnalyticsController.createEventFragment} and friends,
   * as long as the consent state allows analytics to be captured. When
   * disabled, every fragment method is a logged no-op and no fragment is ever
   * written to state.
   *
   * @default false
   */
  isEventFragmentsEnabled?: boolean;
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
 * Returns whether a JSON value is a non-array object.
 *
 * @param value - The value to check.
 * @returns True if the value is a JSON record.
 */
function isJsonRecord(value: Json | undefined): value is Record<string, Json> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Builds the analytics location context from geolocation data, keeping only
 * the fields the geolocation API was able to determine.
 *
 * @param geolocation - The geolocation data to convert.
 * @returns The location context, or `undefined` when no field is known.
 */
function buildLocationContext(
  geolocation: GeolocationData,
): AnalyticsLocationContext | undefined {
  const locationContext: AnalyticsLocationContext = {
    ...(geolocation.country === null
      ? {}
      : { country_code: geolocation.country }),
    ...(geolocation.region === null ? {} : { region: geolocation.region }),
    ...(geolocation.timezone === null
      ? {}
      : { timezone: geolocation.timezone }),
  };

  return Object.keys(locationContext).length === 0
    ? undefined
    : locationContext;
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
 * Returns whether a value is a valid persisted event fragment.
 *
 * @param value - The value to check.
 * @returns True if the value is an event fragment.
 */
function isAnalyticsEventFragment(
  value: unknown,
): value is AnalyticsEventFragment {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.createdAt === 'number' &&
    typeof value.lastUpdated === 'number' &&
    isRecord(value.properties) &&
    isRecord(value.sensitiveProperties) &&
    (value.initialEvent === undefined ||
      typeof value.initialEvent === 'string') &&
    (value.successEvent === undefined ||
      typeof value.successEvent === 'string') &&
    (value.failureEvent === undefined ||
      typeof value.failureEvent === 'string') &&
    (value.context === undefined || isRecord(value.context)) &&
    (value.persist === undefined || typeof value.persist === 'boolean')
  );
}

/**
 * Merges a payload into an event fragment.
 *
 * `properties`, `sensitiveProperties` and `context` are merged one level deep,
 * so a key written twice is replaced rather than combined. This keeps array
 * values predictable: writing a shorter array replaces the longer one instead
 * of leaving stale trailing entries behind.
 *
 * @param fragment - The fragment to merge into.
 * @param payload - The payload to merge.
 * @returns A new fragment with the payload applied.
 */
function mergeEventFragment(
  fragment: AnalyticsEventFragment,
  payload: AnalyticsEventFragmentPayload,
): AnalyticsEventFragment {
  const context = mergeEventFragmentContext(fragment.context, payload.context);

  return {
    ...fragment,
    properties: { ...fragment.properties, ...(payload.properties ?? {}) },
    sensitiveProperties: {
      ...fragment.sensitiveProperties,
      ...(payload.sensitiveProperties ?? {}),
    },
    ...(context === undefined ? {} : { context }),
    lastUpdated: Date.now(),
  };
}

/**
 * Merges two optional analytics contexts.
 *
 * @param base - The context to merge into.
 * @param override - The context whose fields win. When omitted, `base` is kept.
 * @returns The merged context, or `undefined` when both sides are unset.
 */
function mergeEventFragmentContext(
  base: AnalyticsContext | undefined,
  override: AnalyticsContext | undefined,
): AnalyticsContext | undefined {
  if (override === undefined) {
    return base;
  }

  return { ...(base ?? {}), ...override };
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

  readonly #isGeolocationEnabled: boolean;

  readonly #isEventFragmentsEnabled: boolean;

  /**
   * In-memory lookup of marketing event names from the registry or persisted
   * cache. Empty until a list is available.
   */
  #marketingEventNames: Set<string>;

  /**
   * The in-flight (or settled) initialization promise. Set on the first
   * {@link init} call and returned by subsequent calls so overlapping callers
   * await the same work rather than observing a premature completion.
   */
  #initPromise: Promise<void> | undefined;

  /**
   * The in-flight (or settled) geolocation resolution, if any. Its presence
   * marks that resolution has been started, so it runs at most once.
   */
  #locationResolvePromise: Promise<void> | undefined;

  #locationContext: AnalyticsLocationContext | undefined;

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
   * @param options.isGeolocationEnabled - Whether geolocation enrichment is enabled
   * @param options.isEventFragmentsEnabled - Whether the event fragments feature is enabled
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
    isGeolocationEnabled = false,
    isEventFragmentsEnabled = false,
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
    this.#isGeolocationEnabled = isGeolocationEnabled;
    this.#isEventFragmentsEnabled = isEventFragmentsEnabled;
    this.#platformAdapter = platformAdapter;
    this.#initPromise = undefined;
    this.#locationResolvePromise = undefined;
    this.#marketingEventNames = new Set(
      initialState.marketingEventNames ?? [],
    );

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    log('AnalyticsController initialized and ready', {
      enabled: analyticsControllerSelectors.selectEnabled(this.state),
      optedIn: this.state.optedIn,
      optedInToMarketing: this.state.optedInToMarketing === true,
      marketingConsentDecisionMade:
        this.state.marketingConsentDecisionMade === true,
      consentDecisionMade: this.state.consentDecisionMade,
      analyticsId: this.state.analyticsId,
      eventQueuePersistenceEnabled: this.#isEventQueuePersistenceEnabled,
      preConsentQueueEnabled: this.#isPreConsentQueueEnabled,
      geolocationEnabled: this.#isGeolocationEnabled,
      eventFragmentsEnabled: this.#isEventFragmentsEnabled,
    });
  }

  /**
   * Initialize the controller by calling the platform adapter's
   * onSetupCompleted lifecycle hook and replaying any queued events. This
   * method must be called after construction to complete the setup process.
   *
   * When geolocation enrichment is enabled (`isGeolocationEnabled`), geolocation
   * is resolved only for a user who is already opted in; for undecided or
   * opted-out users it is deferred until they opt in (see {@link optIn}), so a
   * user's location is never requested before they consent to analytics. In
   * either case the `GeolocationController` and its
   * `GeolocationController:getGeolocationData` action must be registered before
   * resolution occurs, or enrichment is skipped for the session (a message is
   * logged, see {@link #resolveLocationContext}).
   *
   * Safe to call more than once: the first call performs initialization and
   * subsequent calls return the same in-flight (or settled) promise.
   *
   * @returns A promise that resolves once initialization has completed.
   */
  init(): Promise<void> {
    // Cache the in-flight promise so repeated or overlapping calls share a
    // single initialization and all await the same completion (rather than an
    // early call observing a finished init while work is still pending).
    this.#initPromise ??= this.#performInit();
    return this.#initPromise;
  }

  /**
   * Performs the one-time initialization work: resolve geolocation, run the
   * platform adapter's onSetupCompleted lifecycle hook, then replay any queued
   * and pre-consent events.
   */
  async #performInit(): Promise<void> {
    // Snapshot fragment IDs and createdAt before any awaited init work so
    // reconciliation can tell previous-session leftovers from fragments
    // created or replaced while init runs.
    const initEventFragmentSnapshot = new Map<string, number>();
    for (const [id, fragment] of Object.entries(
      this.state.eventFragments ?? {},
    )) {
      if (
        isAnalyticsEventFragment(fragment) &&
        fragment.id === id &&
        typeof fragment.createdAt === 'number'
      ) {
        initEventFragmentSnapshot.set(id, fragment.createdAt);
      }
    }

    await this.#fetchMarketingEventNames();

    // Resolve geolocation only when the user is already opted in to product or
    // marketing analytics. For undecided or opted-out users it is deferred to
    // {@link optIn} / {@link optInToMarketing}. Awaited so that an already-opted-in
    // session has location available before events replay.
    await this.#maybeResolveLocation();

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
    this.#reconcileEventFragments(initEventFragmentSnapshot);
  }

  /**
   * Start resolving the geolocation context if warranted, and return the
   * in-flight (or settled) resolution so callers can await it. No-op unless
   * enrichment is enabled, the user is opted in, and a resolution has not
   * already been started. Deferring resolution until opt-in ensures a user's
   * location is never requested before they consent to analytics (for example,
   * during onboarding).
   *
   * Resolution runs at most once per controller session: the settled promise
   * is retained, so the outcome — including a failure (see
   * {@link #resolveLocationContext}) — is not retried, and events are delivered
   * without location for the rest of the session.
   *
   * @returns The geolocation resolution promise, or `undefined` when no
   * resolution is warranted.
   */
  #maybeResolveLocation(): Promise<void> | undefined {
    if (
      this.#isGeolocationEnabled &&
      this.#locationResolvePromise === undefined &&
      (this.state.optedIn || this.state.optedInToMarketing === true)
    ) {
      this.#locationResolvePromise = this.#resolveLocationContext();
    }

    return this.#locationResolvePromise;
  }

  async #resolveLocationContext(): Promise<void> {
    try {
      const geolocation = await this.messenger.call(
        'GeolocationController:getGeolocationData',
      );

      this.#locationContext = buildLocationContext(geolocation);
    } catch (error) {
      // A common cause is the GeolocationController not being registered before
      // resolution runs (at init for an opted-in user, otherwise at opt-in).
      // Name it here so the failure is diagnosable, since enrichment is
      // otherwise skipped silently for the session.
      log(
        'Failed to resolve geolocation for analytics enrichment; events will be sent without location. Ensure the GeolocationController is registered and initialized before the user opts in when geolocation is enabled.',
        error,
      );
    }
  }

  /**
   * Merge the resolved location context into a caller-provided context.
   *
   * Caller-provided `location` fields are preserved, but the fields the
   * controller resolves take precedence over them.
   *
   * @param context - Optional caller-provided context.
   * @returns The context enriched with location, or the original context when
   * no location is known.
   */
  #withLocationContext(
    context?: AnalyticsContext,
  ): AnalyticsContext | undefined {
    if (!this.#locationContext) {
      return context;
    }

    const callerLocation = context?.location;

    return {
      ...context,
      location: {
        ...(isJsonRecord(callerLocation) ? callerLocation : {}),
        ...this.#locationContext,
      },
    };
  }

  /**
   * Stamp the capture lane on context as `marketing` for Segment.
   *
   * @param lane - Marketing or product.
   * @param context - Optional caller-provided context.
   * @param includeLocation - When false, skip geolocation enrichment.
   * @returns Context with `marketing` set.
   */
  #contextForLane(
    lane: AnalyticsLane,
    context?: AnalyticsContext,
    includeLocation = true,
  ): AnalyticsContext {
    const withLocation = includeLocation
      ? this.#withLocationContext(context)
      : context;

    return {
      ...withLocation,
      marketing: lane === AnalyticsLane.Marketing,
    };
  }

  /**
   * Fetch marketing event names from the config registry and cache them.
   * On failure or an unmodified empty response, keep whatever names are
   * already in memory (persisted cache, or none).
   */
  async #fetchMarketingEventNames(): Promise<void> {
    try {
      const result = await this.messenger.call(
        'ConfigRegistryApiService:fetchMarketingEvents',
      );

      if (!result.modified && result.data === undefined) {
        return;
      }

      const eventNames = result.data?.data.eventNames;
      if (eventNames === undefined) {
        return;
      }

      this.#setMarketingEventNames(eventNames);
    } catch (error) {
      log('Failed to fetch marketing event names from the config registry', {
        error,
      });
    }
  }

  #setMarketingEventNames(eventNames: string[]): void {
    this.#marketingEventNames = new Set(eventNames);

    const currentNames = this.state.marketingEventNames;
    if (
      currentNames?.length === eventNames.length &&
      currentNames.every((name, index) => name === eventNames[index])
    ) {
      return;
    }

    this.update((state) => {
      state.marketingEventNames = eventNames;
    });
  }

  #laneFromName(name: string): AnalyticsLane {
    return this.#marketingEventNames.has(name)
      ? AnalyticsLane.Marketing
      : AnalyticsLane.Product;
  }

  #laneFromContext(context?: AnalyticsContext): AnalyticsLane {
    return context?.marketing === true
      ? AnalyticsLane.Marketing
      : AnalyticsLane.Product;
  }

  #laneFromQueuedEvent(queuedEvent: AnalyticsQueuedEvent): AnalyticsLane {
    if (typeof queuedEvent.context?.marketing === 'boolean') {
      return this.#laneFromContext(queuedEvent.context);
    }

    if (queuedEvent.type === 'track') {
      return this.#laneFromName(queuedEvent.eventName);
    }

    if (queuedEvent.type === 'view') {
      return this.#laneFromName(queuedEvent.name);
    }

    return AnalyticsLane.Product;
  }

  #laneFromDeclaredNames(
    fragment: Pick<
      AnalyticsEventFragment,
      'initialEvent' | 'successEvent' | 'failureEvent'
    >,
  ): AnalyticsLane {
    const names = [
      fragment.initialEvent,
      fragment.successEvent,
      fragment.failureEvent,
    ].filter((name): name is string => typeof name === 'string');

    return names.some(
      (name) => this.#laneFromName(name) === AnalyticsLane.Marketing,
    )
      ? AnalyticsLane.Marketing
      : AnalyticsLane.Product;
  }

  #laneFromFragment(
    fragment: Pick<
      AnalyticsEventFragment,
      'initialEvent' | 'successEvent' | 'failureEvent' | 'context'
    >,
  ): AnalyticsLane {
    if (typeof fragment.context?.marketing === 'boolean') {
      return this.#laneFromContext(fragment.context);
    }

    return this.#laneFromDeclaredNames(fragment);
  }

  #stampFragmentLane(fragment: AnalyticsEventFragment): AnalyticsEventFragment {
    return {
      ...fragment,
      context: this.#contextForLane(
        this.#laneFromDeclaredNames(fragment),
        fragment.context,
        false,
      ),
    };
  }

  #consent(lane: AnalyticsLane): {
    optedIn: boolean;
    decisionMade: boolean;
  } {
    return lane === AnalyticsLane.Marketing
      ? {
          optedIn: this.state.optedInToMarketing === true,
          decisionMade: this.state.marketingConsentDecisionMade === true,
        }
      : {
          optedIn: this.state.optedIn,
          decisionMade: this.state.consentDecisionMade === true,
        };
  }

  #isCaptureAllowed(lane: AnalyticsLane): boolean {
    const { optedIn, decisionMade } = this.#consent(lane);
    return optedIn || (this.#isPreConsentQueueEnabled && !decisionMade);
  }

  #filterQueuedEvents(
    queue: Record<string, Json>,
    laneToClear: AnalyticsLane,
  ): Record<string, Json> {
    const nextQueue: Record<string, Json> = {};

    for (const [messageId, queuedEvent] of Object.entries(queue)) {
      if (
        !isAnalyticsQueuedEvent(queuedEvent) ||
        queuedEvent.messageId !== messageId
      ) {
        continue;
      }

      if (this.#laneFromQueuedEvent(queuedEvent) !== laneToClear) {
        nextQueue[messageId] = queuedEvent as unknown as Json;
      }
    }

    return nextQueue;
  }

  #replaceQueue(
    field: AnalyticsQueueField,
    nextQueue: Record<string, Json>,
  ): void {
    const currentQueue = this.state[field] as Record<string, Json>;
    const currentKeys = Object.keys(currentQueue);
    const nextKeys = Object.keys(nextQueue);

    if (
      currentKeys.length === nextKeys.length &&
      currentKeys.every((key) =>
        Object.prototype.hasOwnProperty.call(nextQueue, key),
      )
    ) {
      return;
    }

    this.update((state) => {
      state[field] = nextQueue as never;
    });
  }

  /**
   * Send final track payload through the platform adapter or queue it if persistence is enabled.
   *
   * @param eventName - The name of the event.
   * @param properties - Optional event properties.
   * @param context - Optional platform-specific context.
   * @param lane - Capture lane stamped on `context`.
   */
  #sendOrQueueTrackEvent(
    eventName: string,
    properties: AnalyticsEventProperties | undefined,
    context: AnalyticsContext,
    lane: AnalyticsLane,
  ): void {
    const { optedIn } = this.#consent(lane);

    // Direct delivery: enabled and not persisting.
    if (optedIn && !this.#isEventQueuePersistenceEnabled) {
      this.#platformAdapter.track(eventName, properties, context);
      return;
    }

    const queuedEvent: AnalyticsQueuedTrackEvent = {
      type: 'track',
      eventName,
      messageId: uuid(),
      timestamp: new Date().toISOString(),
      ...(properties === undefined ? {} : { properties }),
      context,
    };

    if (!optedIn) {
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
   * @param lane - Capture lane stamped on `context`.
   */
  #sendOrQueueViewEvent(
    name: string,
    properties: AnalyticsEventProperties | undefined,
    context: AnalyticsContext,
    lane: AnalyticsLane,
  ): void {
    const { optedIn } = this.#consent(lane);

    if (optedIn && !this.#isEventQueuePersistenceEnabled) {
      this.#platformAdapter.view(name, properties, context);
      return;
    }

    const queuedEvent: AnalyticsQueuedViewEvent = {
      type: 'view',
      name,
      messageId: uuid(),
      timestamp: new Date().toISOString(),
      ...(properties === undefined ? {} : { properties }),
      context,
    };

    if (!optedIn) {
      this.#enqueuePreConsentEvent(queuedEvent);
      return;
    }

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
          cloneDeep(
            this.#contextForLane(
              this.#laneFromQueuedEvent(queuedEvent),
              queuedEvent.context,
              false,
            ),
          ),
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
          cloneDeep(
            this.#contextForLane(
              this.#laneFromQueuedEvent(queuedEvent),
              queuedEvent.context,
              false,
            ),
          ),
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

    const remainingQueue: Record<string, Json> = {};
    const eventsToSend: AnalyticsQueuedEvent[] = [];

    for (const [messageId, queuedEvent] of Object.entries(
      this.state.eventQueue,
    )) {
      if (
        !isAnalyticsQueuedEvent(queuedEvent) ||
        queuedEvent.messageId !== messageId
      ) {
        log('Dropping invalid queued analytics event', { messageId });
        continue;
      }

      const { optedIn } = this.#consent(
        this.#laneFromQueuedEvent(queuedEvent),
      );

      if (optedIn) {
        remainingQueue[messageId] = queuedEvent as unknown as Json;
        eventsToSend.push(queuedEvent);
      }
    }

    this.#replaceQueue(AnalyticsQueueField.Event, remainingQueue);

    for (const queuedEvent of eventsToSend) {
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

  #clearQueuedEventsInLane(
    field: AnalyticsQueueField,
    laneToClear: AnalyticsLane,
  ): void {
    const queue = this.state[field];
    if (!queue) {
      return;
    }

    this.#replaceQueue(field, this.#filterQueuedEvents(queue, laneToClear));
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
   * Only called by {@link #reconcilePreConsentEvents}, which guarantees the
   * pre-consent queue is enabled and that the user is opted in. The queue is
   * cleared before replaying so events cannot be re-queued or replayed twice.
   *
   * @param queue - The pre-consent event queue to replay.
   */
  #replayPreConsentEvents(
    queue: Record<string, AnalyticsQueuedEvent>,
  ): void {
    for (const queuedEvent of Object.values(queue)) {
      const eventToReplay = this.#enrichPreConsentEvent(queuedEvent);

      if (this.#isEventQueuePersistenceEnabled) {
        this.#enqueueEvent(eventToReplay);
      } else {
        this.#sendQueuedEvent(eventToReplay);
      }
    }
  }

  /**
   * Enrich a pre-consent event with the geolocation resolved on opt-in.
   *
   * Pre-consent events are captured while geolocation is not yet resolved, so
   * they are re-enriched here as they replay. Anonymous track payloads are left
   * untouched, since they must never carry location.
   *
   * @param queuedEvent - The queued pre-consent event.
   * @returns The event with its context enriched, or the event unchanged when
   * enrichment does not apply.
   */
  #enrichPreConsentEvent(
    queuedEvent: AnalyticsQueuedEvent,
  ): AnalyticsQueuedEvent {
    if (
      queuedEvent.type === 'track' &&
      queuedEvent.properties?.anonymous === true
    ) {
      return queuedEvent;
    }

    const context = this.#withLocationContext(queuedEvent.context);

    return {
      ...queuedEvent,
      ...(context === undefined ? {} : { context }),
    };
  }

  /**
   * Reconcile the pre-consent queue on initialization.
   *
   * Each queued item is replayed, kept, or dropped according to the consent
   * lane stamped at capture. Product and marketing items are independent.
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
      this.update((state) => {
        state.preConsentEventQueue = {} as never;
      });
      return;
    }

    const keep: Record<string, Json> = {};
    const replay: Record<string, AnalyticsQueuedEvent> = {};

    for (const [messageId, queuedEvent] of Object.entries(queue)) {
      if (
        !isAnalyticsQueuedEvent(queuedEvent) ||
        queuedEvent.messageId !== messageId
      ) {
        continue;
      }

      const { optedIn, decisionMade } = this.#consent(
        this.#laneFromQueuedEvent(queuedEvent),
      );

      if (optedIn) {
        replay[messageId] = queuedEvent;
      } else if (!decisionMade) {
        keep[messageId] = queuedEvent as unknown as Json;
      }
    }

    this.#replaceQueue(AnalyticsQueueField.PreConsent, keep);
    this.#replayPreConsentEvents(replay);
  }

  /**
   * Reconcile persisted event fragments on initialization.
   *
   * A fragment describes a journey that was in progress when the previous
   * session ended. Only fragments that opted into `persist` and are younger
   * than {@link EVENT_FRAGMENT_MAX_AGE} can be resumed, so the rest are
   * discarded. Nothing is emitted: a journey that never reached its own
   * finalization is not a failure, just an unfinished one.
   *
   * If the feature is disabled (e.g. a previous session had it enabled), or the
   * consent state no longer allows capture (e.g. the fragments were written
   * before the user opted out), every persisted fragment is dropped so none of
   * them can linger.
   *
   * Non-persistent fragments are dropped only when their ID and `createdAt`
   * match a fragment present at the start of {@link init}. Fragments created
   * or replaced while init is in flight are kept so a slow startup path cannot
   * discard an in-progress journey, as long as they have not expired.
   *
   * @param initEventFragmentSnapshot - Fragment IDs and `createdAt` values
   * present when {@link init} began.
   */
  #reconcileEventFragments(
    initEventFragmentSnapshot: Map<string, number>,
  ): void {
    const fragments = this.state.eventFragments;

    if (!fragments) {
      return;
    }

    if (!this.#isEventFragmentsEnabled) {
      this.#clearEventFragments();
      return;
    }

    const allowedFragments: AnalyticsEventFragments = {};
    for (const [id, fragment] of Object.entries(fragments)) {
      if (!isAnalyticsEventFragment(fragment) || fragment.id !== id) {
        allowedFragments[id] = fragment;
        continue;
      }

      if (this.#isCaptureAllowed(this.#laneFromFragment(fragment))) {
        allowedFragments[id] = fragment;
      }
    }

    if (Object.keys(allowedFragments).length === 0) {
      this.#clearEventFragments();
      return;
    }

    this.update((state) => {
      state.eventFragments = allowedFragments as never;
    });

    this.#purgeStaleEventFragments(allowedFragments, initEventFragmentSnapshot);
  }

  /**
   * Drop every persisted fragment that is invalid, expired, did not opt into
   * `persist`, or was already present with the same `createdAt` when
   * {@link init} began.
   *
   * Only called by {@link #reconcileEventFragments}, which guarantees the
   * fragments exist and that the event fragments feature is enabled.
   *
   * @param currentEventFragments - The persisted fragments to filter.
   * @param initEventFragmentSnapshot - Fragment IDs and `createdAt` values
   * present when {@link init} began.
   */
  #purgeStaleEventFragments(
    currentEventFragments: AnalyticsEventFragments,
    initEventFragmentSnapshot: Map<string, number>,
  ): void {
    const eventFragments: AnalyticsEventFragments = {};
    const now = Date.now();

    for (const [id, fragment] of Object.entries(currentEventFragments)) {
      if (!isAnalyticsEventFragment(fragment) || fragment.id !== id) {
        log('Dropping invalid persisted event fragment', { id });
        continue;
      }

      if (now - fragment.lastUpdated > EVENT_FRAGMENT_MAX_AGE) {
        log('Dropping expired persisted event fragment', { id });
        continue;
      }

      const snapshotCreatedAt = initEventFragmentSnapshot.get(id);

      if (
        fragment.persist === true ||
        snapshotCreatedAt === undefined ||
        fragment.createdAt !== snapshotCreatedAt
      ) {
        eventFragments[id] = fragment;
      }
    }

    if (
      Object.keys(eventFragments).length ===
      Object.keys(currentEventFragments).length
    ) {
      return;
    }

    this.update((state) => {
      state.eventFragments = eventFragments as never;
    });
  }

  /**
   * Read an event fragment from state without the feature guard.
   *
   * @param id - The fragment ID.
   * @returns The fragment, or `undefined` when no fragment has that ID.
   */
  #getEventFragment(id: string): AnalyticsEventFragment | undefined {
    return this.state.eventFragments?.[id];
  }

  /**
   * Write an event fragment to state, replacing any fragment with the same ID.
   *
   * @param fragment - The fragment to store.
   * @returns The stored fragment with `context.marketing` stamped.
   */
  #setEventFragment(fragment: AnalyticsEventFragment): AnalyticsEventFragment {
    const stampedFragment = this.#stampFragmentLane(fragment);
    const eventFragments: AnalyticsEventFragments = {
      ...this.state.eventFragments,
      [stampedFragment.id]: stampedFragment,
    };

    this.update((state) => {
      state.eventFragments = eventFragments as never;
    });

    return stampedFragment;
  }

  /**
   * Remove an event fragment from state.
   *
   * @param id - The fragment ID.
   */
  #removeEventFragment(id: string): void {
    const currentEventFragments = this.state.eventFragments;

    if (
      !currentEventFragments ||
      !Object.prototype.hasOwnProperty.call(currentEventFragments, id)
    ) {
      return;
    }

    const { [id]: _deletedFragment, ...eventFragments } = currentEventFragments;

    this.update((state) => {
      state.eventFragments = eventFragments as never;
    });
  }

  #clearEventFragmentsInLane(laneToClear: AnalyticsLane): void {
    const fragments = this.state.eventFragments;

    if (!fragments || Object.keys(fragments).length === 0) {
      return;
    }

    const eventFragments: AnalyticsEventFragments = {};
    for (const [id, fragment] of Object.entries(fragments)) {
      if (
        isAnalyticsEventFragment(fragment) &&
        this.#laneFromFragment(fragment) !== laneToClear
      ) {
        eventFragments[id] = fragment;
      }
    }

    this.update((state) => {
      state.eventFragments = eventFragments as never;
    });
  }

  /**
   * Clear all event fragments.
   */
  #clearEventFragments(): void {
    if (
      !this.state.eventFragments ||
      Object.keys(this.state.eventFragments).length === 0
    ) {
      return;
    }

    this.update((state) => {
      state.eventFragments = {} as never;
    });
  }

  /**
   * Returns whether an event fragment call should be ignored, either because
   * the feature is disabled or because the consent state does not allow
   * capture. The ignored call is logged so a missing `isEventFragmentsEnabled`
   * or an unexpected consent state is diagnosable rather than silent.
   *
   * Consent is checked on every call, not just on the ones that emit, so a
   * fragment never accumulates data for an event that could not be delivered.
   *
   * @param method - The name of the method that was called.
   * @param fragment - The fragment being read or written, when one is known.
   * @returns True when the call should be ignored.
   */
  #shouldIgnoreEventFragmentCall(
    method: string,
    fragment?: Pick<
      AnalyticsEventFragment,
      'initialEvent' | 'successEvent' | 'failureEvent'
    >,
  ): boolean {
    if (!this.#isEventFragmentsEnabled) {
      log(
        'Ignoring event fragment call because the event fragments feature is disabled',
        { method },
      );

      return true;
    }

    const captureAllowed = fragment
      ? this.#isCaptureAllowed(this.#laneFromFragment(fragment))
      : this.#isCaptureAllowed(AnalyticsLane.Product) ||
        this.#isCaptureAllowed(AnalyticsLane.Marketing);

    if (!captureAllowed) {
      log(
        'Ignoring event fragment call because the consent state does not allow capturing analytics',
        { method },
      );

      return true;
    }

    return false;
  }

  /**
   * Emit one of an event fragment's events, carrying the properties the
   * fragment has accumulated.
   *
   * Delivery goes through {@link trackEvent}, so consent gating, the anonymous
   * payload split, the pre-consent queue and geolocation enrichment all apply.
   *
   * @param fragment - The fragment supplying the properties.
   * @param name - The name of the event to emit.
   * @param context - The context to send with the event.
   */
  #emitEventFragment(
    fragment: AnalyticsEventFragment,
    name: string,
    context: AnalyticsContext | undefined,
  ): void {
    const properties = { ...fragment.properties };
    const sensitiveProperties = { ...fragment.sensitiveProperties };

    this.trackEvent(
      {
        name,
        properties,
        sensitiveProperties,
        saveDataRecording: false,
        hasProperties:
          Object.keys(properties).length > 0 ||
          Object.keys(sensitiveProperties).length > 0,
      },
      context,
    );
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
    const lane = this.#laneFromName(event.name);

    // An event captured while the user is still undecided is held in the
    // pre-consent queue (see #sendOrQueueTrackEvent) instead of being
    // delivered, and replayed if they later opt in.
    if (!this.#isCaptureAllowed(lane)) {
      return;
    }

    // if event does not have properties, send event without properties
    // and return to prevent any additional processing
    if (!event.hasProperties) {
      this.#sendOrQueueTrackEvent(
        event.name,
        undefined,
        this.#contextForLane(lane, context),
        lane,
      );
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
        this.#contextForLane(lane, context),
        lane,
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
        // When the anonymous events feature is enabled, this payload is the
        // anonymous one and must carry no geolocation. When the feature is
        // disabled, this is the single identified payload, so it is enriched.
        this.#contextForLane(
          lane,
          context,
          !this.#isAnonymousEventsFeatureEnabled,
        ),
        lane,
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

    this.#sendOrQueueIdentifyEvent(
      this.state.analyticsId,
      traits,
      this.#withLocationContext(context),
    );
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
    const lane = this.#laneFromName(name);
    if (!this.#isCaptureAllowed(lane)) {
      return;
    }

    // Delegate to platform adapter
    this.#sendOrQueueViewEvent(
      name,
      properties,
      this.#contextForLane(lane, context),
      lane,
    );
  }

  /**
   * Create an event fragment.
   *
   * A fragment accumulates properties across a user journey so that several
   * parts of a client can contribute to the same set of events without
   * re-deriving them. Declaring `successEvent` and `failureEvent` turns the
   * fragment into a funnel that {@link finalizeEventFragment} closes. Declaring
   * none of the event names makes it a pure property bag that the client reads
   * back with {@link getEventFragmentById} when it emits its own events.
   *
   * Any existing fragment with the same ID is replaced, so a new journey never
   * inherits properties from a stale one.
   *
   * Nothing is created unless the user is opted in, or undecided with the
   * pre-consent queue enabled, so an opted-out user accumulates no fragment
   * data.
   *
   * @param options - The fragment definition. An ID is generated when one is
   * not supplied.
   * @returns A read-only copy of the created fragment, or `undefined` when the
   * event fragments feature is disabled or the consent state does not allow
   * capture. Mutating the returned object does not change controller state.
   * Use {@link updateEventFragment} or {@link upsertEventFragment} to write.
   */
  createEventFragment(
    options: AnalyticsEventFragmentOptions = {},
  ): ReadonlyAnalyticsEventFragment | undefined {
    if (
      this.#shouldIgnoreEventFragmentCall('createEventFragment', options)
    ) {
      return undefined;
    }

    const now = Date.now();

    const fragment = this.#setEventFragment({
      id: options.id ?? uuid(),
      properties: { ...(options.properties ?? {}) },
      sensitiveProperties: { ...(options.sensitiveProperties ?? {}) },
      createdAt: now,
      lastUpdated: now,
      ...(options.initialEvent === undefined
        ? {}
        : { initialEvent: options.initialEvent }),
      ...(options.successEvent === undefined
        ? {}
        : { successEvent: options.successEvent }),
      ...(options.failureEvent === undefined
        ? {}
        : { failureEvent: options.failureEvent }),
      ...(options.context === undefined
        ? {}
        : { context: { ...options.context } }),
      ...(options.persist === undefined ? {} : { persist: options.persist }),
    });

    if (fragment.initialEvent) {
      this.#emitEventFragment(
        fragment,
        fragment.initialEvent,
        fragment.context,
      );
    }

    return cloneDeep(fragment);
  }

  /**
   * Write to an event fragment, creating a property bag if none exists.
   *
   * This is the ergonomic entry point for contributors that do not know
   * whether the journey has been started yet, and it avoids the read then
   * write race a caller would otherwise have to implement itself.
   *
   * @param id - The fragment ID.
   * @param payload - The properties and context to merge in.
   */
  upsertEventFragment(
    id: string,
    payload: AnalyticsEventFragmentPayload = {},
  ): void {
    const fragment = this.#getEventFragment(id);
    if (
      this.#shouldIgnoreEventFragmentCall(
        'upsertEventFragment',
        fragment ?? {},
      )
    ) {
      return;
    }

    if (!fragment) {
      this.createEventFragment({ id, ...payload });
      return;
    }

    this.#setEventFragment(mergeEventFragment(fragment, payload));
  }

  /**
   * Write to an existing event fragment.
   *
   * @param id - The fragment ID.
   * @param payload - The properties and context to merge in.
   * @throws Error if no fragment has that ID when the call is not ignored.
   * Use {@link upsertEventFragment} when the fragment may not exist yet.
   * When the event fragments feature is disabled or the consent state does not
   * allow capture, the call is a logged no-op and does not throw.
   */
  updateEventFragment(
    id: string,
    payload: AnalyticsEventFragmentPayload = {},
  ): void {
    const fragment = this.#getEventFragment(id);
    if (this.#shouldIgnoreEventFragmentCall('updateEventFragment', fragment)) {
      return;
    }

    if (!fragment) {
      throw new Error(`Event fragment with id ${id} does not exist.`);
    }

    this.#setEventFragment(mergeEventFragment(fragment, payload));
  }

  /**
   * Read an event fragment.
   *
   * @param id - The fragment ID.
   * @returns A read-only copy of the fragment, or `undefined` when no fragment
   * has that ID, the event fragments feature is disabled, or the consent state
   * does not allow capture. Mutating the returned object does not change
   * controller state. Use {@link updateEventFragment} or
   * {@link upsertEventFragment} to write.
   */
  getEventFragmentById(id: string): ReadonlyAnalyticsEventFragment | undefined {
    const fragment = this.#getEventFragment(id);
    if (this.#shouldIgnoreEventFragmentCall('getEventFragmentById', fragment)) {
      return undefined;
    }

    return fragment === undefined ? undefined : cloneDeep(fragment);
  }

  /**
   * Discard an event fragment without emitting anything.
   *
   * @param id - The fragment ID.
   */
  deleteEventFragment(id: string): void {
    const fragment = this.#getEventFragment(id);
    if (this.#shouldIgnoreEventFragmentCall('deleteEventFragment', fragment)) {
      return;
    }

    this.#removeEventFragment(id);
  }

  /**
   * Close an event fragment, emitting its closing event and discarding it.
   *
   * The event emitted is `failureEvent` when the journey was abandoned and
   * `successEvent` otherwise. A fragment that does not declare the relevant
   * event name is discarded silently, which is what makes a pure property bag
   * possible.
   *
   * @param id - The fragment ID.
   * @param options - Finalization options.
   * @param options.abandoned - Whether the journey was abandoned.
   * @param options.context - Context merged over the fragment's own context.
   * @throws Error if no fragment has that ID when the call is not ignored.
   * When the event fragments feature is disabled or the consent state does not
   * allow capture, the call is a logged no-op and does not throw.
   */
  finalizeEventFragment(
    id: string,
    { abandoned = false, context }: AnalyticsEventFragmentFinalizeOptions = {},
  ): void {
    const fragment = this.#getEventFragment(id);
    if (this.#shouldIgnoreEventFragmentCall('finalizeEventFragment', fragment)) {
      return;
    }

    if (!fragment) {
      throw new Error(`Event fragment with id ${id} does not exist.`);
    }

    const eventName = abandoned ? fragment.failureEvent : fragment.successEvent;

    if (eventName) {
      this.#emitEventFragment(
        fragment,
        eventName,
        mergeEventFragmentContext(fragment.context, context),
      );
    }

    this.#removeEventFragment(id);
  }

  /**
   * Opt in to analytics.
   *
   * Records that a consent decision has been made and replays any events that
   * were queued while the user was undecided.
   *
   * When geolocation enrichment is enabled, geolocation is resolved here (once
   * the user has consented) and awaited before the queued events are replayed,
   * so those events are enriched with the resolved location as they are sent.
   *
   * @returns A promise that resolves once opt-in processing has completed.
   */
  async optIn(): Promise<void> {
    this.update((state) => {
      state.optedIn = true;
      state.consentDecisionMade = true;
    });

    // Now that the user has consented, resolve geolocation (once) and wait for
    // it so the queued pre-consent events can be enriched as they replay.
    await this.#maybeResolveLocation();

    // Reconcile against the current state rather than replaying blindly: the
    // consent decision may have changed while geolocation was resolving (e.g.
    // resetConsentDecision ran during the await), and preserved pre-consent
    // events must not be delivered once the user is no longer opted in.
    this.#reconcilePreConsentEvents();
  }

  /**
   * Opt out of analytics.
   *
   * Records that a consent decision has been made and discards any persisted
   * events and in-progress event fragments so nothing captured before the
   * decision is ever delivered.
   */
  optOut(): void {
    this.update((state) => {
      state.optedIn = false;
      state.consentDecisionMade = true;
    });

    this.#clearQueuedEventsInLane(
      AnalyticsQueueField.Event,
      AnalyticsLane.Product,
    );
    this.#clearQueuedEventsInLane(
      AnalyticsQueueField.PreConsent,
      AnalyticsLane.Product,
    );
    this.#clearEventFragmentsInLane(AnalyticsLane.Product);
  }

  /**
   * Reset the consent decision back to undecided.
   *
   * Intended for client flows that restart onboarding. Clears the opt-in
   * preference and discards the delivery queue, but preserves any pre-consent
   * events so they can still be replayed if the user opts in again. The user is
   * treated as undecided again.
   *
   * In-progress event fragments are kept only while the undecided user can
   * still accumulate them, and discarded otherwise, so no fragment outlives the
   * consent state that allowed it.
   */
  resetConsentDecision(): void {
    this.update((state) => {
      state.optedIn = false;
      state.consentDecisionMade = false;
    });

    this.#clearQueuedEventsInLane(
      AnalyticsQueueField.Event,
      AnalyticsLane.Product,
    );
    if (!this.#isCaptureAllowed(AnalyticsLane.Product)) {
      this.#clearEventFragmentsInLane(AnalyticsLane.Product);
    }
  }

  /**
   * Opt in to marketing analytics.
   *
   * Independent of {@link optIn}. Replays queued marketing events.
   *
   * @returns A promise that resolves once opt-in processing has completed.
   */
  async optInToMarketing(): Promise<void> {
    this.update((state) => {
      state.optedInToMarketing = true;
      state.marketingConsentDecisionMade = true;
    });

    await this.#maybeResolveLocation();
    this.#reconcilePreConsentEvents();
  }

  /**
   * Opt out of marketing analytics.
   *
   * Independent of {@link optOut}. Discards queued marketing events and
   * marketing event fragments.
   */
  optOutOfMarketing(): void {
    this.update((state) => {
      state.optedInToMarketing = false;
      state.marketingConsentDecisionMade = true;
    });

    this.#clearQueuedEventsInLane(
      AnalyticsQueueField.Event,
      AnalyticsLane.Marketing,
    );
    this.#clearQueuedEventsInLane(
      AnalyticsQueueField.PreConsent,
      AnalyticsLane.Marketing,
    );
    this.#clearEventFragmentsInLane(AnalyticsLane.Marketing);
  }

  /**
   * Reset the marketing consent decision back to undecided.
   *
   * Independent of {@link resetConsentDecision}.
   */
  resetMarketingConsentDecision(): void {
    this.update((state) => {
      state.optedInToMarketing = false;
      state.marketingConsentDecisionMade = false;
    });

    this.#clearQueuedEventsInLane(
      AnalyticsQueueField.Event,
      AnalyticsLane.Marketing,
    );
    if (!this.#isCaptureAllowed(AnalyticsLane.Marketing)) {
      this.#clearEventFragmentsInLane(AnalyticsLane.Marketing);
    }
  }
}
