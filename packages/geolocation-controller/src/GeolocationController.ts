import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { GeolocationControllerMethodActions } from './GeolocationController-method-action-types';
import type { GeolocationStatus } from './types';

const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Sentinel value used when the geolocation has not been determined yet or when
 * the API returns an empty response.
 */
export const UNKNOWN_LOCATION = 'UNKNOWN';

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
  status: GeolocationStatus;
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
type AllowedActions = never;

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
  /** Injectable fetch function. Defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Callback returning the geolocation API URL for the current environment. */
  getGeolocationUrl: () => string;
  /** Cache time-to-live in milliseconds. Defaults to 5 minutes. */
  ttlMs?: number;
};

/**
 * GeolocationController centralises geolocation fetching behind a single
 * controller with TTL caching and request deduplication.
 *
 * This controller is platform-agnostic and designed to be used across different
 * MetaMask clients (extension, mobile). It fetches a country code from the
 * geolocation API and caches it in-memory for a configurable duration.
 *
 * Concurrent callers receive the same in-flight promise, preventing duplicate
 * network requests.
 */
export class GeolocationController extends BaseController<
  typeof controllerName,
  GeolocationControllerState,
  GeolocationControllerMessenger
> {
  #fetchPromise: Promise<string> | null = null;

  #fetchGeneration = 0;

  readonly #ttlMs: number;

  readonly #getGeolocationUrl: () => string;

  readonly #fetch: typeof globalThis.fetch;

  /**
   * Constructs a new {@link GeolocationController}.
   *
   * @param args - The arguments to this controller.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - Optional partial initial state.
   * @param args.fetch - Injectable fetch function.
   * @param args.getGeolocationUrl - Callback returning the API URL.
   * @param args.ttlMs - Cache TTL in milliseconds.
   */
  constructor({
    messenger,
    state,
    fetch: fetchFunction,
    getGeolocationUrl,
    ttlMs,
  }: GeolocationControllerOptions) {
    super({
      messenger,
      metadata: geolocationControllerMetadata,
      name: controllerName,
      state: { ...getDefaultGeolocationControllerState(), ...state },
    });

    this.#fetch = fetchFunction ?? globalThis.fetch;
    this.#getGeolocationUrl = getGeolocationUrl;
    this.#ttlMs = ttlMs ?? DEFAULT_TTL_MS;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Returns the cached geolocation if still valid, otherwise fetches it.
   * Concurrent calls are deduplicated to a single network request.
   *
   * @returns The ISO country code string.
   */
  async getGeolocation(): Promise<string> {
    if (this.#isCacheValid()) {
      return this.state.location;
    }

    if (this.#fetchPromise) {
      return this.#fetchPromise;
    }

    // Assign #fetchPromise before #performFetch's synchronous body runs, so
    // re-entrant callers from stateChange listeners see an in-flight promise.
    let resolve!: (value: string | PromiseLike<string>) => void;
    const promise = new Promise<string>((_resolve) => {
      resolve = _resolve;
    });
    this.#fetchPromise = promise;
    resolve(this.#performFetch());

    try {
      return await promise;
    } finally {
      if (this.#fetchPromise === promise) {
        this.#fetchPromise = null;
      }
    }
  }

  /**
   * Forces a fresh geolocation fetch, bypassing the cache.
   *
   * @returns The ISO country code string.
   */
  async refreshGeolocation(): Promise<string> {
    this.#fetchGeneration += 1;
    this.#fetchPromise = null;
    this.update((draft) => {
      draft.lastFetchedAt = null;
    });
    return this.getGeolocation();
  }

  /**
   * Checks whether the cached geolocation is still within the TTL window.
   *
   * @returns True if the cache is valid.
   */
  #isCacheValid(): boolean {
    const { lastFetchedAt } = this.state;
    return lastFetchedAt !== null && Date.now() - lastFetchedAt < this.#ttlMs;
  }

  /**
   * Performs the actual network fetch and updates controller state.
   *
   * @returns The ISO country code string.
   */
  async #performFetch(): Promise<string> {
    const generation = this.#fetchGeneration;

    this.update((draft) => {
      draft.status = 'loading';
      draft.error = null;
    });

    try {
      const url = this.#getGeolocationUrl();
      const response = await this.#fetch(url);

      if (!response.ok) {
        throw new Error(`Geolocation fetch failed: ${response.status}`);
      }

      const raw = (await response.text()).trim();
      const location = /^[A-Z]{2}$/u.test(raw) ? raw : UNKNOWN_LOCATION;

      if (generation === this.#fetchGeneration) {
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

      if (generation === this.#fetchGeneration) {
        this.update((draft) => {
          draft.status = 'error';
          draft.error = message;
        });
      }

      return this.state.location;
    }
  }
}
