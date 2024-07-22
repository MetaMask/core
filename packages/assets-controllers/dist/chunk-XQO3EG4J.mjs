import {
  __privateAdd,
  __privateGet,
  __privateSet
} from "./chunk-XUI43LEZ.mjs";

// src/token-prices-service/codefi-v2.ts
import { handleFetch } from "@metamask/controller-utils";
import { hexToNumber } from "@metamask/utils";
import {
  circuitBreaker,
  ConsecutiveBreaker,
  ExponentialBackoff,
  handleAll,
  retry,
  wrap,
  CircuitState
} from "cockatiel";
var SUPPORTED_CURRENCIES = [
  // Bitcoin
  "btc",
  // Ether
  "eth",
  // Litecoin
  "ltc",
  // Bitcoin Cash
  "bch",
  // Binance Coin
  "bnb",
  // EOS
  "eos",
  // XRP
  "xrp",
  // Lumens
  "xlm",
  // Chainlink
  "link",
  // Polkadot
  "dot",
  // Yearn.finance
  "yfi",
  // US Dollar
  "usd",
  // United Arab Emirates Dirham
  "aed",
  // Argentine Peso
  "ars",
  // Australian Dollar
  "aud",
  // Bangladeshi Taka
  "bdt",
  // Bahraini Dinar
  "bhd",
  // Bermudian Dollar
  "bmd",
  // Brazil Real
  "brl",
  // Canadian Dollar
  "cad",
  // Swiss Franc
  "chf",
  // Chilean Peso
  "clp",
  // Chinese Yuan
  "cny",
  // Czech Koruna
  "czk",
  // Danish Krone
  "dkk",
  // Euro
  "eur",
  // British Pound Sterling
  "gbp",
  // Hong Kong Dollar
  "hkd",
  // Hungarian Forint
  "huf",
  // Indonesian Rupiah
  "idr",
  // Israeli New Shekel
  "ils",
  // Indian Rupee
  "inr",
  // Japanese Yen
  "jpy",
  // South Korean Won
  "krw",
  // Kuwaiti Dinar
  "kwd",
  // Sri Lankan Rupee
  "lkr",
  // Burmese Kyat
  "mmk",
  // Mexican Peso
  "mxn",
  // Malaysian Ringgit
  "myr",
  // Nigerian Naira
  "ngn",
  // Norwegian Krone
  "nok",
  // New Zealand Dollar
  "nzd",
  // Philippine Peso
  "php",
  // Pakistani Rupee
  "pkr",
  // Polish Zloty
  "pln",
  // Russian Ruble
  "rub",
  // Saudi Riyal
  "sar",
  // Swedish Krona
  "sek",
  // Singapore Dollar
  "sgd",
  // Thai Baht
  "thb",
  // Turkish Lira
  "try",
  // New Taiwan Dollar
  "twd",
  // Ukrainian hryvnia
  "uah",
  // Venezuelan bolívar fuerte
  "vef",
  // Vietnamese đồng
  "vnd",
  // South African Rand
  "zar",
  // IMF Special Drawing Rights
  "xdr",
  // Silver - Troy Ounce
  "xag",
  // Gold - Troy Ounce
  "xau",
  // Bits
  "bits",
  // Satoshi
  "sats"
];
var ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
var SUPPORTED_CHAIN_IDS = [
  // Ethereum Mainnet
  "0x1",
  // OP Mainnet
  "0xa",
  // Cronos Mainnet
  "0x19",
  // BNB Smart Chain Mainnet
  "0x38",
  // Syscoin Mainnet
  "0x39",
  // OKXChain Mainnet
  "0x42",
  // Hoo Smart Chain
  "0x46",
  // Meter Mainnet
  "0x52",
  // TomoChain
  "0x58",
  // Gnosis
  "0x64",
  // Velas EVM Mainnet
  "0x6a",
  // Fuse Mainnet
  "0x7a",
  // Huobi ECO Chain Mainnet
  "0x80",
  // Polygon Mainnet
  "0x89",
  // Fantom Opera
  "0xfa",
  // Boba Network
  "0x120",
  // KCC Mainnet
  "0x141",
  // zkSync Era Mainnet
  "0x144",
  // Theta Mainnet
  "0x169",
  // Metis Andromeda Mainnet
  "0x440",
  // Moonbeam
  "0x504",
  // Moonriver
  "0x505",
  // Mantle
  "0x1388",
  // Base
  "0x2105",
  // Shiden
  "0x150",
  // Smart Bitcoin Cash
  "0x2710",
  // Arbitrum One
  "0xa4b1",
  // Celo Mainnet
  "0xa4ec",
  // Oasis Emerald
  "0xa516",
  // Avalanche C-Chain
  "0xa86a",
  // Polis Mainnet
  "0x518af",
  // Aurora Mainnet
  "0x4e454152",
  // Harmony Mainnet Shard 0
  "0x63564c40",
  // Linea Mainnet
  "0xe708"
];
var BASE_URL = "https://price.api.cx.metamask.io/v2";
var DEFAULT_TOKEN_PRICE_RETRIES = 3;
var DEFAULT_TOKEN_PRICE_MAX_CONSECUTIVE_FAILURES = (1 + DEFAULT_TOKEN_PRICE_RETRIES) * 3;
var DEFAULT_DEGRADED_THRESHOLD = 5e3;
var _tokenPricePolicy;
var CodefiTokenPricesServiceV2 = class {
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
  constructor({
    degradedThreshold = DEFAULT_DEGRADED_THRESHOLD,
    retries = DEFAULT_TOKEN_PRICE_RETRIES,
    maximumConsecutiveFailures = DEFAULT_TOKEN_PRICE_MAX_CONSECUTIVE_FAILURES,
    onBreak,
    onDegraded,
    circuitBreakDuration = 30 * 60 * 1e3
  } = {}) {
    __privateAdd(this, _tokenPricePolicy, void 0);
    const retryPolicy = retry(handleAll, {
      maxAttempts: retries,
      backoff: new ExponentialBackoff()
    });
    const circuitBreakerPolicy = circuitBreaker(handleAll, {
      halfOpenAfter: circuitBreakDuration,
      breaker: new ConsecutiveBreaker(maximumConsecutiveFailures)
    });
    if (onBreak) {
      circuitBreakerPolicy.onBreak(onBreak);
    }
    if (onDegraded) {
      retryPolicy.onGiveUp(() => {
        if (circuitBreakerPolicy.state === CircuitState.Closed) {
          onDegraded();
        }
      });
      retryPolicy.onSuccess(({ duration }) => {
        if (circuitBreakerPolicy.state === CircuitState.Closed && duration > degradedThreshold) {
          onDegraded();
        }
      });
    }
    __privateSet(this, _tokenPricePolicy, wrap(retryPolicy, circuitBreakerPolicy));
  }
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
  async fetchTokenPrices({
    chainId,
    tokenAddresses,
    currency
  }) {
    const chainIdAsNumber = hexToNumber(chainId);
    const url = new URL(`${BASE_URL}/chains/${chainIdAsNumber}/spot-prices`);
    url.searchParams.append(
      "tokenAddresses",
      [ZERO_ADDRESS, ...tokenAddresses].join(",")
    );
    url.searchParams.append("vsCurrency", currency);
    url.searchParams.append("includeMarketData", "true");
    const addressCryptoDataMap = await __privateGet(this, _tokenPricePolicy).execute(
      () => handleFetch(url, { headers: { "Cache-Control": "no-cache" } })
    );
    return [ZERO_ADDRESS, ...tokenAddresses].reduce(
      (obj, tokenAddress) => {
        const lowercasedTokenAddress = tokenAddress.toLowerCase();
        const marketData = addressCryptoDataMap[lowercasedTokenAddress];
        if (!marketData) {
          return obj;
        }
        const token = {
          tokenAddress,
          currency,
          ...marketData
        };
        return {
          ...obj,
          [tokenAddress]: token
        };
      },
      {}
    );
  }
  /**
   * Type guard for whether the API can return token prices for the given chain
   * ID.
   *
   * @param chainId - The chain ID to check.
   * @returns True if the API supports the chain ID, false otherwise.
   */
  validateChainIdSupported(chainId) {
    const supportedChainIds = SUPPORTED_CHAIN_IDS;
    return typeof chainId === "string" && supportedChainIds.includes(chainId);
  }
  /**
   * Type guard for whether the API can return token prices in the given
   * currency.
   *
   * @param currency - The currency to check. If a string, can be either
   * lowercase or uppercase.
   * @returns True if the API supports the currency, false otherwise.
   */
  validateCurrencySupported(currency) {
    const supportedCurrencies = SUPPORTED_CURRENCIES;
    return typeof currency === "string" && supportedCurrencies.includes(currency.toLowerCase());
  }
};
_tokenPricePolicy = new WeakMap();

export {
  SUPPORTED_CURRENCIES,
  ZERO_ADDRESS,
  SUPPORTED_CHAIN_IDS,
  CodefiTokenPricesServiceV2
};
//# sourceMappingURL=chunk-XQO3EG4J.mjs.map