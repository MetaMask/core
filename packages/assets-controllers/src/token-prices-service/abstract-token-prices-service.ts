import type { Hex } from '@metamask/utils';

/**
 * Represents the price of a token in a currency.
 */
export type TokenPrice<
  TokenContractAddress extends Hex,
  Currency extends string,
> = {
  tokenContractAddress: TokenContractAddress;
  value: number;
  currency: Currency;
};

/**
 * A map of token contract address to its price.
 */
export type TokenPricesByTokenContractAddress<
  TokenContractAddress extends Hex,
  Currency extends string,
> = {
  [A in TokenContractAddress]: TokenPrice<A, Currency>;
};

/**
 * An ideal token prices service. All implementations must confirm to this
 * interface.
 *
 * @template ChainId - A type union of valid arguments for the `chainId`
 * argument to `fetchTokenPrices`.
 * @template TokenContractAddress - A type union of all token contract
 * addresses. The reason this type parameter exists is so that we can guarantee
 * that same addresses that `fetchTokenPrices` receives are the same addresses
 * that shown up in the return value.
 * @template Currency - A type union of valid arguments for the `currency`
 * argument to `fetchTokenPrices`.
 */
export type AbstractTokenPricesService<
  ChainId extends Hex = Hex,
  TokenContractAddress extends Hex = Hex,
  Currency extends string = string,
> = {
  /**
   * Retrieves prices in the given currency for the tokens identified by the
   * given contract addresses which are expected to live on the given chain.
   *
   * @param args - The arguments to this function.
   * @param args.chainId - An EIP-155 chain ID.
   * @param args.tokenContractAddresses - Contract addresses for tokens that
   * live on the chain.
   * @param args.currency - The desired currency of the token prices.
   * @returns The prices for the requested tokens.
   */
  fetchTokenPrices({
    chainId,
    tokenContractAddresses,
    currency,
  }: {
    chainId: ChainId;
    tokenContractAddresses: TokenContractAddress[];
    currency: Currency;
  }): Promise<
    TokenPricesByTokenContractAddress<TokenContractAddress, Currency>
  >;

  /**
   * Type guard for whether the API can return token prices for the given chain
   * ID.
   *
   * @param chainId - The chain ID to check.
   * @returns True if the API supports the chain ID, false otherwise.
   */
  validateChainIdSupported(chainId: unknown): chainId is ChainId;

  /**
   * Type guard for whether the API can return token prices in the given
   * currency.
   *
   * @param currency - The currency to check.
   * @returns True if the API supports the currency, false otherwise.
   */
  validateCurrencySupported(currency: unknown): currency is Currency;
};
