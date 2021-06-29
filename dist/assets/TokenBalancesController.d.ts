import { BN } from 'ethereumjs-util';
import BaseController, { BaseConfig, BaseState } from '../BaseController';
import type { PreferencesState } from '../user/PreferencesController';
import { Token } from './TokenRatesController';
import type { AssetsState } from './AssetsController';
import type { AssetsContractController } from './AssetsContractController';
export { BN };
/**
 * @type TokenBalancesConfig
 *
 * Token balances controller configuration
 *
 * @property interval - Polling interval used to fetch new token balances
 * @property tokens - List of tokens to track balances for
 */
export interface TokenBalancesConfig extends BaseConfig {
    interval: number;
    tokens: Token[];
}
/**
 * @type TokenBalancesState
 *
 * Token balances controller state
 *
 * @property contractBalances - Hash of token contract addresses to balances
 */
export interface TokenBalancesState extends BaseState {
    contractBalances: {
        [address: string]: BN;
    };
}
/**
 * Controller that passively polls on a set interval token balances
 * for tokens stored in the AssetsController
 */
export declare class TokenBalancesController extends BaseController<TokenBalancesConfig, TokenBalancesState> {
    private handle?;
    /**
     * Name of this controller used during composition
     */
    name: string;
    private getSelectedAddress;
    private getBalanceOf;
    /**
     * Creates a TokenBalancesController instance
     *
     * @param options
     * @param options.onAssetsStateChange - Allows subscribing to assets controller state changes
     * @param options.getSelectedAddress - Gets the current selected address
     * @param options.getBalanceOf - Gets the balance of the given account at the given contract address
     * @param config - Initial options used to configure this controller
     * @param state - Initial state to set on this controller
     */
    constructor({ onAssetsStateChange, getSelectedAddress, getBalanceOf, }: {
        onAssetsStateChange: (listener: (tokenState: AssetsState) => void) => void;
        getSelectedAddress: () => PreferencesState['selectedAddress'];
        getBalanceOf: AssetsContractController['getBalanceOf'];
    }, config?: Partial<TokenBalancesConfig>, state?: Partial<TokenBalancesState>);
    /**
     * Starts a new polling interval
     *
     * @param interval - Polling interval used to fetch new token balances
     */
    poll(interval?: number): Promise<void>;
    /**
     * Updates balances for all tokens
     *
     * @returns Promise resolving when this operation completes
     */
    updateBalances(): Promise<void>;
}
export default TokenBalancesController;
