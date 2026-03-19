/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  formatChainIdToCaip,
  isCrossChain,
  QuoteResponse,
} from '@metamask/bridge-controller';

import { TraceName } from '../constants';

export const getTraceParams = (
  quoteResponse: QuoteResponse,
  isStxEnabledOnClient: boolean,
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
      stxEnabled: isStxEnabledOnClient,
    },
  };
};

export const getApprovalTraceParams = (
  quoteResponse: QuoteResponse,
  isStxEnabledOnClient: boolean,
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
      stxEnabled: isStxEnabledOnClient,
    },
  };
};
