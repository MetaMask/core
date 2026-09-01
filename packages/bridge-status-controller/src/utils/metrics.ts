/* eslint-disable camelcase */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import type { AccountsControllerState } from '@metamask/accounts-controller';
import {
  StatusTypes,
  getAccountHardwareType,
  formatChainIdToHex,
  isEthUsdt,
  formatChainIdToCaip,
  formatProviderLabel,
  isCustomSlippage,
  getSwapType,
  formatAddressToAssetId,
  MetricsActionType,
  MetricsSwapType,
  MetaMetricsSwapsEventSource,
  FeatureId,
  UnifiedSwapBridgeEventName,
  FailurePhase,
  SwapBridgeErrorCode,
} from '@metamask/bridge-controller';
import type {
  AccountHardwareType,
  QuoteFetchData,
  QuoteMetadata,
  QuoteResponseV1,
  TxStatusData,
  RequestParams,
  TradeData,
  RequestMetadata,
  BatchSellTradesResponse,
  RequiredEventContextFromClient,
  HashPresenceProperties,
  FailureTelemetryProperties,
} from '@metamask/bridge-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { CaipAssetType, Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { BridgeHistoryItem } from '../types.js';
import { calcActualGasUsed } from './gas.js';
import {
  getActualBridgeReceivedAmount,
  getActualSwapReceivedAmount,
} from './swap-received-amount.js';

/**
 * Classify a thrown value from submit (sign/broadcast) catch paths.
 *
 * @param error - The thrown value from submit.
 * @returns The Mixpanel `error_code`.
 */
export const getSubmitErrorCode = (error: unknown): SwapBridgeErrorCode => {
  if (error === undefined || error === null) {
    return SwapBridgeErrorCode.MissingErrorObject;
  }
  if (error instanceof Error) {
    return SwapBridgeErrorCode.Unknown;
  }
  return SwapBridgeErrorCode.NonErrorRejection;
};

/**
 * @param sourceHash - Source tx hash if known at emit time.
 * @param destinationHash - Destination tx hash if known at emit time.
 * @returns Boolean hash-presence properties.
 */
export const getHashPresenceProperties = (
  sourceHash?: string | null,
  destinationHash?: string | null,
): HashPresenceProperties => {
  return {
    source_hash_present: Boolean(sourceHash),
    destination_hash_present: Boolean(destinationHash),
  };
};

/**
 * Prefer destination_execution over source_execution over poll.
 *
 * @param hashPresence - Hash presence at emit time.
 * @returns The Mixpanel `failure_phase` for a status/polling Failed event.
 */
export const getStatusFailurePhase = (
  hashPresence: HashPresenceProperties,
): FailurePhase => {
  if (hashPresence.destination_hash_present) {
    return FailurePhase.DestinationExecution;
  }
  if (hashPresence.source_hash_present) {
    return FailurePhase.SourceExecution;
  }
  return FailurePhase.Poll;
};

/**
 * Align `failure_phase` with combined hash presence without turning a
 * no-hash `broadcast` failure into `poll`.
 *
 * @param phase - Phase from the emitting path.
 * @param hashPresence - Combined history + caller hash flags.
 * @returns The Mixpanel `failure_phase`.
 */
export const promoteFailurePhase = (
  phase: FailurePhase,
  hashPresence: HashPresenceProperties,
): FailurePhase => {
  if (hashPresence.destination_hash_present) {
    return FailurePhase.DestinationExecution;
  }
  if (
    hashPresence.source_hash_present &&
    (phase === FailurePhase.Broadcast ||
      phase === FailurePhase.Poll ||
      phase === FailurePhase.Unknown)
  ) {
    return FailurePhase.SourceExecution;
  }
  return phase;
};

/**
 * Mixpanel properties for Failed events in the `broadcast` phase (no tx hash yet).
 *
 * @param error - The thrown value from the submit/broadcast catch.
 * @returns Phase, error code, and hash-presence flags.
 */
