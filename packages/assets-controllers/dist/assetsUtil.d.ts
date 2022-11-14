/// <reference types="bn.js" />
import { BigNumber } from '@ethersproject/bignumber';
import { BN } from 'ethereumjs-util';
import { Nft, NftMetadata } from './NftController';
import { Token } from './TokenRatesController';
/**
 * Compares nft metadata entries to any nft entry.
 * We need this method when comparing a new fetched nft metadata, in case a entry changed to a defined value,
 * there's a need to update the nft in state.
 *
 * @param newNftMetadata - Nft metadata object.
 * @param nft - Nft object to compare with.
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
/**
 * Validates a ERC20 token to be added with EIP747.
 *
 * @param token - Token object to validate.
 */
export declare function validateTokenToWatch(token: Token): void;
/**
 * Networks where token detection is supported - Values are in decimal format
 */
export declare enum SupportedTokenDetectionNetworks {
    mainnet = "1",
    bsc = "56",
    polygon = "137",
    avax = "43114"
}
/**
 * Check if token detection is enabled for certain networks.
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports token detection
 */
export declare function isTokenDetectionSupportedForNetwork(chainId: string): boolean;
/**
 * Check if token list polling is enabled for a given network.
 * Currently this method is used to support e2e testing for consumers of this package.
 *
 * @param chainId - ChainID of network
 * @returns Whether the current network supports tokenlists
 */
export declare function isTokenListSupportedForNetwork(chainId: string): boolean;
/**
 * Removes IPFS protocol prefix from input string.
 *
 * @param ipfsUrl - An IPFS url (e.g. ipfs://{content id})
 * @returns IPFS content identifier and (possibly) path in a string
 * @throws Will throw if the url passed is not IPFS.
 */
export declare function removeIpfsProtocolPrefix(ipfsUrl: string): string;
/**
 * Extracts content identifier and path from an input string.
 *
 * @param ipfsUrl - An IPFS URL minus the IPFS protocol prefix
 * @returns IFPS content identifier (cid) and sub path as string.
 * @throws Will throw if the url passed is not ipfs.
 */
export declare function getIpfsCIDv1AndPath(ipfsUrl: string): {
    cid: string;
    path?: string;
};
/**
 * Formats URL correctly for use retrieving assets hosted on IPFS.
 *
 * @param ipfsGateway - The users preferred IPFS gateway (full URL or just host).
 * @param ipfsUrl - The IFPS URL pointed at the asset.
 * @param subdomainSupported - Boolean indicating whether the URL should be formatted with subdomains or not.
 * @returns A formatted URL, with the user's preferred IPFS gateway and format (subdomain or not), pointing to an asset hosted on IPFS.
 */
export declare function getFormattedIpfsUrl(ipfsGateway: string, ipfsUrl: string, subdomainSupported: boolean): string;
/**
 * Adds URL protocol prefix to input URL string if missing.
 *
 * @param urlString - An IPFS URL.
 * @returns A URL with a https:// prepended.
 */
export declare function addUrlProtocolPrefix(urlString: string): string;
/**
 * Converts an Ethers BigNumber to a BN.
 *
 * @param bigNumber - An Ethers BigNumber instance.
 * @returns A BN object.
 */
export declare function ethersBigNumberToBN(bigNumber: BigNumber): BN;
