import type {
  CurrencyRateState,
  MultichainAssetsRatesControllerState,
  TokenRatesControllerState,
} from '@metamask/assets-controllers';
import type { CaipAssetType } from '@metamask/utils';
import { isStrictHexString } from '@metamask/utils';
import { createSelector } from 'reselect';

import type {
  BridgeControllerState,
  GenericQuoteRequest,
  QuoteMetadata,
  QuoteResponse,
  SolanaFees,
  TokenAmountValues,
} from './types';
import {
  getNativeAssetForChainId,
  isNativeAddress,
  isSolanaChainId,
} from './utils/bridge';
import {
  formatAddressToAssetId,
  formatChainIdToHex,
} from './utils/caip-formatters';
import {
  calcRelayerFee,
  calcSentAmount,
  calcSwapRate,
  calcToAmount,
} from './utils/quote';

type ExchangeRateControllers = MultichainAssetsRatesControllerState &
  TokenRatesControllerState &
  CurrencyRateState &
  Pick<BridgeControllerState, 'assetExchangeRates'>;

type BridgeAppState = BridgeControllerState & ExchangeRateControllers;

const selectAssetExchangeRate = (
  exchangeRateSources: ExchangeRateControllers,
  chainId?: GenericQuoteRequest['srcChainId'],
  address?: GenericQuoteRequest['srcTokenAddress'],
): Omit<TokenAmountValues, 'amount'> | null => {
  if (!chainId || !address) {
    return null;
  }
  const assetId = formatAddressToAssetId(address, chainId);
  if (!assetId) {
    return null;
  }

  const { assetExchangeRates, currencyRates, marketData, conversionRates } =
    exchangeRateSources;

  const assetExchangeRateToUse =
    assetExchangeRates[assetId] ??
    assetExchangeRates[assetId.toLowerCase() as CaipAssetType];
  if (assetExchangeRateToUse) {
    return assetExchangeRateToUse;
  }

  const multichainAssetExchangeRate = conversionRates?.[assetId];
  if (isSolanaChainId(chainId)) {
    if (multichainAssetExchangeRate) {
      return {
        valueInCurrency: multichainAssetExchangeRate.rate,
        usd: null,
      };
    }
    return null;
  }

  const { symbol } = getNativeAssetForChainId(chainId);
  const evmNativeExchangeRate = currencyRates[symbol];
  if (isNativeAddress(address) && evmNativeExchangeRate) {
    return {
      valueInCurrency:
        evmNativeExchangeRate?.conversionRate?.toString() ?? null,
      usd: evmNativeExchangeRate?.usdConversionRate?.toString() ?? null,
    };
  }

  const evmTokenExchangeRates = marketData[formatChainIdToHex(chainId)];
  const evmTokenExchangeRateForAddress = isStrictHexString(address)
    ? evmTokenExchangeRates?.[address]
    : null;
  if (evmTokenExchangeRateForAddress) {
    return {
      valueInCurrency: evmTokenExchangeRateForAddress?.price.toString() ?? null,
      usd: null,
    };
  }

  return null;
};

export const selectIsAssetExchangeRateInState = (
  ...i: Parameters<typeof selectAssetExchangeRate>
) => selectAssetExchangeRate(...i) !== null;

/**
 * Selects cross-chain swap quotes including their metadata
 *
 * @param state - The state of the bridge controller and its dependency controllers
 * @returns The quotes with metadata
 *
 * @example usage in the extension
 * ```ts
 * const quotes = useSelector(state => selectBridgeQuotesWithMetadata(state.metamask));
 * ```
 */
export const selectBridgeQuotesWithMetadata = createSelector(
  (state: BridgeAppState) => state.quotes,
  (state: BridgeAppState) =>
    selectAssetExchangeRate(
      state,
      state.quoteRequest.srcChainId,
      state.quoteRequest.srcTokenAddress,
    ),
  (state: BridgeAppState) =>
    selectAssetExchangeRate(
      state,
      state.quoteRequest.destChainId,
      state.quoteRequest.destTokenAddress,
    ),
  (state: BridgeAppState) =>
    selectAssetExchangeRate(
      state,
      state.quoteRequest.srcChainId,
      state.quoteRequest.srcChainId
        ? getNativeAssetForChainId(state.quoteRequest.srcChainId).assetId
        : undefined,
    ),
  (
    quotes,
    srcTokenExchangeRate,
    destTokenExchangeRate,
    nativeExchangeRate,
  ): (QuoteResponse & QuoteMetadata)[] => {
    const newQuotes = quotes.map((quote: QuoteResponse & SolanaFees) => {
      const sentAmount = calcSentAmount(
        quote.quote,
        srcTokenExchangeRate?.valueInCurrency ?? null,
        srcTokenExchangeRate?.usd ?? null,
      );
      const toTokenAmount = calcToAmount(
        quote.quote,
        destTokenExchangeRate?.valueInCurrency ?? null,
        destTokenExchangeRate?.usd ?? null,
      );
      const relayerFee = calcRelayerFee(
        quote,
        nativeExchangeRate?.valueInCurrency ?? null,
        nativeExchangeRate?.usd ?? null,
      );

      return {
        ...quote,
        // QuoteMetadata fields
        sentAmount,
        toTokenAmount,
        swapRate: calcSwapRate(sentAmount.amount, toTokenAmount.amount),
      };
    });

    // TODO rm type cast once everything is ported
    return newQuotes as (QuoteResponse & QuoteMetadata)[];
  },
);
