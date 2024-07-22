// src/RateLimitController.ts
import { BaseController } from "@metamask/base-controller";
import { rpcErrors } from "@metamask/rpc-errors";
import { getKnownPropertyNames } from "@metamask/utils";
var name = "RateLimitController";
var metadata = {
  requests: { persist: false, anonymous: false }
};
var RateLimitController = class extends BaseController {
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
    rateLimitTimeout = 5e3,
    rateLimitCount = 1,
    messenger,
    state,
    implementations
  }) {
    const defaultState = {
      requests: getKnownPropertyNames(implementations).reduce((acc, key) => ({ ...acc, [key]: {} }), {})
    };
    super({
      name,
      metadata,
      messenger,
      state: { ...defaultState, ...state }
    });
    this.implementations = implementations;
    this.rateLimitTimeout = rateLimitTimeout;
    this.rateLimitCount = rateLimitCount;
    this.messagingSystem.registerActionHandler(
      `${name}:call`,
      (origin, type, ...args) => this.call(origin, type, ...args)
    );
  }
  /**
   * Calls an API if the requesting origin is not rate-limited.
   *
   * @param origin - The requesting origin.
   * @param type - The type of API call to make.
   * @param args - Arguments for the API call.
   */
  async call(origin, type, ...args) {
    if (this.isRateLimited(type, origin)) {
      throw rpcErrors.limitExceeded({
        message: `"${type.toString()}" is currently rate-limited. Please try again later.`
      });
    }
    this.recordRequest(type, origin);
    const implementation = this.implementations[type].method;
    if (!implementation) {
      throw new Error("Invalid api type");
    }
    return implementation(...args);
  }
  /**
   * Checks whether an origin is rate limited for the a specific API.
   *
   * @param api - The API the origin is trying to access.
   * @param origin - The origin trying to access the API.
   * @returns `true` if rate-limited, and `false` otherwise.
   */
  isRateLimited(api, origin) {
    const rateLimitCount = this.implementations[api].rateLimitCount ?? this.rateLimitCount;
    return this.state.requests[api][origin] >= rateLimitCount;
  }
  /**
   * Records that an origin has made a request to call an API, for rate-limiting purposes.
   *
   * @param api - The API the origin is trying to access.
   * @param origin - The origin trying to access the API.
   */
  recordRequest(api, origin) {
    const rateLimitTimeout = this.implementations[api].rateLimitTimeout ?? this.rateLimitTimeout;
    const previous = this.state.requests[api][origin] ?? 0;
    this.update((state) => {
      if (previous === 0) {
        setTimeout(() => this.resetRequestCount(api, origin), rateLimitTimeout);
      }
      Object.assign(state, {
        requests: {
          ...state.requests,
          // TODO: Either fix this lint violation or explain why it's necessary to ignore.
          // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
          [api]: { [origin]: previous + 1 }
        }
      });
    });
  }
  /**
   * Resets the request count for a given origin and API combination, for rate-limiting purposes.
   *
   * @param api - The API in question.
   * @param origin - The origin in question.
   */
  resetRequestCount(api, origin) {
    this.update((state) => {
      Object.assign(state, {
        requests: {
          ...state.requests,
          [api]: { [origin]: 0 }
        }
      });
    });
  }
};

export {
  RateLimitController
};
//# sourceMappingURL=chunk-HM2SDRAC.mjs.map