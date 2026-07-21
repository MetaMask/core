/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
import {
  BatchSellTradesResponse,
  BitcoinTradeData,
  ChainId,
  isBitcoinTrade,
  isEvmTxData,
  isNonEvmChainId,
  isStellarTrade,
  isTronTrade,
  StellarTradeData,
  Trade,
  TronTradeData,
  TxData,
} from '@metamask/bridge-controller';

import { submitBatchSellHandler } from './batch-sell-strategy';
import { submitBatchHandler } from './batch-strategy';
import { submitEvmHandler as defaultSubmitHandler } from './evm-strategy';
import { submitIntentHandler } from './intent-strategy';
import { submitNonEvmHandler } from './non-evm-strategy';
import type { SubmitStrategyParams, SubmitStepResult } from './types';

const validateParams = <
  TxDataType extends
    | BitcoinTradeData
    | StellarTradeData
    | TronTradeData
    | string
    | TxData,
>(
  params: SubmitStrategyParams<Trade>,
): params is SubmitStrategyParams<TxDataType> => {
  const txs = params.quoteResponses
    .flatMap((quoteResponse) => [
      quoteResponse.trade,
      quoteResponse.approval,
      quoteResponse.resetApproval,
    ])
    .filter((tx): tx is TxDataType => tx !== undefined);

  // Assumes all quotes are for the same chain
  switch (params.quoteResponses[0].quote.srcChainId) {
    case ChainId.SOLANA:
      return txs.every((tx) => typeof tx === 'string');
    case ChainId.BTC:
      return txs.every(isBitcoinTrade);
    case ChainId.STELLAR:
      return txs.every((tx) => typeof tx === 'string' || isStellarTrade(tx));
    case ChainId.TRON:
      return txs.every(isTronTrade);
    default:
      return txs.every(isEvmTxData);
  }
};

const validateBatchSellParams = (
  params: SubmitStrategyParams,
): params is SubmitStrategyParams<TxData, BatchSellTradesResponse> =>
  // A BatchSell payload containing at least 1 trade is considered valid
  Boolean(params.batchSellTrades) && params.quoteResponses.length >= 1;

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
  const {
    quoteResponses: [quoteResponse],
    isStxEnabled,
    isDelegatedAccount,
  } = params;

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

  // Batch sell transactions
  if (validateBatchSellParams(params)) {
    return submitBatchSellHandler(params);
  }

  // Batched transactions
  const shouldBatchTxs =
    isStxEnabled || quoteResponse.quote.gasIncluded7702 || isDelegatedAccount;
  if (shouldBatchTxs) {
    return submitBatchHandler(params);
  }

  // Non-stx/gasless EVM transactions
  return defaultSubmitHandler(params);
};

export default executeSubmitStrategy;
