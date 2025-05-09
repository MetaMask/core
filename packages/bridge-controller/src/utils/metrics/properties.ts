import type { CaipChainId } from '@metamask/utils';

import { MetricsActionType, MetricsSwapType } from './constants';
import type { InputKeys, InputValues } from './types';
import type { AccountsControllerState } from '../../../../accounts-controller/src/AccountsController';
import { DEFAULT_BRIDGE_CONTROLLER_STATE } from '../../constants/bridge';
import type { BridgeControllerState, QuoteResponse, TxData } from '../../types';
import { type GenericQuoteRequest, type QuoteRequest } from '../../types';
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

export const getActionType = (
  srcChainId?: GenericQuoteRequest['srcChainId'],
  destChainId?: GenericQuoteRequest['destChainId'],
) => {
  if (srcChainId && !isCrossChain(srcChainId, destChainId ?? srcChainId)) {
    return MetricsActionType.SWAPBRIDGE_V1;
  }
  return MetricsActionType.CROSSCHAIN_V1;
};

export const getActionTypeFromQuoteRequest = (
  quoteRequest: Partial<GenericQuoteRequest>,
) => {
  return getActionType(quoteRequest.srcChainId, quoteRequest.destChainId);
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

export const isCustomSlippage = (slippage: GenericQuoteRequest['slippage']) => {
  return slippage !== DEFAULT_BRIDGE_CONTROLLER_STATE.quoteRequest.slippage;
};
