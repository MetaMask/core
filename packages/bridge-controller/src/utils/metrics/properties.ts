import type { AccountsControllerState } from '@metamask/accounts-controller';

import { MetricsSwapType } from './constants';
import type { InputKeys, InputValues, QuoteWarning, RequestParams } from './types';
import { DEFAULT_BRIDGE_CONTROLLER_STATE } from '../../constants/bridge';
import type { QuoteMetadata, QuoteResponse, TxData } from '../../types';
import {
  ChainId,
  type GenericQuoteRequest,
  type QuoteRequest,
} from '../../types';
import { getNativeAssetForChainId, isCrossChain } from '../bridge';
import {
  formatAddressToAssetId,
  formatChainIdToCaip,
} from '../caip-formatters';

export const toInputChangedPropertyKey: Partial<
  Record<keyof QuoteRequest, InputKeys>
> = {
  srcTokenAddress: 'token_source',
  destTokenAddress: 'token_destination',
  srcChainId: 'chain_source',
  destChainId: 'chain_destination',
  slippage: 'slippage',
};

export const toInputChangedPropertyValue: Partial<
  Record<
    keyof typeof toInputChangedPropertyKey,
    (
      input_value: Partial<GenericQuoteRequest>,
    ) => InputValues[keyof InputValues] | undefined
  >
> = {
  srcTokenAddress: ({ srcTokenAddress, srcChainId }) =>
    srcChainId
      ? formatAddressToAssetId(srcTokenAddress ?? '', srcChainId)
      : undefined,
  destTokenAddress: ({ destTokenAddress, destChainId }) =>
    destChainId
      ? formatAddressToAssetId(destTokenAddress ?? '', destChainId)
      : undefined,
  srcChainId: ({ srcChainId }) =>
    srcChainId ? formatChainIdToCaip(srcChainId) : undefined,
  destChainId: ({ destChainId }) =>
    destChainId ? formatChainIdToCaip(destChainId) : undefined,
  slippage: ({ slippage }) => (slippage ? Number(slippage) : slippage),
};

export const getSwapType = (
  srcChainId?: GenericQuoteRequest['srcChainId'],
  destChainId?: GenericQuoteRequest['destChainId'],
) => {
  if (srcChainId && !isCrossChain(srcChainId, destChainId ?? srcChainId)) {
    return MetricsSwapType.SINGLE;
  }
  return MetricsSwapType.CROSSCHAIN;
};

export const getSwapTypeFromQuote = (
  quoteRequest: Partial<GenericQuoteRequest>,
) => {
  return getSwapType(quoteRequest.srcChainId, quoteRequest.destChainId);
};

export const formatProviderLabel = ({
  bridgeId,
  bridges,
}: QuoteResponse<TxData | string>['quote']): `${string}_${string}` =>
  `${bridgeId}_${bridges[0]}`;

export const getRequestParams = ({
  srcChainId,
  destChainId,
  srcTokenAddress,
  destTokenAddress,
}: Partial<GenericQuoteRequest>): Omit<
  RequestParams,
  'token_symbol_source' | 'token_symbol_destination'
> => {
  // Fallback to ETH if srcChainId is not defined. This is ok since the clients default to Ethereum as the source chain
  // This also doesn't happen at runtime since the quote request is validated before metrics are published
  const srcChainIdCaip = formatChainIdToCaip(srcChainId ?? ChainId.ETH);
  return {
    chain_id_source: srcChainIdCaip,
    chain_id_destination: destChainId ? formatChainIdToCaip(destChainId) : null,
    token_address_source: srcTokenAddress
      ? (formatAddressToAssetId(srcTokenAddress, srcChainIdCaip) ??
        getNativeAssetForChainId(srcChainIdCaip)?.assetId ??
        null)
      : (getNativeAssetForChainId(srcChainIdCaip)?.assetId ?? null),
    token_address_destination: destTokenAddress
      ? (formatAddressToAssetId(
          destTokenAddress,
          destChainId ?? srcChainIdCaip,
        ) ?? null)
      : null,
  };
};

export const isHardwareWallet = (
  selectedAccount?: AccountsControllerState['internalAccounts']['accounts'][string],
) => {
  return selectedAccount?.metadata?.keyring.type?.includes('Hardware') ?? false;
};

/**
 * @param slippage - The slippage percentage
 * @returns Whether the default slippage was overridden by the user
 *
 * @deprecated This function should not be used. Use {@link selectDefaultSlippagePercentage} instead.
 */
export const isCustomSlippage = (slippage: GenericQuoteRequest['slippage']) => {
  return slippage !== DEFAULT_BRIDGE_CONTROLLER_STATE.quoteRequest.slippage;
};

export const getQuotesReceivedProperties = (
  activeQuote: null |QuoteResponse & Partial<QuoteMetadata>,
  warnings: QuoteWarning[] = [],
  recommendedQuote?: null | QuoteResponse & Partial<QuoteMetadata>,
) => {
  const provider =activeQuote ? formatProviderLabel(activeQuote.quote) : '_'
  return {
    can_submit: true,
    gas_included: Boolean(activeQuote?.quote?.gasIncluded),
    gas_included_7702: Boolean(activeQuote?.quote?.gasIncluded7702),
    quoted_time_minutes: activeQuote?.estimatedProcessingTimeInSeconds
      ? activeQuote.estimatedProcessingTimeInSeconds / 60
      : 0,
    usd_quoted_gas: Number(activeQuote?.gasFee?.effective?.usd ?? 0),
    usd_quoted_return: Number(activeQuote?.toTokenAmount?.usd ?? 0),
      best_quote_provider: recommendedQuote ? formatProviderLabel(recommendedQuote.quote) : provider,
    provider,
    warnings,
    price_impact: Number(activeQuote?.quote.priceData?.priceImpact ?? 0),
  };
};
