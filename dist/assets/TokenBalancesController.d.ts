/// <reference types="bn.js" />
import { BN } from 'ethereumjs-util';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { PreferencesState } from '../user/PreferencesController';
import { Token } from './TokenRatesController';
import { TokensState } from './TokensController';
import type { AssetsContractController } from './AssetsContractController';
export { BN };
/**
 * @type TokenBalancesConfig
 *
 * Token balances controller configuration
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
 * @property contractBalances - Hash of token contract addresses to balances
 */
export interface TokenBalancesState extends BaseState {
    contractBalances: {
        [address: string]: BN;
    };
}
/**
 * Controller that passively polls on a set interval token balances
 * for tokens stored in the TokensController
 */
export declare class TokenBalancesController extends BaseController<TokenBalancesConfig, TokenBalancesState> {
    private handle?;
    /**
     * Name of this controller used during composition
     */
    name: string;
    private getSelectedAddress;
    private getERC20BalanceOf;
    /**
     * Creates a TokenBalancesController instance.
     *
     * @param options - The controller options.
     * @param options.onTokensStateChange - Allows subscribing to assets controller state changes.
     * @param options.getSelectedAddress - Gets the current selected address.
     * @param options.getERC20BalanceOf - Gets the balance of the given account at the given contract address.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onTokensStateChange, getSelectedAddress, getERC20BalanceOf, }: {
        onTokensStateChange: (listener: (tokenState: TokensState) => void) => void;
        getSelectedAddress: () => PreferencesState['selectedAddress'];
        getERC20BalanceOf: AssetsContractController['getERC20BalanceOf'];
    }, config?: Partial<TokenBalancesConfig>, state?: Partial<TokenBalancesState>);
    /**
     * Starts a new polling interval.
     *
     * @param interval - Polling interval used to fetch new token balances.
     */
    poll(interval?: number): Promise<void>;
    /**
     * Updates balances for all tokens.
     */
    updateBalances(): Promise<void>;
}
export default TokenBalancesController;
