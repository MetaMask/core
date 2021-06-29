/**
 * Fetches the list of token metadata for a given network chainId
 *
 * @returns - Promise resolving token  List
 */
export declare function fetchTokenList(chainId: string): Promise<Response>;
/**
 * Forces a sync of token metadata for a given network chainId.
 * Syncing happens every 1 hour in the background, this api can
 * be used to force a sync from our side
 */
export declare function syncTokens(chainId: string): Promise<void>;
/**
 * Fetch metadata for the token address provided for a given network chainId
 *
 * @return Promise resolving token metadata for the tokenAddress provided
 */
export declare function fetchTokenMetadata(chainId: string, tokenAddress: string): Promise<Response>;
