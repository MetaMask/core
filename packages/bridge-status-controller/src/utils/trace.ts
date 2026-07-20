/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  formatChainIdToCaip,
  isCrossChain,
  QuoteResponseV1,
} from '@metamask/bridge-controller';

import { TraceName } from '../constants';

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
