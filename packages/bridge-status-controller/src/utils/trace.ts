/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  formatChainIdToCaip,
  formatProviderLabel,
  FeatureId,
  getSwapType,
  isCrossChain,
  QuoteResponseV1,
  BRIDGE_FEATURE_ID_TO_FEATURE_TAG,
} from '@metamask/bridge-controller';

import { TraceName } from '../constants.js';
import type { BridgeHistoryItem } from '../types.js';

export type SwapOperationResult = 'success' | 'error';
export type SwapOperationTerminalStage = 'source' | 'destination';

export const getTraceParams = (
  quoteResponse: QuoteResponseV1,
  isStxEnabled: boolean,
) => {
  const featureId = quoteResponse.featureId ?? FeatureId.UNIFIED_SWAP_BRIDGE;
  return {
    name: isCrossChain(
      quoteResponse.quote.srcChainId,
      quoteResponse.quote.destChainId,
    )
      ? TraceName.BridgeTransactionCompleted
      : TraceName.SwapTransactionCompleted,
    data: {
      srcChainId: formatChainIdToCaip(quoteResponse.quote.srcChainId),
      stxEnabled: isStxEnabled,
      feature_id: featureId,
    },
    tags: {
      feature: BRIDGE_FEATURE_ID_TO_FEATURE_TAG[featureId],
    },
  };
};

export const getApprovalTraceParams = (
  quoteResponse: QuoteResponseV1,
  isStxEnabled: boolean,
) => {
  const featureId = quoteResponse.featureId ?? FeatureId.UNIFIED_SWAP_BRIDGE;
  return {
    name: isCrossChain(
      quoteResponse.quote.srcChainId,
      quoteResponse.quote.destChainId,
    )
      ? TraceName.BridgeTransactionApprovalCompleted
      : TraceName.SwapTransactionApprovalCompleted,
    data: {
      srcChainId: formatChainIdToCaip(quoteResponse.quote.srcChainId),
      stxEnabled: isStxEnabled,
      feature_id: featureId,
    },
    tags: {
      feature: BRIDGE_FEATURE_ID_TO_FEATURE_TAG[featureId],
    },
  };
};

export const getSwapOperationCompletedTraceParams = (
  historyItem: BridgeHistoryItem,
  historyKey: string,
  result: SwapOperationResult,
  terminalStage: SwapOperationTerminalStage,
) => {
  const quoteId = historyItem.quoteId ?? historyItem.quote.requestId;
  const sourceTransactionHash = historyItem.status.srcChain.txHash;
  const destinationTransactionHash = historyItem.status.destChain?.txHash;
  const featureId = historyItem.featureId ?? FeatureId.UNIFIED_SWAP_BRIDGE;

  return {
    name: TraceName.SwapOperationCompleted,
    startTime: historyItem.startTime,
    tags: {
      feature: BRIDGE_FEATURE_ID_TO_FEATURE_TAG[featureId],
    },
    data: {
      srcChainId: formatChainIdToCaip(historyItem.quote.srcChainId),
      destChainId: formatChainIdToCaip(historyItem.quote.destChainId),
      feature_id: featureId,
      provider: formatProviderLabel(historyItem.quote),
      swap_type: getSwapType(
        historyItem.quote.srcChainId,
        historyItem.quote.destChainId,
      ),
      terminal_stage: terminalStage,
      transaction_id: historyItem.txMetaId ?? historyKey,
      result,
      ...(quoteId ? { quote_id: quoteId } : {}),
      ...(sourceTransactionHash ? { src_tx_hash: sourceTransactionHash } : {}),
      ...(destinationTransactionHash
        ? { dest_tx_hash: destinationTransactionHash }
        : {}),
    },
  };
};
