import type { Patch } from 'immer';
import { BaseController } from '../BaseControllerV2';
import type { RestrictedControllerMessenger } from '../ControllerMessenger';
/**
 * @type RateLimitState
 * @property requests - Object containing number of requests in a given interval for each origin and api type combination
 */
export declare type RateLimitState<RateLimitedApis extends Record<string, (...args: any[]) => any>> = {
    requests: Record<keyof RateLimitedApis, Record<string, number>>;
};
declare const name = "RateLimitController";
export declare type RateLimitStateChange<RateLimitedApis extends Record<string, (...args: any[]) => any>> = {
    type: `${typeof name}:stateChange`;
    payload: [RateLimitState<RateLimitedApis>, Patch[]];
};
export declare type GetRateLimitState<RateLimitedApis extends Record<string, (...args: any[]) => any>> = {
    type: `${typeof name}:getState`;
    handler: () => RateLimitState<RateLimitedApis>;
};
export declare type CallApi<RateLimitedApis extends Record<string, (...args: any[]) => any>> = {
    type: `${typeof name}:call`;
    handler: RateLimitController<RateLimitedApis>['call'];
};
export declare type RateLimitControllerActions<RateLimitedApis extends Record<string, (...args: any[]) => any>> = GetRateLimitState<RateLimitedApis> | CallApi<RateLimitedApis>;
export declare type RateLimitMessenger<RateLimitedApis extends Record<string, (...args: any[]) => any>> = RestrictedControllerMessenger<typeof name, RateLimitControllerActions<RateLimitedApis>, RateLimitStateChange<RateLimitedApis>, never, never>;
/**
 * Controller with logic for rate-limiting API endpoints per requesting origin.
 */
export declare class RateLimitController<RateLimitedApis extends Record<string, (...args: any[]) => any>> extends BaseController<typeof name, RateLimitState<RateLimitedApis>, RateLimitMessenger<RateLimitedApis>> {
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
     * @returns `false` if rate-limited, and `true` otherwise.
     */
    call<ApiType extends keyof RateLimitedApis>(origin: string, type: ApiType, ...args: Parameters<RateLimitedApis[ApiType]>): Promise<ReturnType<RateLimitedApis[ApiType]>>;
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
