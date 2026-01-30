import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getStrategyByName } from './strategy';
import { getTokenFiatRate } from './token';
import { getTransaction } from './transaction';
import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  TransactionPayStrategy,
} from '../constants';
import { projectLogger } from '../logger';
import type {
  PayStrategyGetQuotesRequest,
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPaymentToken,
  TransactionPayRequiredToken,
  TransactionPaySourceAmount,
} from '../types';

const log = createModuleLogger(projectLogger, 'source-amounts');

/**
 * Update the source amounts for a transaction.
 *
 * @param transactionId - ID of the transaction to update.
 * @param transactionData - Existing transaction data.
 * @param messenger - Controller messenger.
 */
export function updateSourceAmounts(
  transactionId: string,
  transactionData: TransactionData | undefined,
  messenger: TransactionPayControllerMessenger,
): void {
  if (!transactionData) {
    return;
  }

  const { isMaxAmount, paymentToken, tokens } = transactionData;

  if (!tokens.length || !paymentToken) {
    return;
  }

  const strategy = getStrategyType(
    transactionId,
    paymentToken,
    tokens,
    isMaxAmount ?? false,
    messenger,
  );

  const sourceAmounts = tokens
    .map((singleToken) =>
      calculateSourceAmount(
        paymentToken,
        singleToken,
        messenger,
        isMaxAmount ?? false,
        strategy,
      ),
    )
    .filter(Boolean) as TransactionPaySourceAmount[];

  log('Updated source amounts', { transactionId, sourceAmounts });

  transactionData.sourceAmounts = sourceAmounts;
}

/**
 * Calculate the required source amount for a payment token to cover a target token.
 *
 * @param paymentToken - Selected payment token.
 * @param token - Target token to cover.
 * @param messenger - Controller messenger.
 * @param isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @param strategy - Payment strategy.
 * @returns The source amount or undefined if calculation failed.
 */
function calculateSourceAmount(
  paymentToken: TransactionPaymentToken,
  token: TransactionPayRequiredToken,
  messenger: TransactionPayControllerMessenger,
  isMaxAmount: boolean,
  strategy: TransactionPayStrategy,
): TransactionPaySourceAmount | undefined {
  const paymentTokenFiatRate = getTokenFiatRate(
    messenger,
    paymentToken.address,
    paymentToken.chainId,
  );

  if (!paymentTokenFiatRate) {
    return undefined;
  }

  const hasBalance = new BigNumber(token.balanceRaw).gte(token.amountRaw);

  if (token.skipIfBalance && hasBalance) {
    log('Skipping token as sufficient balance', {
      tokenAddress: token.address,
    });
    return undefined;
  }

  const isSameTokenSelected =
    token.address.toLowerCase() === paymentToken.address.toLowerCase() &&
    token.chainId === paymentToken.chainId;

  const isAlwaysRequired = isQuoteAlwaysRequired(token, strategy);

  if (isSameTokenSelected && !isAlwaysRequired) {
    log('Skipping token as same as payment token');
    return undefined;
  }

  const sourceAmountHumanValue = new BigNumber(token.amountUsd).div(
    paymentTokenFiatRate.usdRate,
  );

  const sourceAmountHuman = sourceAmountHumanValue.toString(10);

  const sourceAmountRaw = sourceAmountHumanValue
    .shiftedBy(paymentToken.decimals)
    .toFixed(0);

  if (token.amountRaw === '0') {
    log('Skipping token as zero amount', { tokenAddress: token.address });
    return undefined;
  }

  if (isMaxAmount) {
    return {
      sourceAmountHuman: paymentToken.balanceHuman,
      sourceAmountRaw: paymentToken.balanceRaw,
      targetTokenAddress: token.address,
    };
  }

  return {
    sourceAmountHuman,
    sourceAmountRaw,
    targetTokenAddress: token.address,
  };
}

/**
 * Determine if a quote is always required for a token and strategy.
 *
 * @param token - Target token.
 * @param strategy - Payment strategy.
 * @returns True if a quote is always required, false otherwise.
 */
function isQuoteAlwaysRequired(
  token: TransactionPayRequiredToken,
  strategy: TransactionPayStrategy,
): boolean {
  const isHyperliquidDeposit =
    token.chainId === CHAIN_ID_ARBITRUM &&
    token.address.toLowerCase() === ARBITRUM_USDC_ADDRESS.toLowerCase();

  return strategy === TransactionPayStrategy.Relay && isHyperliquidDeposit;
}

/**
 * Get the strategy type for a transaction.
 *
 * @param transactionId - ID of the transaction.
 * @param paymentToken - Selected payment token.
 * @param tokens - Tokens required by the transaction.
 * @param isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @param messenger - Controller messenger.
 * @returns Payment strategy type.
 */
function getStrategyType(
  transactionId: string,
  paymentToken: TransactionPaymentToken,
  tokens: TransactionPayRequiredToken[],
  isMaxAmount: boolean,
  messenger: TransactionPayControllerMessenger,
): TransactionPayStrategy {
  const transaction = getTransaction(transactionId, messenger);

  if (!transaction) {
    return TransactionPayStrategy.Relay;
  }

  const from = transaction.txParams.from as Hex;

  const requests = tokens.map((singleToken) => ({
    from,
    isMaxAmount,
    sourceBalanceRaw: paymentToken.balanceRaw,
    sourceChainId: paymentToken.chainId,
    sourceTokenAddress: paymentToken.address,
    sourceTokenAmount: singleToken.amountRaw,
    targetAmountMinimum: singleToken.allowUnderMinimum
      ? '0'
      : singleToken.amountRaw,
    targetChainId: singleToken.chainId,
    targetTokenAddress: singleToken.address,
  }));

  const request = {
    messenger,
    requests,
    transaction,
  } as PayStrategyGetQuotesRequest;

  const strategyOrder =
    messenger.call('TransactionPayController:getStrategies', transaction) ?? [];

  for (const strategyName of strategyOrder) {
    try {
      const strategy = getStrategyByName(strategyName);
      if (!strategy.supports || strategy.supports(request)) {
        return strategyName;
      }
    } catch {
      continue;
    }
  }

  return strategyOrder[0] ?? TransactionPayStrategy.Relay;
}
