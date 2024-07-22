import type { Hex } from '@metamask/utils';
export declare const TOKEN_END_POINT_API = "https://token.api.cx.metamask.io";
export declare const TOKEN_METADATA_NO_SUPPORT_ERROR = "TokenService Error: Network does not support fetchTokenMetadata";
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
export declare function fetchTokenListByChainId(chainId: Hex, abortSignal: AbortSignal, { timeout }?: {
    timeout?: number | undefined;
}): Promise<unknown>;
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
export declare function fetchTokenMetadata<T>(chainId: Hex, tokenAddress: string, abortSignal: AbortSignal, { timeout }?: {
    timeout?: number | undefined;
}): Promise<T | undefined>;
//# sourceMappingURL=token-service.d.ts.map