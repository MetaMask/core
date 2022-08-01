/// <reference types="node" />
import { EventEmitter } from 'events';
import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { PreferencesState } from '../user/PreferencesController';
import type { NetworkState, NetworkType } from '../network/NetworkController';
import type { Token } from './TokenRatesController';
/**
 * @type TokensConfig
 *
 * Tokens controller configuration
 * @property networkType - Network ID as per net_version
 * @property selectedAddress - Vault selected address
 */
export interface TokensConfig extends BaseConfig {
    networkType: NetworkType;
    selectedAddress: string;
    chainId: string;
    provider: any;
}
/**
 * @type AssetSuggestionResult
 * @property result - Promise resolving to a new suggested asset address
 * @property suggestedAssetMeta - Meta information about this new suggested asset
 */
interface AssetSuggestionResult {
    result: Promise<string>;
    suggestedAssetMeta: SuggestedAssetMeta;
}
declare enum SuggestedAssetStatus {
    accepted = "accepted",
    failed = "failed",
    pending = "pending",
    rejected = "rejected"
}
export declare type SuggestedAssetMetaBase = {
    id: string;
    time: number;
    type: string;
    asset: Token;
};
/**
 * @type SuggestedAssetMeta
 *
 * Suggested asset by EIP747 meta data
 * @property error - Synthesized error information for failed asset suggestions
 * @property id - Generated UUID associated with this suggested asset
 * @property status - String status of this this suggested asset
 * @property time - Timestamp associated with this this suggested asset
 * @property type - Type type this suggested asset
 * @property asset - Asset suggested object
 */
export declare type SuggestedAssetMeta = (SuggestedAssetMetaBase & {
    status: SuggestedAssetStatus.failed;
    error: Error;
}) | (SuggestedAssetMetaBase & {
    status: SuggestedAssetStatus.accepted | SuggestedAssetStatus.rejected | SuggestedAssetStatus.pending;
});
/**
 * @type TokensState
 *
 * Assets controller state
 * @property tokens - List of tokens associated with the active network and address pair
 * @property ignoredTokens - List of ignoredTokens associated with the active network and address pair
 * @property detectedTokens - List of detected tokens associated with the active network and address pair
 * @property allTokens - Object containing tokens by network and account
 * @property allIgnoredTokens - Object containing hidden/ignored tokens by network and account
 * @property allDetectedTokens - Object containing tokens detected with non-zero balances
 * @property suggestedAssets - List of pending suggested assets to be added or canceled
 */
export interface TokensState extends BaseState {
    tokens: Token[];
    ignoredTokens: string[];
    detectedTokens: Token[];
    allTokens: {
        [key: string]: {
            [key: string]: Token[];
        };
    };
    allIgnoredTokens: {
        [key: string]: {
            [key: string]: string[];
        };
    };
    allDetectedTokens: {
        [key: string]: {
            [key: string]: Token[];
        };
    };
    suggestedAssets: SuggestedAssetMeta[];
}
/**
 * Controller that stores assets and exposes convenience methods
 */
