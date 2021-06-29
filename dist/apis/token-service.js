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
exports.fetchTokenMetadata = exports.syncTokens = exports.fetchTokenList = void 0;
const util_1 = require("../util");
const END_POINT = 'https://token-api.airswap-prod.codefi.network';
function syncTokensURL(chainId) {
    return `${END_POINT}/sync/${chainId}`;
}
function getTokensURL(chainId) {
    return `${END_POINT}/tokens/${chainId}`;
}
function getTokenMetadataURL(chainId, tokenAddress) {
    return `${END_POINT}/tokens/${chainId}?address=${tokenAddress}`;
}
/**
 * Fetches the list of token metadata for a given network chainId
 *
 * @returns - Promise resolving token  List
 */
function fetchTokenList(chainId) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokenURL = getTokensURL(chainId);
        const fetchOptions = {
            referrer: tokenURL,
            referrerPolicy: 'no-referrer-when-downgrade',
            method: 'GET',
            mode: 'cors',
        };
        fetchOptions.headers = new window.Headers();
        fetchOptions.headers.set('Content-Type', 'application/json');
        const tokenResponse = yield util_1.timeoutFetch(tokenURL, fetchOptions);
        return yield tokenResponse.json();
    });
}
exports.fetchTokenList = fetchTokenList;
/**
 * Forces a sync of token metadata for a given network chainId.
 * Syncing happens every 1 hour in the background, this api can
 * be used to force a sync from our side
 */
function syncTokens(chainId) {
    return __awaiter(this, void 0, void 0, function* () {
        const syncURL = syncTokensURL(chainId);
        const fetchOptions = {
            referrer: syncURL,
            referrerPolicy: 'no-referrer-when-downgrade',
            method: 'GET',
            mode: 'cors',
        };
        fetchOptions.headers = new window.Headers();
        fetchOptions.headers.set('Content-Type', 'application/json');
        yield util_1.timeoutFetch(syncURL, fetchOptions);
    });
}
exports.syncTokens = syncTokens;
/**
 * Fetch metadata for the token address provided for a given network chainId
 *
 * @return Promise resolving token metadata for the tokenAddress provided
 */
function fetchTokenMetadata(chainId, tokenAddress) {
    return __awaiter(this, void 0, void 0, function* () {
        const tokenMetadataURL = getTokenMetadataURL(chainId, tokenAddress);
        const fetchOptions = {
            referrer: tokenMetadataURL,
            referrerPolicy: 'no-referrer-when-downgrade',
            method: 'GET',
            mode: 'cors',
        };
        fetchOptions.headers = new window.Headers();
        fetchOptions.headers.set('Content-Type', 'application/json');
        const tokenResponse = yield util_1.timeoutFetch(tokenMetadataURL, fetchOptions);
        return yield tokenResponse.json();
    });
}
exports.fetchTokenMetadata = fetchTokenMetadata;
//# sourceMappingURL=token-service.js.map