import type {
  CurrencyRateState,
  MultichainAssetsRatesControllerState,
  TokenRatesControllerState,
} from '@metamask/assets-controllers';
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

// const getEvmTokenExchangeRates = (state: TokenRatesControllerState) =>
//   state.marketData;
// const getEVMNativeExchangeRates = (state: CurrencyRateState) =>
//   state.currencyRates;
// const getMultichainAssetExchangeRate = (
//   conversionRates: MultichainAssetsRatesControllerState['conversionRates'],
//   assetId: CaipAssetType,
// ) => conversionRates[assetId];

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

  if (assetExchangeRates[assetId]) {
    return assetExchangeRates[assetId];
  }

  const multichainAssetExchangeRate = conversionRates[assetId];
  if (isSolanaChainId(chainId) && multichainAssetExchangeRate) {
    return {
      valueInCurrency: multichainAssetExchangeRate.rate,
      usd: null,
    };
  }

  const { symbol } = getNativeAssetForChainId(chainId);
  const evmNativeExchangeRate = currencyRates[symbol];
  if (isNativeAddress(address) && evmNativeExchangeRate) {
    return {
      valueInCurrency: evmNativeExchangeRate.conversionRate?.toString() ?? null,
      usd: evmNativeExchangeRate.usdConversionRate?.toString() ?? null,
    };
  }

  const evmTokenExchangeRates = marketData[formatChainIdToHex(chainId)];
  const evmTokenExchangeRateForAddress = isStrictHexString(address)
    ? evmTokenExchangeRates[address]
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
