import type { Hex } from '@metamask/utils';
import type { AbstractTokenPricesService, TokenPricesByTokenAddress } from './abstract-token-prices-service';
/**
 * The list of currencies that can be supplied as the `vsCurrency` parameter to
 * the `/spot-prices` endpoint, in lowercase form.
 */
export declare const SUPPORTED_CURRENCIES: readonly ["btc", "eth", "ltc", "bch", "bnb", "eos", "xrp", "xlm", "link", "dot", "yfi", "usd", "aed", "ars", "aud", "bdt", "bhd", "bmd", "brl", "cad", "chf", "clp", "cny", "czk", "dkk", "eur", "gbp", "hkd", "huf", "idr", "ils", "inr", "jpy", "krw", "kwd", "lkr", "mmk", "mxn", "myr", "ngn", "nok", "nzd", "php", "pkr", "pln", "rub", "sar", "sek", "sgd", "thb", "try", "twd", "uah", "vef", "vnd", "zar", "xdr", "xag", "xau", "bits", "sats"];
/**
 * Represents the zero address, commonly used as a placeholder in blockchain transactions.
 * In the context of fetching market data, the zero address is utilized to retrieve information
 * specifically for native currencies. This allows for a standardized approach to query market
 * data for blockchain-native assets without a specific contract address.
 */
export declare const ZERO_ADDRESS: Hex;
/**
 * A currency that can be supplied as the `vsCurrency` parameter to
 * the `/spot-prices` endpoint. Covers both uppercase and lowercase versions.
 */
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number] | Uppercase<(typeof SUPPORTED_CURRENCIES)[number]>;
/**
 * The list of chain IDs that can be supplied in the URL for the `/spot-prices`
 * endpoint, but in hexadecimal form (for consistency with how we represent
 * chain IDs in other places).
 * @see Used by {@link CodefiTokenPricesServiceV2} to validate that a given chain ID is supported by V2 of the Codefi Price API.
 */
export declare const SUPPORTED_CHAIN_IDS: readonly ["0x1", "0xa", "0x19", "0x38", "0x39", "0x42", "0x46", "0x52", "0x58", "0x64", "0x6a", "0x7a", "0x80", "0x89", "0xfa", "0x120", "0x141", "0x144", "0x169", "0x440", "0x504", "0x505", "0x1388", "0x2105", "0x150", "0x2710", "0xa4b1", "0xa4ec", "0xa516", "0xa86a", "0x518af", "0x4e454152", "0x63564c40", "0xe708"];
/**
 * A chain ID that can be supplied in the URL for the `/spot-prices` endpoint,
 * but in hexadecimal form (for consistency with how we represent chain IDs in
 * other places).
 */
type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];
/**
 * This version of the token prices service uses V2 of the Codefi Price API to
 * fetch token prices.
 */
export declare class CodefiTokenPricesServiceV2 implements AbstractTokenPricesService<SupportedChainId, Hex, SupportedCurrency> {
    #private;
    /**
     * Construct a Codefi Token Price Service.
     *
     * @param options - Constructor options
     * @param options.degradedThreshold - The threshold between "normal" and "degrated" service,
     * in milliseconds.
     * @param options.retries - Number of retry attempts for each token price update.
     * @param options.maximumConsecutiveFailures - The maximum number of consecutive failures
     * allowed before breaking the circuit and pausing further updates.
     * @param options.onBreak - An event handler for when the circuit breaks, useful for capturing
     * metrics about network failures.
     * @param options.onDegraded - An event handler for when the circuit remains closed, but requests
     * are failing or resolving too slowly (i.e. resolving more slowly than the `degradedThreshold).
     * @param options.circuitBreakDuration - The amount of time to wait when the circuit breaks
     * from too many consecutive failures.
     */
    constructor({ degradedThreshold, retries, maximumConsecutiveFailures, onBreak, onDegraded, circuitBreakDuration, }?: {
        degradedThreshold?: number;
        retries?: number;
        maximumConsecutiveFailures?: number;
        onBreak?: () => void;
        onDegraded?: () => void;
        circuitBreakDuration?: number;
    });
    /**
     * Retrieves prices in the given currency for the tokens identified by the
     * given addresses which are expected to live on the given chain.
     *
     * @param args - The arguments to function.
     * @param args.chainId - An EIP-155 chain ID.
     * @param args.tokenAddresses - Addresses for tokens that live on the chain.
     * @param args.currency - The desired currency of the token prices.
     * @returns The prices for the requested tokens.
     */
    fetchTokenPrices({ chainId, tokenAddresses, currency, }: {
        chainId: SupportedChainId;
        tokenAddresses: Hex[];
        currency: SupportedCurrency;
    }): Promise<Partial<TokenPricesByTokenAddress<Hex, SupportedCurrency>>>;
    /**
     * Type guard for whether the API can return token prices for the given chain
     * ID.
     *
     * @param chainId - The chain ID to check.
     * @returns True if the API supports the chain ID, false otherwise.
     */
    validateChainIdSupported(chainId: unknown): chainId is SupportedChainId;
    /**
     * Type guard for whether the API can return token prices in the given
     * currency.
     *
     * @param currency - The currency to check. If a string, can be either
     * lowercase or uppercase.
     * @returns True if the API supports the currency, false otherwise.
     */
    validateCurrencySupported(currency: unknown): currency is SupportedCurrency;
}
export {};
//# sourceMappingURL=codefi-v2.d.ts.map