export const getBroadcastFailureProperties = (
  error: unknown,
): FailureTelemetryProperties => {
  return {
    failure_phase: FailurePhase.Broadcast,
    error_code: getSubmitErrorCode(error),
    source_hash_present: false,
    destination_hash_present: false,
  };
};

/**
 * Telemetry for Failed events derived from a status poll.
 *
 * @param sourceHash - Source tx hash if known.
 * @param destinationHash - Destination tx hash if known.
 * @returns Phase, error code, and hash-presence flags.
 */
export const getStatusFailureTelemetry = (
  sourceHash?: string | null,
  destinationHash?: string | null,
): FailureTelemetryProperties => {
  const hashPresence = getHashPresenceProperties(sourceHash, destinationHash);
  return {
    ...hashPresence,
    failure_phase: getStatusFailurePhase(hashPresence),
    error_code: SwapBridgeErrorCode.StatusFailedWithoutReason,
  };
};

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

/**
 * Calculate the properties for a finalized transaction event based on the txHistory
 * and txMeta
 *
 * @param historyItem - The bridge history item
 * @param txMeta - The transaction meta from the TransactionController
 * @param approvalTxMeta - The approval transaction meta from the TransactionController
 * @returns The properties for the finalized transaction
 */
export const getFinalizedTxProperties = (
  historyItem: BridgeHistoryItem,
  txMeta?: TransactionMeta,
  approvalTxMeta?: TransactionMeta,
) => {
  const startTime =
    approvalTxMeta?.submittedTime ??
    txMeta?.submittedTime ??
    historyItem.startTime;
  const completionTime =
    txMeta?.type === TransactionType.swap
      ? txMeta?.time
      : historyItem.completionTime;

  const actualGas = calcActualGasUsed(
    historyItem,
    txMeta?.txReceipt,
    approvalTxMeta?.txReceipt,
  );

  const actualReturn =
    txMeta?.type === TransactionType.swap
      ? getActualSwapReceivedAmount(historyItem, actualGas, txMeta)
      : getActualBridgeReceivedAmount(historyItem);

  const quotedVsUsedGasRatio =
    historyItem.pricingData?.quotedGasAmount && actualGas?.amount
      ? new BigNumber(historyItem.pricingData.quotedGasAmount)
          .multipliedBy(new BigNumber(10).pow(18))
          .div(actualGas.amount)
          .toNumber()
      : 0;

  const quoteVsExecutionRatio =
    historyItem.pricingData?.quotedReturnInUsd && actualReturn?.usd
      ? new BigNumber(historyItem.pricingData.quotedReturnInUsd)
          .div(actualReturn.usd)
          .toNumber()
      : 0;

  return {
    actual_time_minutes:
      completionTime && startTime ? (completionTime - startTime) / 60000 : 0,
    usd_actual_return: Number(actualReturn?.usd ?? 0),
    usd_actual_gas: actualGas?.usd ?? 0,
    quote_vs_execution_ratio: quoteVsExecutionRatio,
    quoted_vs_used_gas_ratio: quotedVsUsedGasRatio,
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
    token_security_type_destination:
      historyItem.tokenSecurityTypeDestination ?? null,
  };
};

export const getTradeDataFromQuote = (
  quoteResponse: QuoteResponseV1 & QuoteMetadata,
  batchSellTrades?: BatchSellTradesResponse | null,
): TradeData => {
  return {
    usd_quoted_gas: Number(quoteResponse.gasFee?.total?.usd ?? 0),
    gas_included:
      quoteResponse.quote.gasIncluded ?? batchSellTrades?.gasIncluded ?? false,
    gas_included_7702:
      quoteResponse.quote.gasIncluded7702 ??
      batchSellTrades?.gasIncluded7702 ??
      false,
    provider: formatProviderLabel(quoteResponse.quote),
    quoted_time_minutes: Number(
      quoteResponse.estimatedProcessingTimeInSeconds / 60,
    ),
    usd_quoted_return: Number(quoteResponse?.adjustedReturn?.usd ?? 0),
  };
};

