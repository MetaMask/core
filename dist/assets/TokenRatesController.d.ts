import { BaseController, BaseConfig, BaseState } from '../BaseController';
import type { NetworkState } from '../network/NetworkController';
import type { TokensState } from './TokensController';
import type { CurrencyRateState } from './CurrencyRateController';
/**
 * @type CoinGeckoResponse
 *
 * CoinGecko API response representation
 */
export interface CoinGeckoResponse {
    [address: string]: {
        [currency: string]: number;
    };
}
/**
 * @type CoinGeckoPlatform
 *
 * CoinGecko supported platform API representation
 */
export interface CoinGeckoPlatform {
    id: string;
    chain_identifier: null | number;
    name: string;
    shortname: string;
}
/**
 * @type Token
 *
 * Token representation
 * @property address - Hex address of the token contract
 * @property decimals - Number of decimals the token uses
 * @property symbol - Symbol of the token
 * @property image - Image of the token, url or bit32 image
 */
export interface Token {
    address: string;
    decimals: number;
    symbol: string;
    aggregators?: string[];
    image?: string;
    balanceError?: unknown;
    isERC721?: boolean;
}
/**
 * @type TokenRatesConfig
 *
 * Token rates controller configuration
 * @property interval - Polling interval used to fetch new token rates
 * @property nativeCurrency - Current native currency selected to use base of rates
 * @property chainId - Current network chainId
 * @property tokens - List of tokens to track exchange rates for
 * @property threshold - Threshold to invalidate the supportedChains
 */
export interface TokenRatesConfig extends BaseConfig {
    interval: number;
    nativeCurrency: string;
    chainId: string;
    tokens: Token[];
    threshold: number;
}
interface ContractExchangeRates {
    [address: string]: number | undefined;
}
/**
 * @type TokenRatesState
 *
 * Token rates controller state
 * @property contractExchangeRates - Hash of token contract addresses to exchange rates
 * @property supportedChains - Cached chain data
 */
export interface TokenRatesState extends BaseState {
    contractExchangeRates: ContractExchangeRates;
}
/**
 * Controller that passively polls on a set interval for token-to-fiat exchange rates
 * for tokens stored in the TokensController
 */
export declare class TokenRatesController extends BaseController<TokenRatesConfig, TokenRatesState> {
    private handle?;
    private tokenList;
    private supportedChains;
    private supportedVsCurrencies;
    /**
     * Name of this controller used during composition
     */
    name: string;
    /**
     * Creates a TokenRatesController instance.
     *
     * @param options - The controller options.
     * @param options.onTokensStateChange - Allows subscribing to token controller state changes.
     * @param options.onCurrencyRateStateChange - Allows subscribing to currency rate controller state changes.
     * @param options.onNetworkStateChange - Allows subscribing to network state changes.
     * @param config - Initial options used to configure this controller.
     * @param state - Initial state to set on this controller.
     */
    constructor({ onTokensStateChange, onCurrencyRateStateChange, onNetworkStateChange, }: {
        onTokensStateChange: (listener: (tokensState: TokensState) => void) => void;
        onCurrencyRateStateChange: (listener: (currencyRateState: CurrencyRateState) => void) => void;
        onNetworkStateChange: (listener: (networkState: NetworkState) => void) => void;
    }, config?: Partial<TokenRatesConfig>, state?: Partial<TokenRatesState>);
    /**
     * Sets a new polling interval.
     *
     * @param interval - Polling interval used to fetch new token rates.
     */
    poll(interval?: number): Promise<void>;
    /**
     * Sets a new chainId.
     *
     * TODO: Replace this with a method.
     *
     * @param _chainId - The current chain ID.
     */
    set chainId(_chainId: string);
    get chainId(): string;
    /**
     * Sets a new token list to track prices.
     *
     * TODO: Replace this with a method.
     *
     * @param tokens - List of tokens to track exchange rates for.
     */
    set tokens(tokens: Token[]);
    get tokens(): Token[];
    /**
     * Fetches a pairs of token address and native currency.
     *
     * @param chainSlug - Chain string identifier.
     * @param vsCurrency - Query according to tokens in tokenList and native currency.
     * @returns The exchange rates for the given pairs.
     */
    fetchExchangeRate(chainSlug: string, vsCurrency: string): Promise<CoinGeckoResponse>;
    /**
     * Checks if the current native currency is a supported vs currency to use
     * to query for token exchange rates.
     *
     * @param nativeCurrency - The native currency of the currently active network.
     * @returns A boolean indicating whether it's a supported vsCurrency.
     */
    private checkIsSupportedVsCurrency;
    /**
     * Gets current chain ID slug from cached supported platforms CoinGecko API response.
     * If cached supported platforms response is stale, fetches and updates it.
     *
     * @returns The CoinGecko slug for the current chain ID.
     */
    getChainSlug(): Promise<string | null>;
    /**
     * Updates exchange rates for all tokens.
     */
    updateExchangeRates(): Promise<void>;
    /**
     * Checks if the active network's native currency is supported by the coingecko API.
     * If supported, it fetches and maps contractExchange rates to a format to be consumed by the UI.
     * If not supported, it fetches contractExchange rates and maps them from token/fallback-currency
     * to token/nativeCurrency.
     *
     * @param nativeCurrency - The native currency of the currently active network.
     * @param slug - The unique slug used to id the chain by the coingecko api
     * should be used to query token exchange rates.
     * @returns An object with conversion rates for each token
     * related to the network's native currency.
     */
    fetchAndMapExchangeRates(nativeCurrency: string, slug: string): Promise<ContractExchangeRates>;
}
export default TokenRatesController;
