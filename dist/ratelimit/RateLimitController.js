"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitController = void 0;
const eth_rpc_errors_1 = require("eth-rpc-errors");
const BaseControllerV2_1 = require("../BaseControllerV2");
const name = 'RateLimitController';
const metadata = {
    requests: { persist: false, anonymous: false },
};
/**
 * Controller with logic for rate-limiting API endpoints per requesting origin.
 */
class RateLimitController extends BaseControllerV2_1.BaseController {
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
    constructor({ rateLimitTimeout = 5000, rateLimitCount = 1, messenger, state, implementations, }) {
        const defaultState = {
            requests: Object.keys(implementations).reduce((acc, key) => (Object.assign(Object.assign({}, acc), { [key]: {} })), {}),
        };
        super({
            name,
            metadata,
            messenger,
            state: Object.assign(Object.assign({}, defaultState), state),
        });
        this.implementations = implementations;
        this.rateLimitTimeout = rateLimitTimeout;
        this.rateLimitCount = rateLimitCount;
        this.messagingSystem.registerActionHandler(`${name}:call`, ((origin, type, ...args) => this.call(origin, type, ...args)));
    }
    /**
     * Calls an API if the requesting origin is not rate-limited.
     *
     * @param origin - The requesting origin.
     * @param type - The type of API call to make.
     * @param args - Arguments for the API call.
     * @returns `false` if rate-limited, and `true` otherwise.
     */
    call(origin, type, ...args) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isRateLimited(type, origin)) {
                throw eth_rpc_errors_1.ethErrors.rpc.limitExceeded({
                    message: `"${type}" is currently rate-limited. Please try again later.`,
                });
            }
            this.recordRequest(type, origin);
            const implementation = this.implementations[type];
            if (!implementation) {
                throw new Error('Invalid api type');
            }
            return implementation(...args);
        });
    }
    /**
     * Checks whether an origin is rate limited for the a specific API.
     *
     * @param api - The API the origin is trying to access.
     * @param origin - The origin trying to access the API.
     * @returns `true` if rate-limited, and `false` otherwise.
     */
    isRateLimited(api, origin) {
        return this.state.requests[api][origin] >= this.rateLimitCount;
    }
    /**
     * Records that an origin has made a request to call an API, for rate-limiting purposes.
     *
     * @param api - The API the origin is trying to access.
     * @param origin - The origin trying to access the API.
     */
    recordRequest(api, origin) {
        this.update((state) => {
            var _a;
            const previous = (_a = state.requests[api][origin]) !== null && _a !== void 0 ? _a : 0;
            state.requests[api][origin] = previous + 1;
            if (previous === 0) {
                setTimeout(() => this.resetRequestCount(api, origin), this.rateLimitTimeout);
            }
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
            state.requests[api][origin] = 0;
        });
    }
}
exports.RateLimitController = RateLimitController;
//# sourceMappingURL=RateLimitController.js.map