export declare class TokensController extends BaseController<TokensConfig, TokensState> {
    private mutex;
    private ethersProvider;
    private abortController;
    private failSuggestedAsset;
    /**
     * Fetch metadata for a token.
     *
     * @param tokenAddress - The address of the token.
     * @returns The token metadata.
     */
    private fetchTokenMetadata;
    /**
     * EventEmitter instance used to listen to specific EIP747 events
     */
    hub: EventEmitter;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates a TokensController instance.
     *
     * @param options - The controller options.
     * @param options.onPreferencesStateChange - Allows subscribing to preference controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network controller state changes.
     * @param options.config - Initial options used to configure this controller.
     * @param options.state - Initial state to set on this controller.
     */
    constructor({ onPreferencesStateChange, onNetworkStateChange, config, state, }: {
        onPreferencesStateChange: (listener: (preferencesState: PreferencesState) => void) => void;
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
        config?: Partial<TokensConfig>;
        state?: Partial<TokensState>;
    });
    _instantiateNewEthersProvider(): any;
    /**
     * Adds a token to the stored token list.
     *
     * @param address - Hex address of the token contract.
     * @param symbol - Symbol of the token.
     * @param decimals - Number of decimals the token uses.
     * @param image - Image of the token.
     * @returns Current token list.
     */
    addToken(address: string, symbol: string, decimals: number, image?: string): Promise<Token[]>;
    /**
     * Add a batch of tokens.
     *
     * @param tokensToImport - Array of tokens to import.
     */
    addTokens(tokensToImport: Token[]): Promise<void>;
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
     */
    addDetectedTokens(incomingDetectedTokens: Token[]): Promise<void>;
    /**
     * Adds isERC721 field to token object. This is called when a user attempts to add tokens that
     * were previously added which do not yet had isERC721 field.
     *
     * @param tokenAddress - The contract address of the token requiring the isERC721 field added.
     * @returns The new token object with the added isERC721 field.
     */
    updateTokenType(tokenAddress: string): Promise<Token>;
    /**
     * Detects whether or not a token is ERC-721 compatible.
     *
     * @param tokenAddress - The token contract address.
     * @returns A boolean indicating whether the token address passed in supports the EIP-721
     * interface.
     */
    _detectIsERC721(tokenAddress: string): Promise<any>;
    _createEthersContract(tokenAddress: string, abi: string, ethersProvider: any): Promise<any>;
    _generateRandomId(): string;
    /**
     * Adds a new suggestedAsset to state. Parameters will be validated according to
     * asset type being watched. A `<suggestedAssetMeta.id>:pending` hub event will be emitted once added.
     *
     * @param asset - The asset to be watched. For now only ERC20 tokens are accepted.
     * @param type - The asset type.
     * @returns Object containing a Promise resolving to the suggestedAsset address if accepted.
     */
    watchAsset(asset: Token, type: string): Promise<AssetSuggestionResult>;
    /**
     * Accepts to watch an asset and updates it's status and deletes the suggestedAsset from state,
     * adding the asset to corresponding asset state. In this case ERC20 tokens.
     * A `<suggestedAssetMeta.id>:finished` hub event is fired after accepted or failure.
     *
     * @param suggestedAssetID - The ID of the suggestedAsset to accept.
     */
    acceptWatchAsset(suggestedAssetID: string): Promise<void>;
    /**
     * Rejects a watchAsset request based on its ID by setting its status to "rejected"
     * and emitting a `<suggestedAssetMeta.id>:finished` hub event.
     *
     * @param suggestedAssetID - The ID of the suggestedAsset to accept.
     */
    rejectWatchAsset(suggestedAssetID: string): void;
    /**
     * Takes a new tokens and ignoredTokens array for the current network/account combination
     * and returns new allTokens and allIgnoredTokens state to update to.
     *
     * @param params - Object that holds token params.
     * @param params.newTokens - The new tokens to set for the current network and selected account.
     * @param params.newIgnoredTokens - The new ignored tokens to set for the current network and selected account.
     * @param params.newDetectedTokens - The new detected tokens to set for the current network and selected account.
     * @returns The updated `allTokens` and `allIgnoredTokens` state.
     */
    _getNewAllTokensState(params: {
        newTokens?: Token[];
        newIgnoredTokens?: string[];
        newDetectedTokens?: Token[];
    }): {
        newAllTokens: {
            [key: string]: {
                [key: string]: Token[];
            };
        };
        newAllIgnoredTokens: {
            [key: string]: {
                [key: string]: string[];
            };
        };
        newAllDetectedTokens: {
            [key: string]: {
                [key: string]: Token[];
            };
        };
    };
    /**
     * Removes all tokens from the ignored list.
     */
    clearIgnoredTokens(): void;
}
export default TokensController;
