/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import {
  BitcoinTradeData,
  ChainId,
  isBitcoinTrade,
  isEvmTxData,
  isNonEvmChainId,
  isTronTrade,
  Trade,
  TronTradeData,
  TxData,
} from '@metamask/bridge-controller';

import { submitBatchHandler } from './batch-strategy';
import { submitEvmHandler as defaultSubmitHandler } from './evm-strategy';
import { submitIntentHandler } from './intent-strategy';
import { submitNonEvmHandler } from './non-evm-strategy';
import type { SubmitStrategyParams, SubmitStepResult } from './types';

const validateParams = <
  TxDataType extends BitcoinTradeData | TronTradeData | string | TxData,
>(
  params: SubmitStrategyParams<Trade>,
): params is SubmitStrategyParams<TxDataType> => {
  const txs = [
    params.quoteResponse.trade,
    params.quoteResponse.approval,
    params.quoteResponse.resetApproval,
  ].filter((tx): tx is TxDataType => tx !== undefined);

  switch (params.quoteResponse.quote.srcChainId) {
    case ChainId.SOLANA:
      return txs.every((tx) => typeof tx === 'string');
    case ChainId.BTC:
      return txs.every(isBitcoinTrade);
    case ChainId.TRON:
      return txs.every(isTronTrade);
    default:
      return txs.every(isEvmTxData);
  }
};

/**
 * Selects the appropriate submit strategy based on the quote parameters then executes it
 *
 * @param params - The parameters for the transaction
 * @returns An async generator that yields results from each step of the submit flow. The yielded
 * results are used to update the BridgeStatusController state and emit events.
 */
const executeSubmitStrategy = (
  params: SubmitStrategyParams<Trade>,
): AsyncGenerator<SubmitStepResult, void, void> => {
  const { quoteResponse, isStxEnabledOnClient, isDelegatedAccount } = params;

  // Non-EVM transactions
  if (isNonEvmChainId(quoteResponse.quote.srcChainId)) {
    if (!validateParams(params)) {
      throw new Error(
        'Failed to submit cross-chain swap transaction: trade is not a non-EVM transaction',
      );
    }
    return submitNonEvmHandler(params);
  }

  // EVM transactions
  if (!validateParams<TxData>(params)) {
    throw new Error(
      'Failed to submit cross-chain swap transaction: trade is not an EVM transaction',
    );
  }

  // Intent transactions
  if (quoteResponse.quote.intent) {
    return submitIntentHandler(params);
  }

  // Batched transactions
  const shouldBatchTxs =
    isStxEnabledOnClient ||
    quoteResponse.quote.gasIncluded7702 ||
    isDelegatedAccount;
  if (shouldBatchTxs) {
    return submitBatchHandler(params);
  }

  // Non-stx/gasless EVM transactions
  return defaultSubmitHandler(params);
};

export default executeSubmitStrategy;
