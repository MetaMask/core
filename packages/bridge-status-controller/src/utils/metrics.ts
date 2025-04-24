import type { AccountsControllerState } from '@metamask/accounts-controller';
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
} from '@metamask/bridge-controller';
import type { BridgeHistoryItem } from 'src/types';

export const getTxStatusesFromHistory = ({
  status,
  hasApprovalTx,
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
    approval_transaction: hasApprovalTx ? approval_transaction : undefined,
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

export const getTradeDataFromHistory = (
  historyItem: BridgeHistoryItem,
): TradeData => {
  return {
    usd_quoted_gas: Number(historyItem.pricingData?.quotedGasInUsd ?? 0),
    gas_included: false,
    provider: formatProviderLabel(historyItem.quote),
    quoted_time_minutes: Number(
      historyItem.estimatedProcessingTimeInSeconds / 60,
    ),
    usd_quoted_return: Number(historyItem.pricingData?.quotedReturnInUsd ?? 0),
    price_impact: 0,
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
  };
};
