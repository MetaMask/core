import { Nft, NftMetadata } from './NftController';
/**
 * Compares NFT metadata entries to any NFT entry.
 * We need this method when comparing a new fetched NFT metadata, in case a entry changed to a defined value,
 * there's a need to update the NFT in state.
 *
 * @param newNftMetadata - NFT metadata object.
 * @param nft - NFT object to compare with.
 * @returns Whether there are differences.
 */
export declare function compareNftMetadata(newNftMetadata: NftMetadata, nft: Nft): boolean;
/**
 * Formats aggregator names to presentable format.
 *
 * @param aggregators - List of token list names in camelcase.
 * @returns Formatted aggregator names.
 */
export declare const formatAggregatorNames: (aggregators: string[]) => string[];
/**
 * Format token list assets to use image proxy from Codefi.
 *
 * @param params - Object that contains chainID and tokenAddress.
 * @param params.chainId - ChainID of network in decimal or hexadecimal format.
 * @param params.tokenAddress - Address of token in mixed or lowercase.
 * @returns Formatted image url
 */
export declare const formatIconUrlWithProxy: ({ chainId, tokenAddress, }: {
    chainId: string;
    tokenAddress: string;
}) => string;
