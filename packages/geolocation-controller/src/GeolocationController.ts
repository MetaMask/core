import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { GeolocationApiServiceFetchGeolocationDataAction } from './geolocation-api-service/geolocation-api-service-method-action-types.js';
import type { GeolocationData } from './geolocation-api-service/geolocation-api-service.js';
import {
  getUnknownGeolocationData,
  toLocationCode,
  UNKNOWN_LOCATION,
} from './geolocation-api-service/geolocation-api-service.js';
import type { GeolocationControllerMethodActions } from './GeolocationController-method-action-types.js';
import type { GeolocationRequestStatus } from './types.js';

/**
 * The name of the {@link GeolocationController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'GeolocationController';

/**
 * State for the {@link GeolocationController}.
 */
export type GeolocationControllerState = {
  /** ISO 3166-2 location code (e.g. "US", "US-NY", "CA-ON"), or "UNKNOWN" if not yet determined. */
  location: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "US"), or null if not yet determined. */
  country: string | null;
  /** ISO 3166-2 subdivision code without the country prefix (e.g. "NY"), or null if not yet determined. */
  region: string | null;
  /** IANA time zone name (e.g. "America/Los_Angeles"), or null if not yet determined. */
  timezone: string | null;
  /** Current status of the geolocation fetch lifecycle. */
  status: GeolocationRequestStatus;
  /** Epoch milliseconds of the last successful fetch, or null if never fetched. */
  lastFetchedAt: number | null;
  /** Last error message, or null if no error has occurred. */
  error: string | null;
};

/**
 * The metadata for each property in {@link GeolocationControllerState}.
 */
const geolocationControllerMetadata = {
  location: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  country: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  region: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  timezone: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  status: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: true,
  },
  lastFetchedAt: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: false,
  },
  error: {
    persist: false,
    includeInDebugSnapshot: true,
    includeInStateLogs: true,
    usedInUi: false,
  },
} satisfies StateMetadata<GeolocationControllerState>;

/**
 * Constructs the default {@link GeolocationController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link GeolocationController} state.
 */
export function getDefaultGeolocationControllerState(): GeolocationControllerState {
  return {
    location: UNKNOWN_LOCATION,
    ...getUnknownGeolocationData(),
    status: 'idle',
    lastFetchedAt: null,
    error: null,
  };
}

const MESSENGER_EXPOSED_METHODS = [
  'getGeolocation',
  'getGeolocationData',
  'refreshGeolocation',
] as const;

/**
 * Retrieves the state of the {@link GeolocationController}.
 */
export type GeolocationControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  GeolocationControllerState
>;

/**
 * Actions that {@link GeolocationControllerMessenger} exposes to other consumers.
 */
export type GeolocationControllerActions =
  | GeolocationControllerGetStateAction
  | GeolocationControllerMethodActions;

/**
 * Actions from other messengers that {@link GeolocationControllerMessenger} calls.
 */
type AllowedActions = GeolocationApiServiceFetchGeolocationDataAction;

/**
 * Published when the state of {@link GeolocationController} changes.
 */
export type GeolocationControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  GeolocationControllerState
>;

/**
 * Events that {@link GeolocationControllerMessenger} exposes to other consumers.
 */
export type GeolocationControllerEvents = GeolocationControllerStateChangeEvent;

/**
 * Events from other messengers that {@link GeolocationControllerMessenger}
 * subscribes to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link GeolocationController}.
 */
export type GeolocationControllerMessenger = Messenger<
  typeof controllerName,
  GeolocationControllerActions | AllowedActions,
  GeolocationControllerEvents | AllowedEvents
>;

/**
 * Options for constructing the {@link GeolocationController}.
 */
export type GeolocationControllerOptions = {
  /** The messenger for inter-controller communication. */
  messenger: GeolocationControllerMessenger;
  /** Optional partial initial state. */
  state?: Partial<GeolocationControllerState>;
};

