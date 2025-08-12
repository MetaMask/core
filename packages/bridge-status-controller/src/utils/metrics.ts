import type { AccountsControllerState } from '@metamask/accounts-controller';
import type {
  QuoteResponse,
  TxData,
  QuoteMetadata,
} from '@metamask/bridge-controller';
import {
  type TxStatusData,
  StatusTypes,
  formatChainIdToHex,
  isEthUsdt,
  type RequestParams,
  formatChainIdToCaip,
  type TradeData,
  formatProviderLabel,
  type RequestMetadata,
  isCustomSlippage,
  getSwapType,
  isHardwareWallet,
  formatAddressToAssetId,
  MetricsActionType,
  MetricsSwapType,
} from '@metamask/bridge-controller';
import {
  TransactionStatus,
  TransactionType,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import type { CaipAssetType } from '@metamask/utils';
import type { BridgeHistoryItem } from 'src/types';

import type { QuoteFetchData } from '../../../bridge-controller/src/utils/metrics/types';

export const getTxStatusesFromHistory = ({
  status,
  hasApprovalTx,
  approvalTxId,
  quote,
}: BridgeHistoryItem): TxStatusData => {
  const source_transaction = status.srcChain.txHash
    ? StatusTypes.COMPLETE
    : StatusTypes.PENDING;
  const destination_transaction = status.destChain?.txHash
    ? status.status
    : StatusTypes.PENDING;

  const hexChainId = formatChainIdToHex(quote.srcChainId);
  const isEthUsdtTx = isEthUsdt(hexChainId, quote.srcAsset.address);
  const allowance_reset_transaction = status.srcChain.txHash
    ? StatusTypes.COMPLETE
    : undefined;
  const approval_transaction = status.srcChain.txHash
    ? StatusTypes.COMPLETE
    : StatusTypes.PENDING;

  return {
    allowance_reset_transaction: isEthUsdtTx
      ? allowance_reset_transaction
      : undefined,
    approval_transaction:
      hasApprovalTx || approvalTxId ? approval_transaction : undefined,
    source_transaction,
    destination_transaction:
      status.status === StatusTypes.FAILED
        ? StatusTypes.FAILED
        : destination_transaction,
  };
};

export const getFinalizedTxProperties = (historyItem: BridgeHistoryItem) => {
  return {
    actual_time_minutes:
      historyItem.completionTime && historyItem.startTime
        ? (historyItem.completionTime - historyItem.startTime) / 60000
        : 0,
    usd_actual_return: Number(historyItem.pricingData?.quotedReturnInUsd ?? 0), // TODO calculate based on USD price at completion time
    usd_actual_gas: Number(historyItem.pricingData?.quotedGasInUsd ?? 0), // TODO calculate based on USD price at completion time
    quote_vs_execution_ratio: 1, // TODO calculate based on USD price at completion time
    quoted_vs_used_gas_ratio: 1, // TODO calculate based on USD price at completion time
  };
};

export const getRequestParamFromHistory = (
  historyItem: BridgeHistoryItem,
): RequestParams => {
  return {
    chain_id_source: formatChainIdToCaip(historyItem.quote.srcChainId),
    token_symbol_source: historyItem.quote.srcAsset.symbol,
    token_address_source: historyItem.quote.srcAsset.assetId,
    chain_id_destination: formatChainIdToCaip(historyItem.quote.destChainId),
    token_symbol_destination: historyItem.quote.destAsset.symbol,
    token_address_destination: historyItem.quote.destAsset.assetId,
  };
};

export const getTradeDataFromQuote = (
  quoteResponse: QuoteResponse<TxData | string> & QuoteMetadata,
): TradeData => {
  return {
    usd_quoted_gas: Number(quoteResponse.gasFee?.effective?.usd ?? 0),
    gas_included: quoteResponse.quote.gasIncluded ?? false,
    provider: formatProviderLabel(quoteResponse.quote),
    quoted_time_minutes: Number(
      quoteResponse.estimatedProcessingTimeInSeconds / 60,
    ),
    usd_quoted_return: Number(quoteResponse.adjustedReturn?.usd ?? 0),
  };
};

export const getPriceImpactFromQuote = (
  quote: QuoteResponse['quote'],
): Pick<QuoteFetchData, 'price_impact'> => {
  return { price_impact: Number(quote.priceData?.priceImpact ?? '0') };
};

export const getTradeDataFromHistory = (
  historyItem: BridgeHistoryItem,
): TradeData => {
  return {
    usd_quoted_gas: Number(historyItem.pricingData?.quotedGasInUsd ?? 0),
    gas_included: historyItem.quote.gasIncluded ?? false,
    provider: formatProviderLabel(historyItem.quote),
    quoted_time_minutes: Number(
      historyItem.estimatedProcessingTimeInSeconds / 60,
    ),
    usd_quoted_return: Number(historyItem.pricingData?.quotedReturnInUsd ?? 0),
  };
};

export const getRequestMetadataFromHistory = (
  historyItem: BridgeHistoryItem,
  account?: AccountsControllerState['internalAccounts']['accounts'][string],
): RequestMetadata => {
  const { quote, slippagePercentage, isStxEnabled } = historyItem;

  return {
    slippage_limit: slippagePercentage,
    custom_slippage: isCustomSlippage(slippagePercentage),
    usd_amount_source: Number(historyItem.pricingData?.amountSentInUsd ?? 0),
    swap_type: getSwapType(quote.srcChainId, quote.destChainId),
    is_hardware_wallet: isHardwareWallet(account),
    stx_enabled: isStxEnabled ?? false,
    security_warnings: [],
  };
};

/**
 * Get the properties for a swap transaction that is not in the txHistory
 *
 * @param transactionMeta - The transaction meta
 * @returns The properties for the swap transaction
 */
export const getEVMTxPropertiesFromTransactionMeta = (
  transactionMeta: TransactionMeta,
) => {
  return {
    source_transaction: [
      TransactionStatus.failed,
      TransactionStatus.dropped,
      TransactionStatus.rejected,
    ].includes(transactionMeta.status)
      ? StatusTypes.FAILED
      : StatusTypes.COMPLETE,
    error_message: transactionMeta.error?.message
      ? 'Failed to finalize swap tx'
      : undefined,
    chain_id_source: formatChainIdToCaip(transactionMeta.chainId),
    chain_id_destination: formatChainIdToCaip(transactionMeta.chainId),
    token_symbol_source: transactionMeta.sourceTokenSymbol ?? '',
    token_symbol_destination: transactionMeta.destinationTokenSymbol ?? '',
    usd_amount_source: 100,
    stx_enabled: false,
    token_address_source:
      formatAddressToAssetId(
        transactionMeta.sourceTokenAddress ?? '',
        transactionMeta.chainId,
      ) ?? ('' as CaipAssetType),
    token_address_destination:
      formatAddressToAssetId(
        transactionMeta.destinationTokenAddress ?? '',
        transactionMeta.chainId,
      ) ?? ('' as CaipAssetType),
    custom_slippage: false,
    is_hardware_wallet: false,
    swap_type:
      transactionMeta.type &&
      [TransactionType.swap, TransactionType.swapApproval].includes(
        transactionMeta.type,
      )
        ? MetricsSwapType.SINGLE
        : MetricsSwapType.CROSSCHAIN,
    security_warnings: [],
    price_impact: 0,
    usd_quoted_gas: 0,
    gas_included: false,
    quoted_time_minutes: 0,
    usd_quoted_return: 0,
    provider: '' as `${string}_${string}`,
    actual_time_minutes: 0,
    quote_vs_execution_ratio: 0,
    quoted_vs_used_gas_ratio: 0,
    usd_actual_return: 0,
    usd_actual_gas: 0,
    action_type: MetricsActionType.SWAPBRIDGE_V1,
  };
};
