import type {
  ActionConstraint,
  RestrictedControllerMessenger,
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { rpcErrors } from '@metamask/rpc-errors';

/**
 * @type RateLimitedApi
 * @property method - The method that is rate-limited.
 * @property rateLimitTimeout - The time window in which the rate limit is applied (in ms).
 * @property rateLimitCount - The amount of calls an origin can make in the rate limit time window.
 */
export type RateLimitedApi = {
  method: ActionConstraint['handler'];
  rateLimitTimeout?: number;
  rateLimitCount?: number;
};

/**
 * @type RateLimitState
 * @property requests - Object containing number of requests in a given interval for each origin and api type combination
 */
export type RateLimitState<
  RateLimitedApis extends Record<string, RateLimitedApi>,
> = {
  requests: Record<keyof RateLimitedApis, Record<string, number>>;
};

const name = 'RateLimitController';

export type RateLimitStateChange<
  RateLimitedApis extends Record<string, RateLimitedApi>,
> = ControllerStateChangeEvent<typeof name, RateLimitedApis>;

export type GetRateLimitState<
  RateLimitedApis extends Record<string, RateLimitedApi>,
> = ControllerGetStateAction<typeof name, RateLimitedApis>;

export type CallApi<RateLimitedApis extends Record<string, RateLimitedApi>> = {
  type: `${typeof name}:call`;
  handler: RateLimitController<RateLimitedApis>['call'];
};

export type RateLimitControllerActions<
  RateLimitedApis extends Record<string, RateLimitedApi>,
> = GetRateLimitState<RateLimitedApis> | CallApi<RateLimitedApis>;

export type RateLimitControllerEvents<
  RateLimitedApis extends Record<string, RateLimitedApi>,
> = RateLimitStateChange<RateLimitedApis>;

export type RateLimitMessenger<
  RateLimitedApis extends Record<string, RateLimitedApi>,
> = RestrictedControllerMessenger<
  typeof name,
  RateLimitControllerActions<RateLimitedApis>,
  RateLimitControllerEvents<RateLimitedApis>,
  never,
  never
>;

const metadata = {
  requests: { persist: false, anonymous: false },
};

/**
 * Controller with logic for rate-limiting API endpoints per requesting origin.
 */
export class RateLimitController<
  RateLimitedApis extends Record<string, RateLimitedApi>,
> extends BaseController<
  typeof name,
  RateLimitState<RateLimitedApis>,
  RateLimitMessenger<RateLimitedApis>
> {
  private readonly implementations;

  private readonly rateLimitTimeout;

  private readonly rateLimitCount;

  /**
   * Creates a RateLimitController instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.implementations - Mapping from API type to API implementation.
   * @param options.rateLimitTimeout - The time window in which the rate limit is applied (in ms).
   * @param options.rateLimitCount - The amount of calls an origin can make in the rate limit time window.
   */
  constructor({
    rateLimitTimeout = 5000,
    rateLimitCount = 1,
    messenger,
    state,
    implementations,
  }: {
    rateLimitTimeout?: number;
    rateLimitCount?: number;
    messenger: RateLimitMessenger<RateLimitedApis>;
    state?: Partial<RateLimitState<RateLimitedApis>>;
    implementations: RateLimitedApis;
  }) {
    const defaultState = {
      requests: Object.keys(implementations).reduce(
        (acc, key) => ({ ...acc, [key]: {} }),
        {} as Record<keyof RateLimitedApis, Record<string, number>>,
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
      (
        origin: string,
        type: keyof RateLimitedApis,
        ...args: Parameters<RateLimitedApis[keyof RateLimitedApis]['method']>
      ) => this.call(origin, type, ...args),
    );
  }

  /**
   * Calls an API if the requesting origin is not rate-limited.
   *
   * @param origin - The requesting origin.
   * @param type - The type of API call to make.
   * @param args - Arguments for the API call.
   */
  async call<ApiType extends keyof RateLimitedApis>(
    origin: string,
    type: ApiType,
    ...args: Parameters<RateLimitedApis[ApiType]['method']>
  ): Promise<ReturnType<RateLimitedApis[ApiType]['method']>> {
    if (this.isRateLimited(type, origin)) {
      throw rpcErrors.limitExceeded({
        message: `"${type.toString()}" is currently rate-limited. Please try again later.`,
      });
    }
    this.recordRequest(type, origin);

    const implementation = this.implementations[type].method;

    if (!implementation) {
      throw new Error('Invalid api type');
    }

    return implementation(...args) as ReturnType<
      RateLimitedApis[ApiType]['method']
    >;
  }

  /**
   * Checks whether an origin is rate limited for the a specific API.
   *
   * @param api - The API the origin is trying to access.
   * @param origin - The origin trying to access the API.
   * @returns `true` if rate-limited, and `false` otherwise.
   */
  private isRateLimited(api: keyof RateLimitedApis, origin: string) {
    const rateLimitCount =
      this.implementations[api].rateLimitCount ?? this.rateLimitCount;
    return this.state.requests[api][origin] >= rateLimitCount;
  }

  /**
   * Records that an origin has made a request to call an API, for rate-limiting purposes.
   *
   * @param api - The API the origin is trying to access.
   * @param origin - The origin trying to access the API.
   */
  private recordRequest(api: keyof RateLimitedApis, origin: string) {
    const rateLimitTimeout =
      this.implementations[api].rateLimitTimeout ?? this.rateLimitTimeout;
    this.update((state) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const previous = (state as any).requests[api][origin] ?? 0;
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state as any).requests[api][origin] = previous + 1;

      if (previous === 0) {
        setTimeout(() => this.resetRequestCount(api, origin), rateLimitTimeout);
      }
    });
  }

  /**
   * Resets the request count for a given origin and API combination, for rate-limiting purposes.
   *
   * @param api - The API in question.
   * @param origin - The origin in question.
   */
  private resetRequestCount(api: keyof RateLimitedApis, origin: string) {
    this.update((state) => {
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state as any).requests[api][origin] = 0;
    });
  }
}
