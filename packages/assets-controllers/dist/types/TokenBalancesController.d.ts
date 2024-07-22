import type { AccountsControllerGetSelectedAccountAction } from '@metamask/accounts-controller';
import type { RestrictedControllerMessenger, ControllerGetStateAction, ControllerStateChangeEvent } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { AssetsContractControllerGetERC20BalanceOfAction } from './AssetsContractController';
import type { Token } from './TokenRatesController';
import type { TokensControllerStateChangeEvent } from './TokensController';
declare const controllerName = "TokenBalancesController";
/**
 * Token balances controller options
 * @property interval - Polling interval used to fetch new token balances.
 * @property tokens - List of tokens to track balances for.
 * @property disabled - If set to true, all tracked tokens contract balances updates are blocked.
 */
type TokenBalancesControllerOptions = {
    interval?: number;
    tokens?: Token[];
    disabled?: boolean;
    messenger: TokenBalancesControllerMessenger;
    state?: Partial<TokenBalancesControllerState>;
};
/**
 * Represents a mapping of hash token contract addresses to their balances.
 */
type ContractBalances = Record<string, string>;
/**
 * Token balances controller state
 * @property contractBalances - Hash of token contract addresses to balances
 */
export type TokenBalancesControllerState = {
    contractBalances: ContractBalances;
};
export type TokenBalancesControllerGetStateAction = ControllerGetStateAction<typeof controllerName, TokenBalancesControllerState>;
export type TokenBalancesControllerActions = TokenBalancesControllerGetStateAction;
export type AllowedActions = AccountsControllerGetSelectedAccountAction | AssetsContractControllerGetERC20BalanceOfAction;
export type TokenBalancesControllerStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, TokenBalancesControllerState>;
export type TokenBalancesControllerEvents = TokenBalancesControllerStateChangeEvent;
export type AllowedEvents = TokensControllerStateChangeEvent;
export type TokenBalancesControllerMessenger = RestrictedControllerMessenger<typeof controllerName, TokenBalancesControllerActions | AllowedActions, TokenBalancesControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
/**
 * Get the default TokenBalancesController state.
 *
 * @returns The default TokenBalancesController state.
 */
export declare function getDefaultTokenBalancesState(): TokenBalancesControllerState;
/**
 * Controller that passively polls on a set interval token balances
 * for tokens stored in the TokensController
 */
export declare class TokenBalancesController extends BaseController<typeof controllerName, TokenBalancesControllerState, TokenBalancesControllerMessenger> {
    #private;
    /**
     * Construct a Token Balances Controller.
     *
     * @param options - The controller options.
     * @param options.interval - Polling interval used to fetch new token balances.
     * @param options.tokens - List of tokens to track balances for.
     * @param options.disabled - If set to true, all tracked tokens contract balances updates are blocked.
     * @param options.state - Initial state to set on this controller.
     * @param options.messenger - The controller restricted messenger.
     */
    constructor({ interval, tokens, disabled, messenger, state, }: TokenBalancesControllerOptions);
    /**
     * Allows controller to update tracked tokens contract balances.
     */
    enable(): void;
    /**
     * Blocks controller from updating tracked tokens contract balances.
     */
    disable(): void;
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
//# sourceMappingURL=TokenBalancesController.d.ts.map