import type { AccountsControllerGetAccountAction, AccountsControllerGetSelectedAccountAction, AccountsControllerSelectedEvmAccountChangeEvent } from '@metamask/accounts-controller';
import type { AddApprovalRequest } from '@metamask/approval-controller';
import type { RestrictedControllerMessenger, ControllerGetStateAction, ControllerStateChangeEvent } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { NetworkClientId, NetworkControllerGetNetworkClientByIdAction, NetworkControllerNetworkDidChangeEvent, Provider } from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';
import type { TokenListStateChange } from './TokenListController';
import type { Token } from './TokenRatesController';
/**
 * @type TokensControllerState
 *
 * Assets controller state
 * @property tokens - List of tokens associated with the active network and address pair
 * @property ignoredTokens - List of ignoredTokens associated with the active network and address pair
 * @property detectedTokens - List of detected tokens associated with the active network and address pair
 * @property allTokens - Object containing tokens by network and account
 * @property allIgnoredTokens - Object containing hidden/ignored tokens by network and account
 * @property allDetectedTokens - Object containing tokens detected with non-zero balances
 */
export type TokensControllerState = {
    tokens: Token[];
    ignoredTokens: string[];
    detectedTokens: Token[];
    allTokens: {
        [chainId: Hex]: {
            [key: string]: Token[];
        };
    };
    allIgnoredTokens: {
        [chainId: Hex]: {
            [key: string]: string[];
        };
    };
    allDetectedTokens: {
        [chainId: Hex]: {
            [key: string]: Token[];
        };
    };
};
declare const controllerName = "TokensController";
export type TokensControllerActions = TokensControllerGetStateAction | TokensControllerAddDetectedTokensAction;
export type TokensControllerGetStateAction = ControllerGetStateAction<typeof controllerName, TokensControllerState>;
export type TokensControllerAddDetectedTokensAction = {
    type: `${typeof controllerName}:addDetectedTokens`;
    handler: TokensController['addDetectedTokens'];
};
/**
 * The external actions available to the {@link TokensController}.
 */
export type AllowedActions = AddApprovalRequest | NetworkControllerGetNetworkClientByIdAction | AccountsControllerGetAccountAction | AccountsControllerGetSelectedAccountAction;
export type TokensControllerStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, TokensControllerState>;
export type TokensControllerEvents = TokensControllerStateChangeEvent;
export type AllowedEvents = NetworkControllerNetworkDidChangeEvent | TokenListStateChange | AccountsControllerSelectedEvmAccountChangeEvent;
/**
 * The messenger of the {@link TokensController}.
 */
export type TokensControllerMessenger = RestrictedControllerMessenger<typeof controllerName, TokensControllerActions | AllowedActions, TokensControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
export declare const getDefaultTokensState: () => TokensControllerState;
/**
 * Controller that stores assets and exposes convenience methods
 */
export declare class TokensController extends BaseController<typeof controllerName, TokensControllerState, TokensControllerMessenger> {
    #private;
    /**
     * Tokens controller options
     * @param options - Constructor options.
     * @param options.chainId - The chain ID of the current network.
     * @param options.provider - Network provider.
     * @param options.state - Initial state to set on this controller.
     * @param options.messenger - The controller messenger.
     */
    constructor({ chainId: initialChainId, provider, state, messenger, }: {
        chainId: Hex;
        provider: Provider | undefined;
        state?: Partial<TokensControllerState>;
        messenger: TokensControllerMessenger;
    });
    /**
     * Adds a token to the stored token list.
     *
     * @param options - The method argument object.
     * @param options.address - Hex address of the token contract.
     * @param options.symbol - Symbol of the token.
     * @param options.decimals - Number of decimals the token uses.
     * @param options.name - Name of the token.
     * @param options.image - Image of the token.
     * @param options.interactingAddress - The address of the account to add a token to.
     * @param options.networkClientId - Network Client ID.
     * @returns Current token list.
     */
    addToken({ address, symbol, decimals, name, image, interactingAddress, networkClientId, }: {
        address: string;
        symbol: string;
        decimals: number;
        name?: string;
        image?: string;
        interactingAddress?: string;
        networkClientId?: NetworkClientId;
    }): Promise<Token[]>;
    /**
     * Add a batch of tokens.
     *
     * @param tokensToImport - Array of tokens to import.
     * @param networkClientId - Optional network client ID used to determine interacting chain ID.
     */
    addTokens(tokensToImport: Token[], networkClientId?: NetworkClientId): Promise<void>;
    /**
     * Ignore a batch of tokens.
     *
     * @param tokenAddressesToIgnore - Array of token addresses to ignore.
     */
    ignoreTokens(tokenAddressesToIgnore: string[]): void;
    /**
     * Adds a batch of detected tokens to the stored token list.
     *
     * @param incomingDetectedTokens - Array of detected tokens to be added or updated.
     * @param detectionDetails - An object containing the chain ID and address of the currently selected network on which the incomingDetectedTokens were detected.
     * @param detectionDetails.selectedAddress - the account address on which the incomingDetectedTokens were detected.
     * @param detectionDetails.chainId - the chainId on which the incomingDetectedTokens were detected.
     */
    addDetectedTokens(incomingDetectedTokens: Token[], detectionDetails?: {
        selectedAddress: string;
        chainId: Hex;
    }): Promise<void>;
    /**
     * Adds isERC721 field to token object. This is called when a user attempts to add tokens that
     * were previously added which do not yet had isERC721 field.
     *
     * @param tokenAddress - The contract address of the token requiring the isERC721 field added.
     * @returns The new token object with the added isERC721 field.
     */
    updateTokenType(tokenAddress: string): Promise<{
        isERC721: any;
        address: string;
        decimals: number;
        symbol: string;
        aggregators?: string[] | undefined;
        image?: string | undefined;
        hasBalanceError?: boolean | undefined;
        name?: string | undefined;
    }>;
    /**
     * Adds a new suggestedAsset to the list of watched assets.
     * Parameters will be validated according to the asset type being watched.
     *
     * @param options - The method options.
     * @param options.asset - The asset to be watched. For now only ERC20 tokens are accepted.
     * @param options.type - The asset type.
     * @param options.interactingAddress - The address of the account that is requesting to watch the asset.
     * @param options.networkClientId - Network Client ID.
     * @returns A promise that resolves if the asset was watched successfully, and rejects otherwise.
     */
    watchAsset({ asset, type, interactingAddress, networkClientId, }: {
        asset: Token;
        type: string;
        interactingAddress?: string;
        networkClientId?: NetworkClientId;
    }): Promise<void>;
    /**
     * Removes all tokens from the ignored list.
     */
    clearIgnoredTokens(): void;
}
export default TokensController;
//# sourceMappingURL=TokensController.d.ts.map