export const getPriceImpactFromQuote = (
  quote: QuoteResponseV1['quote'],
): Pick<QuoteFetchData, 'price_impact'> => {
  return { price_impact: Number(quote.priceData?.priceImpact ?? '0') };
};

/**
 * Before the tx is confirmed, its data is not available in txHistory
 * The quote is used to populate event properties before confirmation
 *
 * @param quoteResponse - The quote response
 * @param isStxEnabled - Whether smart transactions are enabled on the client, for example the getSmartTransactionsEnabled selector value from the extension
 * @param accountHardwareType - The hardware wallet type used to submit the tx, or null if not a hardware wallet
 * @param location - The entry point from which the user initiated the swap or bridge (e.g. Main View, Token View, Trending Explore)
 * @param abTests - Legacy A/B test context for `ab_tests` (backward compatibility)
 * @param activeAbTests - New A/B test context for `active_ab_tests` (migration target)
 * @param tokenSecurityTypeDestination - The security classification of the destination token, supplied by the client (e.g. from token security/scanning data). Pass `null` when no security data is available.
 * @param batchSellTrades - The batch sell trades response
 * @param batchId - The batch ID of the transaction batch.
 * @param quotesReceivedContext - The client context captured when quotes were received.
 * @returns The properties for the pre-confirmation event
 */
export const getPreConfirmationPropertiesFromQuote = (
  quoteResponse: QuoteResponseV1 & QuoteMetadata,
  isStxEnabled: boolean,
  accountHardwareType: AccountHardwareType,
  location?: MetaMetricsSwapsEventSource,
  abTests?: Record<string, string>,
  activeAbTests?: { key: string; value: string }[],
  tokenSecurityTypeDestination?: string | null,
  batchSellTrades?: BatchSellTradesResponse | null,
  batchId?: Hex,
  quotesReceivedContext?: RequiredEventContextFromClient[UnifiedSwapBridgeEventName.QuotesReceived],
) => {
  const { quote } = quoteResponse;
  return {
    ...getPriceImpactFromQuote(quote),
    ...getTradeDataFromQuote(quoteResponse, batchSellTrades),
    chain_id_source: formatChainIdToCaip(quote.srcChainId),
    token_symbol_source: quote.srcAsset.symbol,
    token_address_source: quote.srcAsset.assetId,
    chain_id_destination: formatChainIdToCaip(quote.destChainId),
    token_symbol_destination: quote.destAsset.symbol,
    token_address_destination: quote.destAsset.assetId,
    token_security_type_destination: tokenSecurityTypeDestination ?? null,
    account_hardware_type: accountHardwareType,
    is_hardware_wallet: accountHardwareType !== null,
    swap_type: getSwapType(
      quoteResponse.quote.srcChainId,
      quoteResponse.quote.destChainId,
    ),
    usd_amount_source: Number(quoteResponse?.sentAmount?.usd ?? 0),
    stx_enabled: isStxEnabled,
    action_type: MetricsActionType.SWAPBRIDGE_V1,
    slippage_limit:
      quotesReceivedContext?.slippage_limit ?? quote.slippage ?? 0,
    custom_slippage: quotesReceivedContext?.custom_slippage ?? false,
    location,
    ...(abTests &&
      Object.keys(abTests).length > 0 && {
        ab_tests: abTests,
      }),
    ...(activeAbTests &&
      activeAbTests.length > 0 && {
        active_ab_tests: activeAbTests,
      }),
    ...(batchId ? { batch_id: batchId } : {}),
    feature_id: quoteResponse.featureId ?? FeatureId.UNIFIED_SWAP_BRIDGE,
  };
};

