import type {
  AnalyticsContext,
  AnalyticsEventProperties,
} from './AnalyticsPlatformAdapter.types';

/**
 * A bag of analytics properties that accumulates across a user journey.
 *
 * A fragment lets several parts of a client contribute properties to the same
 * logical journey (a signature request, a transaction confirmation) without
 * having to re-derive them for every event, and lets the journey be closed as
 * a success or a failure.
 *
 * All three event names are optional. A fragment that declares none of them
 * never emits anything and acts purely as a property bag that the client reads
 * back with {@link AnalyticsController.getEventFragmentById} at the moment it
 * emits its own event.
 */
export type AnalyticsEventFragment = {
  /**
   * The fragment identifier, unique per client.
   */
  id: string;

  /**
   * Properties tracked with every event this fragment emits.
   */
  properties: AnalyticsEventProperties;

  /**
   * Properties that must not be linked to the user's analytics ID. They are
   * delivered on a separate anonymous payload when the anonymous events
   * feature is enabled.
   */
  sensitiveProperties: AnalyticsEventProperties;

  /**
   * Name of an event emitted immediately when the fragment is created.
   */
  initialEvent?: string;

  /**
   * Name of the event emitted when the fragment is finalized normally.
   */
  successEvent?: string;

  /**
   * Name of the event emitted when the fragment is finalized as abandoned.
   */
  failureEvent?: string;

  /**
   * Platform-specific context forwarded with every event this fragment emits.
   */
  context?: AnalyticsContext;

  /**
   * Whether the fragment survives {@link AnalyticsController.init}. Fragments
   * that do not set this are discarded when the controller re-initializes,
   * since the journey they belonged to cannot be resumed. Even with this set,
   * a fragment whose {@link lastUpdated} is older than the controller's max
   * fragment age is discarded on init.
   */
  persist?: boolean;

  /**
   * `Date.now()` when the fragment was created.
   */
  createdAt: number;

  /**
   * `Date.now()` when the fragment was last written to. Used on
   * {@link AnalyticsController.init} to expire abandoned persisted fragments.
   */
  lastUpdated: number;
};

/**
 * Public, read-only view of an {@link AnalyticsEventFragment}.
 *
 * Returned by {@link AnalyticsController.createEventFragment} and
 * {@link AnalyticsController.getEventFragmentById}. Callers must use
 * {@link AnalyticsController.updateEventFragment} (or
 * {@link AnalyticsController.upsertEventFragment}) to modify fragment data.
 */
export type ReadonlyAnalyticsEventFragment = Readonly<{
  id: string;
  properties: Readonly<AnalyticsEventProperties>;
  sensitiveProperties: Readonly<AnalyticsEventProperties>;
  initialEvent?: string;
  successEvent?: string;
  failureEvent?: string;
  context?: Readonly<AnalyticsContext>;
  persist?: boolean;
  createdAt: number;
  lastUpdated: number;
}>;

/**
 * Event fragments keyed by fragment ID.
 */
export type AnalyticsEventFragments = Record<string, AnalyticsEventFragment>;

/**
 * Options accepted when creating an event fragment. An `id` is generated when
 * one is not supplied.
 */
export type AnalyticsEventFragmentOptions = Partial<
  Pick<
    AnalyticsEventFragment,
    | 'id'
    | 'initialEvent'
    | 'successEvent'
    | 'failureEvent'
    | 'properties'
    | 'sensitiveProperties'
    | 'context'
    | 'persist'
  >
>;

/**
 * The fields that can be written to an existing event fragment.
 */
export type AnalyticsEventFragmentPayload = Pick<
  AnalyticsEventFragmentOptions,
  'properties' | 'sensitiveProperties' | 'context'
>;

/**
 * Options accepted when finalizing an event fragment.
 */
export type AnalyticsEventFragmentFinalizeOptions = {
  /**
   * Whether the journey was abandoned, which selects `failureEvent` instead of
   * `successEvent`.
   */
  abandoned?: boolean;

  /**
   * Context merged over the fragment's own context for the emitted event.
   */
  context?: AnalyticsContext;
};
