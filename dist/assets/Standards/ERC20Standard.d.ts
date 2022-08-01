/// <reference types="bn.js" />
import { BN } from 'ethereumjs-util';
import { Web3 } from './standards-types';
export declare class ERC20Standard {
    private web3;
    constructor(web3: Web3);
    /**
     * Get balance or count for current account on specific asset contract.
     *
     * @param address - Asset ERC20 contract address.
     * @param selectedAddress - Current account public address.
     * @returns Promise resolving to BN object containing balance for current account on specific asset contract.
     */
    getBalanceOf(address: string, selectedAddress: string): Promise<BN>;
    /**
     * Query for the decimals for a given ERC20 asset.
     *
     * @param address - ERC20 asset contract string.
     * @returns Promise resolving to the 'decimals'.
     */
    getTokenDecimals(address: string): Promise<string>;
    /**
     * Query for symbol for a given ERC20 asset.
     *
     * @param address - ERC20 asset contract address.
     * @returns Promise resolving to the 'symbol'.
     */
    getTokenSymbol(address: string): Promise<string>;
    /**
     * Query if a contract implements an interface.
     *
     * @param address - Asset contract address.
     * @param userAddress - The public address for the currently active user's account.
     * @returns Promise resolving an object containing the standard, decimals, symbol and balance of the given contract/userAddress pair.
     */
    getDetails(address: string, userAddress?: string): Promise<{
        standard: string;
        symbol: string | undefined;
        decimals: string | undefined;
        balance: BN | undefined;
    }>;
}
