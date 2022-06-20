import { Collectible, CollectibleMetadata } from './CollectiblesController';
/**
 * Compares collectible metadata entries to any collectible entry.
 * We need this method when comparing a new fetched collectible metadata, in case a entry changed to a defined value,
 * there's a need to update the collectible in state.
 *
 * @param newCollectibleMetadata - Collectible metadata object.
 * @param collectible - Collectible object to compare with.
 * @returns Whether there are differences.
 */
export declare function compareCollectiblesMetadata(newCollectibleMetadata: CollectibleMetadata, collectible: Collectible): boolean;
export declare type AggregatorKey = 'aave' | 'bancor' | 'cmc' | 'cryptocom' | 'coinGecko' | 'oneInch' | 'paraswap' | 'pmm' | 'zapper' | 'zerion' | 'zeroEx' | 'synthetix' | 'yearn' | 'apeswap' | 'binanceDex' | 'pancakeTop100' | 'pancakeExtended' | 'balancer' | 'quickswap' | 'matcha' | 'pangolinDex' | 'pangolinDexStableCoin' | 'pangolinDexAvaxBridge' | 'traderJoe' | 'airswapLight' | 'kleros';
/**
 * Formats aggregator names to presentable format.
 *
 * @param aggregators - List of token list names in camelcase.
 * @returns Formatted aggregator names.
 */
export declare const formatAggregatorNames: (aggregators: AggregatorKey[]) => string[];
/**
 * Format token list assets to use image proxy from Codefi.
 *
 * @param params - Object that contains chainID and tokenAddress.
 * @param params.chainId - ChainID of network.
 * @param params.tokenAddress - Address of token in lowercase.
 * @returns Formatted image url
 */
export declare const formatIconUrlWithProxy: ({ chainId, tokenAddress, }: {
    chainId: string;
    tokenAddress: string;
}) => string;
