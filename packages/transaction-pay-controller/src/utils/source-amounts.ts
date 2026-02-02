import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { getTokenFiatRate, isSameToken } from './token';
import { getTransaction } from './transaction';
import type {
  TransactionPayControllerMessenger,
  TransactionPaymentToken,
} from '..';
import { TransactionPayStrategy } from '..';
import type { TransactionMeta } from '../../../transaction-controller/src';
import { ARBITRUM_USDC_ADDRESS, CHAIN_ID_ARBITRUM } from '../constants';
import { projectLogger } from '../logger';
import type {
  TransactionPaySourceAmount,
  TransactionData,
  TransactionPayRequiredToken,
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

  const { isMaxAmount, isPostQuote, paymentToken, tokens } = transactionData;

  if (!tokens.length || !paymentToken) {
    return;
  }

  // For post-quote (withdrawal) flows, source amounts are calculated differently
  // The source is the transaction's required token, not the selected token
  if (isPostQuote) {
    const sourceAmounts = calculatePostQuoteSourceAmounts(
      tokens,
      paymentToken,
      isMaxAmount ?? false,
    );
    log('Updated post-quote source amounts', { transactionId, sourceAmounts });
    transactionData.sourceAmounts = sourceAmounts;
    return;
  }

  const sourceAmounts = tokens
    .map((singleToken) =>
      calculateSourceAmount(
        paymentToken,
        singleToken,
        messenger,
        transactionId,
        isMaxAmount ?? false,
      ),
    )
    .filter(Boolean) as TransactionPaySourceAmount[];

  log('Updated source amounts', { transactionId, sourceAmounts });

  transactionData.sourceAmounts = sourceAmounts;
}

/**
 * Calculate source amounts for post-quote (withdrawal) flows.
 * In this flow, the required tokens ARE the source tokens,
 * and the payment token is the target (destination).
 *
 * @param tokens - Required tokens from the transaction.
 * @param paymentToken - Selected payment/destination token.
 * @param isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @returns Array of source amounts.
 */
function calculatePostQuoteSourceAmounts(
  tokens: TransactionPayRequiredToken[],
  paymentToken: TransactionPaymentToken,
  isMaxAmount: boolean,
): TransactionPaySourceAmount[] {
  return tokens
    .filter((token) => {
      if (token.skipIfBalance) {
        return false;
      }

      // Skip zero amounts (unless max amount, where we use balance)
      if (token.amountRaw === '0' && !isMaxAmount) {
        log('Skipping token as zero amount', { tokenAddress: token.address });
        return false;
      }

      // Skip same token on same chain
      if (isSameToken(token, paymentToken)) {
        log('Skipping token as same as destination token');
        return false;
      }

      return true;
    })
    .map((token) => ({
      sourceAmountHuman: isMaxAmount ? token.balanceHuman : token.amountHuman,
      sourceAmountRaw: isMaxAmount ? token.balanceRaw : token.amountRaw,
      sourceBalanceRaw: token.balanceRaw,
      sourceChainId: token.chainId,
      sourceTokenAddress: token.address,
      targetTokenAddress: paymentToken.address,
    }));
}

/**
 * Calculate the required source amount for a payment token to cover a target token.
 *
 * @param paymentToken - Selected payment token.
 * @param token - Target token to cover.
 * @param messenger - Controller messenger.
 * @param transactionId - ID of the transaction.
 * @param isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @returns The source amount or undefined if calculation failed.
 */
function calculateSourceAmount(
  paymentToken: TransactionPaymentToken,
  token: TransactionPayRequiredToken,
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
  isMaxAmount: boolean,
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

  const strategy = getStrategyType(transactionId, messenger);
  const isAlwaysRequired = isQuoteAlwaysRequired(token, strategy);

  if (isSameToken(token, paymentToken) && !isAlwaysRequired) {
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
 * @param messenger - Controller messenger.
 * @returns Payment strategy type.
 */
function getStrategyType(
  transactionId: string,
  messenger: TransactionPayControllerMessenger,
): TransactionPayStrategy {
  const transaction = getTransaction(
    transactionId,
    messenger,
  ) as TransactionMeta;

  return messenger.call('TransactionPayController:getStrategy', transaction);
}
