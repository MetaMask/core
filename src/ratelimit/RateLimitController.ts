import type { Patch } from 'immer';

import { BaseController } from '../BaseControllerV2';

import type { RestrictedControllerMessenger } from '../ControllerMessenger';
import type { GetSubjectMetadataState } from '../subject-metadata';

/**
 * @type RateLimitState
 * @property requests - Object containing number of requests in a given interval for each origin and api type combination
 */
export type RateLimitState = {
  requests: Record<ApiType, Record<string, number>>;
};

export enum ApiType {
  showNativeNotification = 'showNativeNotification',
}

export interface CallArgs {
  /**
   * Enum type to determine API type.
   */
  type: ApiType;

  /**
   * Args passed to the API call
   */
  // @todo Type this?
  args: any;
}

const name = 'RateLimitController';

export type RateLimitStateChange = {
  type: `${typeof name}:stateChange`;
  payload: [RateLimitState, Patch[]];
};

export type GetRateLimitState = {
  type: `${typeof name}:getState`;
  handler: () => RateLimitState;
};

export type CallAPI = {
  type: `${typeof name}:call`;
  handler: RateLimitController['call'];
};

export type ControllerActions = GetRateLimitState | CallAPI;

type AllowedActions = GetSubjectMetadataState;

export type RateLimitMessenger = RestrictedControllerMessenger<
  typeof name,
  ControllerActions | AllowedActions,
  RateLimitStateChange,
  AllowedActions['type'],
  never
>;

const metadata = {
  requests: { persist: false, anonymous: false },
};

const defaultState = {
  requests: { [ApiType.showNativeNotification]: {} },
};

/**
 * Controller that handles showing notifications to the user and rate limiting origins
 */
export class RateLimitController extends BaseController<
  typeof name,
  RateLimitState,
  RateLimitMessenger
> {
  private showNativeNotification;

  private rateLimitTimeout;

  private rateLimitCount;

  /**
   * Creates a RateLimitController instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.showNativeNotification - Function that shows a native notification in the consumer
   * @param options.rateLimitTimeout - The time window in which the rate limit is applied
   * @param options.rateLimitCount - The amount of notifications an origin can show in the rate limit time window
   */
  constructor({
    // @todo Pick some sane defaults for this
    rateLimitTimeout = 5000,
    rateLimitCount = 3,
    messenger,
    state,
    showNativeNotification,
  }: {
    rateLimitTimeout?: number;
    rateLimitCount?: number;
    messenger: RateLimitMessenger;
    state?: Partial<RateLimitState>;
    showNativeNotification: (
      title: string,
      message: string,
      url?: string,
    ) => void;
  }) {
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state },
    });
    this.showNativeNotification = showNativeNotification;
    this.rateLimitTimeout = rateLimitTimeout;
    this.rateLimitCount = rateLimitCount;

    this.messagingSystem.registerActionHandler(
      `${name}:call` as const,
      (origin: string, args: CallArgs) => this.call(origin, args),
    );
  }

  /**
   * Shows a notification if origin is not rate-limited.
   *
   * @param origin - The origin trying to send a notification
   * @param _args - Notification arguments, containing the notification message etc.
   * @returns False if rate-limited, true if not
   */
  call(origin: string, _args: CallArgs) {
    const { type, args } = _args;
    if (this._isRateLimited(type, origin)) {
      return false;
    }
    this._recordRequest(type, origin);

    switch (type) {
      case ApiType.showNativeNotification:
        this.showNativeNotification(args.title, args.message);
        break;
      default:
        throw new Error('Invalid api type');
    }

    return true;
  }

  /**
   * Checks whether a given origin is rate limited for a given API.
   *
   * @param api - The API the origin is trying to access
   * @param origin - The origin trying to access the API
   * @returns True if rate-limited
   */
  _isRateLimited(api: ApiType, origin: string) {
    return this.state.requests[api][origin] >= this.rateLimitCount;
  }

  /**
   * Records that an origin has made a request to call an API. For rate limiting purposes.
   *
   * @param api - The API the origin is trying to access
   * @param origin - The origin trying to access the API
   */
  _recordRequest(api: ApiType, origin: string) {
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
  _resetRequestCount(api: ApiType, origin: string) {
    this.update((state) => {
      state.requests[api][origin] = 0;
    });
  }
}