export const getTradeDataFromHistory = (
  historyItem: BridgeHistoryItem,
): TradeData => {
  return {
    usd_quoted_gas: Number(historyItem.pricingData?.quotedGasInUsd ?? 0),
    gas_included: historyItem.quote.gasIncluded ?? false,
    gas_included_7702: historyItem.quote.gasIncluded7702 ?? false,
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
  const {
    quote,
    slippagePercentage,
    isStxEnabled,
    customSlippage,
    batchSellData,
    featureId,
  } = historyItem;
  const accountHardwareType = getAccountHardwareType(account);
  const isBatchSell =
    Boolean(batchSellData) || featureId === FeatureId.BATCH_SELL;
  const isUnifiedSwapBridge =
    featureId === undefined || featureId === FeatureId.UNIFIED_SWAP_BRIDGE;
  let inferredCustomSlippage = false;
  if (isBatchSell) {
    inferredCustomSlippage = isCustomSlippage(slippagePercentage ?? 0);
  } else if (!isUnifiedSwapBridge) {
    inferredCustomSlippage = isCustomSlippage(slippagePercentage);
  }

  return {
    slippage_limit: slippagePercentage ?? 0,
    custom_slippage: customSlippage ?? inferredCustomSlippage,
    usd_amount_source: Number(historyItem.pricingData?.amountSentInUsd ?? 0),
    swap_type: getSwapType(quote.srcChainId, quote.destChainId),
    account_hardware_type: accountHardwareType,
    is_hardware_wallet: accountHardwareType !== null,
    stx_enabled: isStxEnabled ?? false,
    security_warnings: [],
  };
};

/**
 * Get the properties for a swap transaction that is not in the txHistory
 *
 * @param transactionMeta - The transaction meta
 * @param account - The account that submitted the transaction
 * @returns The properties for the swap transaction
 */
export const getEVMTxPropertiesFromTransactionMeta = (
  transactionMeta: TransactionMeta,
  account?: AccountsControllerState['internalAccounts']['accounts'][string],
) => {
  const accountHardwareType = getAccountHardwareType(account);

  return {
    source_transaction: [
      TransactionStatus.failed,
      TransactionStatus.dropped,
      TransactionStatus.rejected,
    ].includes(transactionMeta.status)
      ? StatusTypes.FAILED
      : StatusTypes.COMPLETE,
    error_message: [
      `Transaction ${transactionMeta.status}`,
      transactionMeta.error?.message,
    ]
      .filter(Boolean)
      .join('. '),
    chain_id_source: formatChainIdToCaip(transactionMeta.chainId),
    chain_id_destination: formatChainIdToCaip(transactionMeta.chainId),
    token_symbol_source: transactionMeta.sourceTokenSymbol ?? '',
    token_symbol_destination: transactionMeta.destinationTokenSymbol ?? '',
    usd_amount_source: 0,
    slippage_limit: 0,
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
    token_security_type_destination: null,
    custom_slippage: false,
    account_hardware_type: accountHardwareType,
    is_hardware_wallet: accountHardwareType !== null,
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
    gas_included_7702: false,
    quoted_time_minutes: 0,
    usd_quoted_return: 0,
    provider: '' as `${string}_${string}`,
    actual_time_minutes: 0,
    quote_vs_execution_ratio: 0,
    quoted_vs_used_gas_ratio: 0,
    usd_actual_return: 0,
    usd_actual_gas: 0,
    action_type: MetricsActionType.SWAPBRIDGE_V1,
    ...(transactionMeta.batchId ? { batch_id: transactionMeta.batchId } : {}),
    ...getHashPresenceProperties(transactionMeta.hash, undefined),
    failure_phase: transactionMeta.hash
      ? FailurePhase.SourceExecution
      : FailurePhase.Broadcast,
    error_code: transactionMeta.error
      ? SwapBridgeErrorCode.Unknown
      : SwapBridgeErrorCode.MissingErrorObject,
  };
};
