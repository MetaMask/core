import type { Patch } from 'immer';

import { BaseController } from '../BaseControllerV2';

import type { RestrictedControllerMessenger } from '../ControllerMessenger';

/**
 * @type RateLimitState
 * @property requests - Object containing number of requests in a given interval for each origin and api type combination
 */
export type RateLimitState<ApiType extends string> = {
  requests: Record<ApiType, Record<string, number>>;
};

export interface CallArgs<ApiType> {
  /**
   * Enum type to determine API type.
   */
  type: ApiType;

  /**
   * Args passed to the API call
   */
  args?: unknown[];
}

export type RateLimitWrapper =
  | { isRateLimited: false; result: unknown }
  | { isRateLimited: true };

const name = 'RateLimitController';

export type RateLimitStateChange<ApiType extends string> = {
  type: `${typeof name}:stateChange`;
  payload: [RateLimitState<ApiType>, Patch[]];
};

export type GetRateLimitState<ApiType extends string> = {
  type: `${typeof name}:getState`;
  handler: () => RateLimitState<ApiType>;
};

export type CallApi<ApiType extends string> = {
  type: `${typeof name}:call`;
  handler: RateLimitController<ApiType>['call'];
};

export type ControllerActions<ApiType extends string> =
  | GetRateLimitState<ApiType>
  | CallApi<ApiType>;

export type RateLimitMessenger<
  ApiType extends string
> = RestrictedControllerMessenger<
  typeof name,
  ControllerActions<ApiType>,
  RateLimitStateChange<ApiType>,
  never,
  never
>;

const metadata = {
  requests: { persist: false, anonymous: false },
};

/**
 * Controller with logic for rate-limiting API endpoints per requesting origin.
 */
export class RateLimitController<ApiType extends string> extends BaseController<
  typeof name,
  RateLimitState<ApiType>,
  RateLimitMessenger<ApiType>
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
   * @param options.implementations - Mapping from API type to API implementation.
   * @param options.rateLimitTimeout - The time window in which the rate limit is applied.
   * @param options.rateLimitCount - The amount of notifications an origin can show in the rate limit time window.
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
    messenger: RateLimitMessenger<ApiType>;
    state?: Partial<RateLimitState<ApiType>>;
    implementations: Record<ApiType, (...args: unknown[]) => unknown>;
  }) {
    const defaultState = {
      requests: Object.keys(implementations).reduce(
        (acc, key) => ({ ...acc, [key]: {} }),
        {} as Record<ApiType, Record<string, number>>,
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
      (origin: string, args: CallArgs<ApiType>) => this.call(origin, args),
    );
  }

  /**
   * Calls an API if the requesting origin is not rate-limited.
   *
   * @param origin - The requesting origin.
   * @param _args - Arguments for the API call.
   * @returns `false` if rate-limited, and `true` otherwise.
   */
  async call(
    origin: string,
    _args: CallArgs<ApiType>,
  ): Promise<RateLimitWrapper> {
    const { type, args } = _args;
    if (this._isRateLimited(type, origin)) {
      return { isRateLimited: true };
    }
    this._recordRequest(type, origin);

    const implementation = this.implementations[type];

    if (!implementation) {
      throw new Error('Invalid api type');
    }

    const result = await implementation(...(args ?? []));

    return { isRateLimited: false, result };
  }

  /**
   * Checks whether an origin is rate limited for the a specific API.
   *
   * @param api - The API the origin is trying to access.
   * @param origin - The origin trying to access the API.
   * @returns `true` if rate-limited, and `false` otherwise.
   */
  _isRateLimited(api: ApiType, origin: string) {
    return this.state.requests[api][origin] >= this.rateLimitCount;
  }

  /**
   * Records that an origin has made a request to call an API, for rate-limiting purposes.
   *
   * @param api - The API the origin is trying to access.
   * @param origin - The origin trying to access the API.
   */
  _recordRequest(api: ApiType, origin: string) {
    this.update((state) => {
      (state as any).requests[api][origin] =
        ((state as RateLimitState<ApiType>).requests[api][origin] ?? 0) + 1;

      setTimeout(
        () => this._resetRequestCount(api, origin),
        this.rateLimitTimeout,
      );
    });
  }

  /**
   * Resets the request count for a given origin and API combination, for rate-limiting purposes.
   *
   * @param api - The API in question.
   * @param origin - The origin in question.
   */
  _resetRequestCount(api: ApiType, origin: string) {
    this.update((state) => {
      (state as any).requests[api][origin] = 0;
    });
  }
}
