import type { ActionConstraint, RestrictedControllerMessenger, ControllerGetStateAction, ControllerStateChangeEvent } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
/**
 * A rate-limited API endpoint.
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
 * A map of rate-limited API types to APIs.
 */
export type RateLimitedApiMap = Record<string, RateLimitedApi>;
/**
 * A map of rate-limited API types to the number of requests made in a given interval for each origin and api type combination.
 * @template RateLimitedApis - A {@link RateLimitedApiMap} containing the rate-limited API endpoints that is used by the {@link RateLimitController}.
 */
export type RateLimitedRequests<RateLimitedApis extends RateLimitedApiMap> = Record<keyof RateLimitedApis, Record<string, number>>;
/**
 * The state of the {@link RateLimitController}.
 * @template RateLimitedApis - A {@link RateLimitedApiMap} containing the rate-limited API endpoints that is used by the {@link RateLimitController}.
 * @property requests - An object containing the number of requests made in a given interval for each origin and api type combination.
 */
export type RateLimitState<RateLimitedApis extends RateLimitedApiMap> = {
    requests: RateLimitedRequests<RateLimitedApis>;
};
declare const name = "RateLimitController";
export type RateLimitControllerStateChangeEvent<RateLimitedApis extends RateLimitedApiMap> = ControllerStateChangeEvent<typeof name, RateLimitState<RateLimitedApis>>;
export type RateLimitControllerGetStateAction<RateLimitedApis extends RateLimitedApiMap> = ControllerGetStateAction<typeof name, RateLimitState<RateLimitedApis>>;
export type RateLimitControllerCallApiAction<RateLimitedApis extends RateLimitedApiMap> = {
    type: `${typeof name}:call`;
    handler: RateLimitController<RateLimitedApis>['call'];
};
export type RateLimitControllerActions<RateLimitedApis extends RateLimitedApiMap> = RateLimitControllerGetStateAction<RateLimitedApis> | RateLimitControllerCallApiAction<RateLimitedApis>;
export type RateLimitControllerEvents<RateLimitedApis extends RateLimitedApiMap> = RateLimitControllerStateChangeEvent<RateLimitedApis>;
export type RateLimitMessenger<RateLimitedApis extends RateLimitedApiMap> = RestrictedControllerMessenger<typeof name, RateLimitControllerActions<RateLimitedApis>, RateLimitControllerEvents<RateLimitedApis>, never, never>;
/**
 * Controller with logic for rate-limiting API endpoints per requesting origin.
 */
export declare class RateLimitController<RateLimitedApis extends RateLimitedApiMap> extends BaseController<typeof name, RateLimitState<RateLimitedApis>, RateLimitMessenger<RateLimitedApis>> {
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
    constructor({ rateLimitTimeout, rateLimitCount, messenger, state, implementations, }: {
        rateLimitTimeout?: number;
        rateLimitCount?: number;
        messenger: RateLimitMessenger<RateLimitedApis>;
        state?: Partial<RateLimitState<RateLimitedApis>>;
        implementations: RateLimitedApis;
    });
    /**
     * Calls an API if the requesting origin is not rate-limited.
     *
     * @param origin - The requesting origin.
     * @param type - The type of API call to make.
     * @param args - Arguments for the API call.
     */
    call<ApiType extends keyof RateLimitedApis>(origin: string, type: ApiType, ...args: Parameters<RateLimitedApis[ApiType]['method']>): Promise<ReturnType<RateLimitedApis[ApiType]['method']>>;
    /**
     * Checks whether an origin is rate limited for the a specific API.
     *
     * @param api - The API the origin is trying to access.
     * @param origin - The origin trying to access the API.
     * @returns `true` if rate-limited, and `false` otherwise.
     */
    private isRateLimited;
    /**
     * Records that an origin has made a request to call an API, for rate-limiting purposes.
     *
     * @param api - The API the origin is trying to access.
     * @param origin - The origin trying to access the API.
     */
    private recordRequest;
    /**
     * Resets the request count for a given origin and API combination, for rate-limiting purposes.
     *
     * @param api - The API in question.
     * @param origin - The origin in question.
     */
    private resetRequestCount;
}
export {};
//# sourceMappingURL=RateLimitController.d.ts.map