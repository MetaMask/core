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
exports.fetchTokenMetadata = exports.fetchTokenList = exports.TOKEN_METADATA_NO_SUPPORT_ERROR = exports.TOKEN_END_POINT_API = void 0;
const util_1 = require("../util");
exports.TOKEN_END_POINT_API = 'https://token-api.metaswap.codefi.network';
exports.TOKEN_METADATA_NO_SUPPORT_ERROR = 'TokenService Error: Network does not support fetchTokenMetadata';
/**
 * Get the tokens URL for a specific network.
 *
 * @param chainId - The chain ID of the network the tokens requested are on.
 * @returns The tokens URL.
 */
function getTokensURL(chainId) {
    return `${exports.TOKEN_END_POINT_API}/tokens/${chainId}`;
}
/**
 * Get the token metadata URL for the given network and token.
 *
 * @param chainId - The chain ID of the network the token is on.
 * @param tokenAddress - The token address.
 * @returns The token metadata URL.
 */
function getTokenMetadataURL(chainId, tokenAddress) {
    return `${exports.TOKEN_END_POINT_API}/token/${chainId}?address=${tokenAddress}`;
}
const tenSecondsInMilliseconds = 10000;
// Token list averages 1.6 MB in size
// timeoutFetch by default has a 500ms timeout, which will almost always timeout given the response size.
const defaultTimeout = tenSecondsInMilliseconds;
/**
 * Fetch the list of token metadata for a given network. This request is cancellable using the
 * abort signal passed in.
 *
 * @param chainId - The chain ID of the network the requested tokens are on.
 * @param abortSignal - The abort signal used to cancel the request if necessary.
 * @param options - Additional fetch options.
 * @param options.timeout - The fetch timeout.
 * @returns The token list, or `undefined` if the request was cancelled.
 */
function fetchTokenList(chainId, abortSignal, { timeout = defaultTimeout } = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokenURL = getTokensURL(chainId);
        const response = yield queryApi(tokenURL, abortSignal, timeout);
        if (response) {
            return parseJsonResponse(response);
        }
        return undefined;
    });
}
exports.fetchTokenList = fetchTokenList;
/**
 * Fetch metadata for the token address provided for a given network. This request is cancellable
 * using the abort signal passed in.
 *
 * @param chainId - The chain ID of the network the token is on.
 * @param tokenAddress - The address of the token to fetch metadata for.
 * @param abortSignal - The abort signal used to cancel the request if necessary.
 * @param options - Additional fetch options.
 * @param options.timeout - The fetch timeout.
 * @returns The token metadata, or `undefined` if the request was either aborted or failed.
 */
function fetchTokenMetadata(chainId, tokenAddress, abortSignal, { timeout = defaultTimeout } = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!(0, util_1.isTokenListSupportedForNetwork)(chainId)) {
            throw new Error(exports.TOKEN_METADATA_NO_SUPPORT_ERROR);
        }
        const tokenMetadataURL = getTokenMetadataURL(chainId, tokenAddress);
        const response = yield queryApi(tokenMetadataURL, abortSignal, timeout);
        if (response) {
            return parseJsonResponse(response);
        }
        return undefined;
    });
}
exports.fetchTokenMetadata = fetchTokenMetadata;
/**
 * Perform fetch request against the api.
 *
 * @param apiURL - The URL of the API to fetch.
 * @param abortSignal - The abort signal used to cancel the request if necessary.
 * @param timeout - The fetch timeout.
 * @returns Promise resolving request response.
 */
function queryApi(apiURL, abortSignal, timeout) {
    return __awaiter(this, void 0, void 0, function* () {
        const fetchOptions = {
            referrer: apiURL,
            referrerPolicy: 'no-referrer-when-downgrade',
            method: 'GET',
            mode: 'cors',
            signal: abortSignal,
            cache: 'default',
        };
        fetchOptions.headers = new window.Headers();
        fetchOptions.headers.set('Content-Type', 'application/json');
        try {
            return yield (0, util_1.timeoutFetch)(apiURL, fetchOptions, timeout);
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                console.log('Request is aborted');
            }
        }
        return undefined;
    });
}
/**
 * Parse an API response and return the response JSON data.
 *
 * @param apiResponse - The API response to parse.
 * @returns The response JSON data.
 * @throws Will throw if the response includes an error.
 */
function parseJsonResponse(apiResponse) {
    return __awaiter(this, void 0, void 0, function* () {
        const responseObj = yield apiResponse.json();
        // api may return errors as json without setting an error http status code
        if (responseObj === null || responseObj === void 0 ? void 0 : responseObj.error) {
            throw new Error(`TokenService Error: ${responseObj.error}`);
        }
        return responseObj;
    });
}
//# sourceMappingURL=token-service.js.map