/**
 * GeolocationController manages UI-facing geolocation state by delegating
 * the actual API interaction to {@link GeolocationApiService} via the
 * messenger.
 *
 * The service (registered externally as
 * `GeolocationApiService:fetchGeolocation`) handles HTTP requests, response
 * validation, TTL caching, and promise deduplication. This controller focuses
 * on state lifecycle (`idle` -> `loading` -> `complete` | `error`) and
 * exposes `getGeolocation` / `refreshGeolocation` as messenger actions.
 */
export class GeolocationController extends BaseController<
  typeof controllerName,
  GeolocationControllerState,
  GeolocationControllerMessenger
> {
  /**
   * Constructs a new {@link GeolocationController}.
   *
   * @param args - The arguments to this controller.
   * @param args.messenger - The messenger suited for this controller. Must
   * have a `GeolocationApiService:fetchGeolocation` action handler registered.
   * @param args.state - Optional partial initial state.
   */
  constructor({ messenger, state }: GeolocationControllerOptions) {
    super({
      messenger,
      metadata: geolocationControllerMetadata,
      name: controllerName,
      state: { ...getDefaultGeolocationControllerState(), ...state },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Returns the geolocation code. Delegates to the
   * {@link GeolocationApiService} for network fetching and caching, then
   * updates controller state with the result.
   *
   * Best-effort: if the fetch fails, the last known location code (or
   * {@link UNKNOWN_LOCATION}) is returned rather than throwing.
   *
   * @returns The ISO 3166-2 location code string.
   */
  async getGeolocation(): Promise<string> {
    try {
      await this.#fetchAndUpdate();
    } catch {
      // Best-effort: fall back to the last known location code below.
    }
    return this.state.location;
  }

  /**
   * Returns the country, region, and timezone for the current client.
   * Delegates to the {@link GeolocationApiService} for network fetching and
   * caching, then updates controller state with the result.
   *
   * Unlike {@link getGeolocation}, this rejects when resolution fails instead
   * of returning a stale value, so callers can distinguish a fresh result from
   * a failed lookup (and, for example, omit location rather than enrich with a
   * previous session's data).
   *
   * @returns The geolocation data, where each field is `null` when it could
   * not be determined.
   * @throws When the geolocation service fails to resolve.
   */
  async getGeolocationData(): Promise<GeolocationData> {
    return this.#fetchAndUpdate();
  }

  /**
   * Forces a fresh geolocation fetch, bypassing the service's cache.
   *
   * Best-effort: if the fetch fails, the last known location code (or
   * {@link UNKNOWN_LOCATION}) is returned rather than throwing.
   *
   * @returns The ISO 3166-2 location code string.
   */
  async refreshGeolocation(): Promise<string> {
    this.update((draft) => {
      draft.lastFetchedAt = null;
    });
    try {
      await this.#fetchAndUpdate({ bypassCache: true });
    } catch {
      // Best-effort: fall back to the last known location code below.
    }
    return this.state.location;
  }

  /**
   * Calls the geolocation service and updates controller state with the
   * result.
   *
   * @param options - Options forwarded to the service.
   * @param options.bypassCache - When true, the service skips its TTL cache.
   * @returns The resolved geolocation data.
   * @throws Re-throws the service error after recording it in state, so
   * callers can react to a failed lookup instead of receiving a stale value.
   */
  async #fetchAndUpdate(options?: {
    bypassCache?: boolean;
  }): Promise<GeolocationData> {
    this.update((draft) => {
      draft.status = 'loading';
      draft.error = null;
    });

    try {
      const geolocation = await this.messenger.call(
        'GeolocationApiService:fetchGeolocationData',
        options,
      );

      this.update((draft) => {
        draft.location = toLocationCode(geolocation);
        draft.country = geolocation.country;
        draft.region = geolocation.region;
        draft.timezone = geolocation.timezone;
        draft.status = 'complete';
        draft.lastFetchedAt = Date.now();
        draft.error = null;
      });

      return geolocation;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.update((draft) => {
        draft.status = 'error';
        draft.error = message;
      });

      throw error;
    }
  }
}
