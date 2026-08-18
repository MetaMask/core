/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  formatChainIdToCaip,
  formatProviderLabel,
  getSwapType,
  isCrossChain,
  QuoteResponseV1,
} from '@metamask/bridge-controller';

import { TraceName } from '../constants.js';
import type { BridgeHistoryItem } from '../types.js';

export type SwapOperationResult = 'success' | 'error';
export type SwapOperationTerminalStage = 'source' | 'destination';

export const getTraceParams = (
  quoteResponse: QuoteResponseV1,
  isStxEnabled: boolean,
) => {
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
    },
  };
};

export const getApprovalTraceParams = (
  quoteResponse: QuoteResponseV1,
  isStxEnabled: boolean,
) => {
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

  return {
    name: TraceName.SwapOperationCompleted,
    startTime: historyItem.startTime,
    data: {
      srcChainId: formatChainIdToCaip(historyItem.quote.srcChainId),
      destChainId: formatChainIdToCaip(historyItem.quote.destChainId),
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
