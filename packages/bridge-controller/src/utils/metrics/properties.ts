import type { CaipChainId } from '@metamask/utils';

import { MetricsActionType, MetricsSwapType } from './constants';
import type { InputKeys, InputValues } from './types';
import type {
  BridgeControllerState,
  Quote,
  QuoteResponse,
  TxData,
} from '../../types';
import { type GenericQuoteRequest, type QuoteRequest } from '../../types';
import { getNativeAssetForChainId } from '../bridge';
import {
  formatAddressToAssetId,
  formatChainIdToCaip,
} from '../caip-formatters';

export const quoteRequestToInputChangedProperties: Partial<
  Record<keyof QuoteRequest, InputKeys>
> = {
  srcTokenAddress: 'token_source',
  destTokenAddress: 'token_destination',
  srcChainId: 'chain_source',
  destChainId: 'chain_destination',
  slippage: 'slippage',
};

export const quoteRequestToInputChangedPropertyValues: Partial<
  Record<
    keyof QuoteRequest,
    (
      value: Partial<GenericQuoteRequest>,
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

export const getActionType = (quoteRequest: Partial<GenericQuoteRequest>) => {
  if (
    quoteRequest.srcChainId &&
    formatChainIdToCaip(quoteRequest.srcChainId) ===
      formatChainIdToCaip(quoteRequest.destChainId ?? quoteRequest.srcChainId)
  ) {
    return MetricsActionType.SWAPBRIDGE_V1;
  }
  return MetricsActionType.CROSSCHAIN_V1;
};

export const getSwapType = (quoteRequest: Partial<GenericQuoteRequest>) => {
  if (
    quoteRequest.srcChainId &&
    formatChainIdToCaip(quoteRequest.srcChainId) ===
      formatChainIdToCaip(quoteRequest.destChainId ?? quoteRequest.srcChainId)
  ) {
    return MetricsSwapType.SINGLE;
  }
  return MetricsSwapType.CROSSCHAIN;
};

export const formatProviderLabel = ({
  quote: { bridgeId, bridges },
}: QuoteResponse<TxData | string>): `${string}_${string}` =>
  `${bridgeId}_${bridges[0]}`;

export const getRequestParams = (
  {
    destChainId,
    srcTokenAddress,
    destTokenAddress,
  }: BridgeControllerState['quoteRequest'],
  srcChainIdCaip: CaipChainId,
) => {
  return {
    chain_id_source: srcChainIdCaip,
    chain_id_destination: destChainId
      ? formatChainIdToCaip(destChainId)
      : undefined,
    token_address_source: srcTokenAddress
      ? (formatAddressToAssetId(srcTokenAddress, srcChainIdCaip) ??
        getNativeAssetForChainId(srcChainIdCaip)?.assetId)
      : getNativeAssetForChainId(srcChainIdCaip)?.assetId,
    token_address_destination: destTokenAddress
      ? formatAddressToAssetId(destTokenAddress, destChainId ?? srcChainIdCaip)
      : undefined,
  };
};
