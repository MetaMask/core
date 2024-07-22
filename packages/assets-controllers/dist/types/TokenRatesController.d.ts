import type { AccountsControllerGetAccountAction, AccountsControllerGetSelectedAccountAction, AccountsControllerSelectedEvmAccountChangeEvent } from '@metamask/accounts-controller';
import type { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedControllerMessenger } from '@metamask/base-controller';
import type { NetworkClientId, NetworkControllerGetNetworkClientByIdAction, NetworkControllerGetStateAction, NetworkControllerStateChangeEvent } from '@metamask/network-controller';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import { type Hex } from '@metamask/utils';
import type { AbstractTokenPricesService } from './token-prices-service/abstract-token-prices-service';
import type { TokensControllerGetStateAction, TokensControllerStateChangeEvent } from './TokensController';
/**
 * @type Token
 *
 * Token representation
 * @property address - Hex address of the token contract
 * @property decimals - Number of decimals the token uses
 * @property symbol - Symbol of the token
 * @property aggregators - An array containing the token's aggregators
 * @property image - Image of the token, url or bit32 image
 * @property hasBalanceError - 'true' if there is an error while updating the token balance
 * @property isERC721 - 'true' if the token is a ERC721 token
 * @property name - Name of the token
 */
export type Token = {
    address: string;
    decimals: number;
    symbol: string;
    aggregators?: string[];
    image?: string;
    hasBalanceError?: boolean;
    isERC721?: boolean;
    name?: string;
};
export type ContractExchangeRates = {
    [address: string]: number | undefined;
};
type MarketDataDetails = {
    tokenAddress: `0x${string}`;
    currency: string;
    allTimeHigh: number;
    allTimeLow: number;
    circulatingSupply: number;
    dilutedMarketCap: number;
    high1d: number;
    low1d: number;
    marketCap: number;
    marketCapPercentChange1d: number;
    price: number;
    priceChange1d: number;
    pricePercentChange1d: number;
    pricePercentChange1h: number;
    pricePercentChange1y: number;
    pricePercentChange7d: number;
    pricePercentChange14d: number;
    pricePercentChange30d: number;
    pricePercentChange200d: number;
    totalVolume: number;
};
/**
 * Represents a mapping of token contract addresses to their market data.
 */
export type ContractMarketData = Record<Hex, MarketDataDetails>;
/**
 * The external actions available to the {@link TokenRatesController}.
 */
export type AllowedActions = TokensControllerGetStateAction | NetworkControllerGetNetworkClientByIdAction | NetworkControllerGetStateAction | AccountsControllerGetAccountAction | AccountsControllerGetSelectedAccountAction;
/**
 * The external events available to the {@link TokenRatesController}.
 */
export type AllowedEvents = TokensControllerStateChangeEvent | NetworkControllerStateChangeEvent | AccountsControllerSelectedEvmAccountChangeEvent;
/**
 * The name of the {@link TokenRatesController}.
 */
export declare const controllerName = "TokenRatesController";
/**
 * @type TokenRatesState
 *
 * Token rates controller state
 * @property marketData - Market data for tokens, keyed by chain ID and then token contract address.
 */
export type TokenRatesControllerState = {
    marketData: Record<Hex, Record<Hex, MarketDataDetails>>;
};
/**
 * The action that can be performed to get the state of the {@link TokenRatesController}.
 */
export type TokenRatesControllerGetStateAction = ControllerGetStateAction<typeof controllerName, TokenRatesControllerState>;
/**
 * The actions that can be performed using the {@link TokenRatesController}.
 */
export type TokenRatesControllerActions = TokenRatesControllerGetStateAction;
/**
 * The event that {@link TokenRatesController} can emit.
 */
export type TokenRatesControllerStateChangeEvent = ControllerStateChangeEvent<typeof controllerName, TokenRatesControllerState>;
/**
 * The events that {@link TokenRatesController} can emit.
 */
export type TokenRatesControllerEvents = TokenRatesControllerStateChangeEvent;
/**
 * The messenger of the {@link TokenRatesController} for communication.
 */
export type TokenRatesControllerMessenger = RestrictedControllerMessenger<typeof controllerName, TokenRatesControllerActions | AllowedActions, TokenRatesControllerEvents | AllowedEvents, AllowedActions['type'], AllowedEvents['type']>;
/**
 * Get the default {@link TokenRatesController} state.
 *
 * @returns The default {@link TokenRatesController} state.
 */
export declare const getDefaultTokenRatesControllerState: () => TokenRatesControllerState;
/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the TokensController
 */
export declare class TokenRatesController extends StaticIntervalPollingController<typeof controllerName, TokenRatesControllerState, TokenRatesControllerMessenger> {
    #private;
    /**
     * Creates a TokenRatesController instance.
     *
     * @param options - The controller options.
     * @param options.interval - The polling interval in ms
     * @param options.disabled - Boolean to track if network requests are blocked
     * @param options.tokenPricesService - An object in charge of retrieving token price
     * @param options.messenger - The controller messenger instance for communication
     * @param options.state - Initial state to set on this controller
     */
    constructor({ interval, disabled, tokenPricesService, messenger, state, }: {
        interval?: number;
        disabled?: boolean;
        tokenPricesService: AbstractTokenPricesService;
        messenger: TokenRatesControllerMessenger;
        state?: Partial<TokenRatesControllerState>;
    });
    /**
     * Allows controller to make active and passive polling requests
     */
    enable(): void;
    /**
     * Blocks controller from making network calls
     */
    disable(): void;
    /**
     * Start (or restart) polling.
     */
    start(): Promise<void>;
    /**
     * Stop polling.
     */
    stop(): void;
    /**
     * Updates exchange rates for all tokens.
     */
    updateExchangeRates(): Promise<void>;
    /**
     * Updates exchange rates for all tokens.
     *
     * @param options - The options to fetch exchange rates.
     * @param options.chainId - The chain ID.
     * @param options.nativeCurrency - The ticker for the chain.
     */
    updateExchangeRatesByChainId({ chainId, nativeCurrency, }: {
        chainId: Hex;
        nativeCurrency: string;
    }): Promise<void>;
    /**
     * Updates token rates for the given networkClientId
     *
     * @param networkClientId - The network client ID used to get a ticker value.
     * @returns The controller state.
     */
    _executePoll(networkClientId: NetworkClientId): Promise<void>;
}
export default TokenRatesController;
//# sourceMappingURL=TokenRatesController.d.ts.map