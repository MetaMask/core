import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import { UNKNOWN_LOCATION } from './geolocation-api-service/geolocation-api-service';
import type { GeolocationApiServiceFetchGeolocationAction } from './geolocation-api-service/geolocation-api-service-method-action-types';
import type { GeolocationControllerMethodActions } from './GeolocationController-method-action-types';
import type { GeolocationRequestStatus } from './types';

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
  /** ISO 3166-1 alpha-2 country code, or "UNKNOWN" if not yet determined. */
  location: string;
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
    status: 'idle',
    lastFetchedAt: null,
    error: null,
  };
}

const MESSENGER_EXPOSED_METHODS = [
  'getGeolocation',
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
type AllowedActions = GeolocationApiServiceFetchGeolocationAction;

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
  #stateGeneration = 0;

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
   * Returns the geolocation country code. Delegates to the
   * {@link GeolocationApiService} for network fetching and caching, then
   * updates controller state with the result.
   *
   * @returns The ISO country code string.
   */
  async getGeolocation(): Promise<string> {
    return this.#fetchAndUpdate();
  }

  /**
   * Forces a fresh geolocation fetch, bypassing the service's cache.
   *
   * @returns The ISO country code string.
   */
  async refreshGeolocation(): Promise<string> {
    this.#stateGeneration += 1;
    this.update((draft) => {
      draft.lastFetchedAt = null;
    });
    return this.#fetchAndUpdate({ bypassCache: true });
  }

  /**
   * Calls the geolocation service and updates controller state with the
   * result. Uses a generation guard so that a stale in-flight request
   * cannot overwrite state written by a newer call.
   *
   * @param options - Options forwarded to the service.
   * @param options.bypassCache - When true, the service skips its TTL cache.
   * @returns The ISO country code string.
   */
  async #fetchAndUpdate(options?: { bypassCache?: boolean }): Promise<string> {
    const generation = this.#stateGeneration;

    this.update((draft) => {
      draft.status = 'loading';
      draft.error = null;
    });

    try {
      const location = await this.messenger.call(
        'GeolocationApiService:fetchGeolocation',
        options,
      );

      if (generation === this.#stateGeneration) {
        this.update((draft) => {
          draft.location = location;
          draft.status = 'complete';
          draft.lastFetchedAt = Date.now();
          draft.error = null;
        });
      }

      return location;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (generation === this.#stateGeneration) {
        this.update((draft) => {
          draft.status = 'error';
          draft.error = message;
        });
      }

      return this.state.location;
    }
  }
}
