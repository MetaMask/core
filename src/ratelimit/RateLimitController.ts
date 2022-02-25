import type { Patch } from 'immer';

import { BaseController } from '../BaseControllerV2';

import type { RestrictedControllerMessenger } from '../ControllerMessenger';

/**
 * @type RateLimitState
 * @property requests - Object containing number of requests in a given interval for each origin and api type combination
 */
export type RateLimitState<T extends string> = {
  requests: Record<T, Record<string, number>>;
};

export interface CallArgs<T> {
  /**
   * Enum type to determine API type.
   */
  type: T;

  /**
   * Args passed to the API call
   */
  // @todo Type this?
  args: any[];
}

const name = 'RateLimitController';

export type RateLimitStateChange<T extends string> = {
  type: `${typeof name}:stateChange`;
  payload: [RateLimitState<T>, Patch[]];
};

export type GetRateLimitState<T extends string> = {
  type: `${typeof name}:getState`;
  handler: () => RateLimitState<T>;
};

export type CallAPI<T extends string> = {
  type: `${typeof name}:call`;
  handler: RateLimitController<T>['call'];
};

export type ControllerActions<T extends string> =
  | GetRateLimitState<T>
  | CallAPI<T>;

export type RateLimitMessenger<
  T extends string
> = RestrictedControllerMessenger<
  typeof name,
  ControllerActions<T>,
  RateLimitStateChange<T>,
  never,
  never
>;

const metadata = {
  requests: { persist: false, anonymous: false },
};

/**
 * Controller that handles showing notifications to the user and rate limiting origins
 */
export class RateLimitController<T extends string> extends BaseController<
  typeof name,
  RateLimitState<T>,
  RateLimitMessenger<T>
> {
  private implementations;

  private rateLimitTimeout;

  private rateLimitCount;

  /**
   * Creates a RateLimitController instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.implementations - Mapping from API type to API implementation
   * @param options.rateLimitTimeout - The time window in which the rate limit is applied
   * @param options.rateLimitCount - The amount of notifications an origin can show in the rate limit time window
   */
  constructor({
    // @todo Pick some sane defaults for this
    rateLimitTimeout = 5000,
    rateLimitCount = 3,
    messenger,
    state,
    implementations,
  }: {
    rateLimitTimeout?: number;
    rateLimitCount?: number;
    messenger: RateLimitMessenger<T>;
    state?: Partial<RateLimitState<T>>;
    implementations: Record<T, any>;
  }) {
    const defaultState = {
      requests: Object.keys(implementations).reduce(
        (acc, key) => ({ ...acc, [key]: {} }),
        {} as Record<T, Record<string, number>>,
      ),
    };
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.implementations = implementations;
    this.rateLimitTimeout = rateLimitTimeout;
    this.rateLimitCount = rateLimitCount;

    this.messagingSystem.registerActionHandler(
      `${name}:call` as const,
      (origin: string, args: CallArgs<T>) => this.call(origin, args),
    );
  }

  /**
   * Shows a notification if origin is not rate-limited.
   *
   * @param origin - The origin trying to send a notification
   * @param _args - Notification arguments, containing the notification message etc.
   * @returns False if rate-limited, true if not
   */
  call(origin: string, _args: CallArgs<T>) {
    const { type, args } = _args;
    if (this._isRateLimited(type, origin)) {
      return false;
    }
    this._recordRequest(type, origin);

    const implementation = this.implementations[type];

    if (!implementation) {
      throw new Error('Invalid api type');
    }

    implementation(...args);

    return true;
  }

  /**
   * Checks whether a given origin is rate limited for a given API.
   *
   * @param api - The API the origin is trying to access
   * @param origin - The origin trying to access the API
   * @returns True if rate-limited
   */
  _isRateLimited(api: T, origin: string) {
    return this.state.requests[api][origin] >= this.rateLimitCount;
  }

  /**
   * Records that an origin has made a request to call an API. For rate limiting purposes.
   *
   * @param api - The API the origin is trying to access
   * @param origin - The origin trying to access the API
   */
  _recordRequest(api: T, origin: string) {
    this.update((state) => {
      state.requests[api][origin] = (state.requests[api][origin] ?? 0) + 1;
      setTimeout(
        () => this._resetRequestCount(api, origin),
        this.rateLimitTimeout,
      );
    });
  }

  /**
   * Resets the request count for a given origin and api combination. For rate limiting purposes.
   *
   * @param api - The API is question
   * @param origin - The origin in question
   */
  _resetRequestCount(api: T, origin: string) {
    this.update((state) => {
      state.requests[api][origin] = 0;
    });
  }
}
