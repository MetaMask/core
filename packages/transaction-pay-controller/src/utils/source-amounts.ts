import type {
  TransactionMeta,
  TransactionType,
} from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  PERPS_DEPOSIT_TYPES,
} from '../constants.js';
import type {
  TransactionPayControllerMessenger,
  TransactionPaymentToken,
} from '../index.js';
import { TransactionPayStrategy } from '../index.js';
import { projectLogger } from '../logger.js';
import type {
  GetBalanceCallback,
  GetBalanceResponse,
  TransactionPaySourceAmount,
  TransactionData,
  TransactionPayRequiredToken,
} from '../types.js';
import { getTokenFiatRate, isSameToken } from './token.js';
import { getTransaction } from './transaction.js';

const log = createModuleLogger(projectLogger, 'source-amounts');

/**
 * Update the source amounts for a transaction.
 *
 * @param transactionId - ID of the transaction to update.
 * @param transactionData - Existing transaction data.
 * @param messenger - Controller messenger.
 * @param getBalance - Optional callback to override the source balance used for max-amount
 * calculation. Called only when `isMaxAmount` is true. Return `undefined` to fall back to
 * the built-in token balance.
 */
export function updateSourceAmounts(
  transactionId: string,
  transactionData: TransactionData | undefined,
  messenger: TransactionPayControllerMessenger,
  getBalance?: GetBalanceCallback,
): void {
  if (!transactionData) {
    return;
  }

  const { isMaxAmount, isPostQuote, paymentToken, tokens } = transactionData;

  if (!tokens.length || !paymentToken) {
    return;
  }

  const transaction =
    getBalance && isMaxAmount
      ? getTransaction(transactionId, messenger)
      : undefined;
  const balanceOverride =
    getBalance && transaction
      ? getBalance({ transaction, transactionData })
      : undefined;

  // For post-quote flows, source amounts are calculated differently
  // The source is the transaction's required token, not the selected token
  if (isPostQuote) {
    const { isHyperliquidSource, isPolymarketDepositWallet } = transactionData;
    const sourceAmounts = calculatePostQuoteSourceAmounts(
      tokens,
      paymentToken,
      isMaxAmount ?? false,
      isHyperliquidSource,
      isPolymarketDepositWallet,
      balanceOverride,
    );
    log('Updated post-quote source amounts', { transactionId, sourceAmounts });
    transactionData.sourceAmounts = sourceAmounts;
    return;
  }

  const { isQuoteRequired } = transactionData;

  const sourceAmounts = tokens
    .map((singleToken) =>
      calculateSourceAmount(
        paymentToken,
        singleToken,
        messenger,
        transactionId,
        isMaxAmount ?? false,
        isQuoteRequired,
        balanceOverride,
      ),
    )
    .filter(Boolean) as TransactionPaySourceAmount[];

  log('Updated source amounts', { transactionId, sourceAmounts });

  transactionData.sourceAmounts = sourceAmounts;
}

/**
 * Calculate source amounts for post-quote flows.
 * In this flow, the required tokens ARE the source tokens,
 * and the payment token is the target (destination).
 *
 * @param tokens - Required tokens from the transaction.
 * @param paymentToken - Selected payment/destination token.
 * @param isMaxAmount - Whether the transaction is a maximum amount transaction.
 * @param isHyperliquidSource - Whether the source is HyperLiquid (perps withdrawal).
 * @param isPolymarketDepositWallet - Whether the source is a Polymarket deposit wallet.
 * @param balanceOverride - Optional balance override from the `getBalance` callback.
 * @returns Array of source amounts.
 */
function calculatePostQuoteSourceAmounts(
  tokens: TransactionPayRequiredToken[],
  paymentToken: TransactionPaymentToken,
  isMaxAmount: boolean,
  isHyperliquidSource?: boolean,
  isPolymarketDepositWallet?: boolean,
  balanceOverride?: GetBalanceResponse,
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

      // Skip same token on same chain, unless the source is a synthetic
      // upstream (HyperLiquid HyperCore or Polymarket deposit wallet) that
      // the strategy renormalizes to a different effective source.
      if (
        isSameToken(token, paymentToken) &&
        !isHyperliquidSource &&
        !isPolymarketDepositWallet
      ) {
        log('Skipping token as same as destination token');
        return false;
      }

      return true;
    })
    .map((token) => ({
      sourceAmountHuman: isMaxAmount ? token.balanceHuman : token.amountHuman,
      sourceAmountRaw: isMaxAmount
        ? (balanceOverride?.balanceRaw ?? token.balanceRaw)
        : token.amountRaw,
      sourceBalanceRaw: balanceOverride?.balanceRaw ?? token.balanceRaw,
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
 * @param isQuoteRequired - When true, a quote is always fetched even when source and target tokens are identical.
 * @param balanceOverride - Optional balance override from the `getBalance` callback.
 * @returns The source amount or undefined if calculation failed.
 */
function calculateSourceAmount(
  paymentToken: TransactionPaymentToken,
  token: TransactionPayRequiredToken,
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
  isMaxAmount: boolean,
  isQuoteRequired?: boolean,
  balanceOverride?: GetBalanceResponse,
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

  const { parentTransactionType, strategy } = getStrategyContext(
    transactionId,
    messenger,
  );
  const isAlwaysRequired = isQuoteAlwaysRequired(
    token,
    strategy,
    parentTransactionType,
    isQuoteRequired,
  );

  if (isSameToken(token, paymentToken) && !isAlwaysRequired) {
    log('Skipping token as same as payment token');
    return undefined;
  }

  if (token.amountRaw === '0') {
    log('Skipping token as zero amount', { tokenAddress: token.address });
    return undefined;
  }

  const sourceAmountHumanValue = new BigNumber(token.amountUsd).div(
    paymentTokenFiatRate.usdRate,
  );

  const sourceAmountHuman = sourceAmountHumanValue.toString(10);

  const sourceAmountRaw = sourceAmountHumanValue
    .shiftedBy(paymentToken.decimals)
    .toFixed(0);

  // On Max, use the exact source balance. The client `getBalance` callback is
  // authoritative and owns all balance complexity (perps, predict, money
  // account, payment overrides): when it returns a `balanceOverride`, use it;
  // when it returns `undefined`, that is a deliberate signal to use the pay
  // token's on-chain balance. This path is payment-override agnostic.
  if (isMaxAmount) {
    return {
      sourceAmountHuman: paymentToken.balanceHuman,
      sourceAmountRaw: balanceOverride?.balanceRaw ?? paymentToken.balanceRaw,
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
 * @param parentTransactionType - Parent transaction type, if available.
 * @param isQuoteRequired - When true, a quote is always fetched even when source and target tokens are identical.
 * @returns True if a quote is always required, false otherwise.
 */
function isQuoteAlwaysRequired(
  token: TransactionPayRequiredToken,
  strategy: TransactionPayStrategy,
  parentTransactionType?: TransactionType,
  isQuoteRequired?: boolean,
): boolean {
  if (isQuoteRequired) {
    return true;
  }

  const isHyperliquidDeposit =
    token.chainId === CHAIN_ID_ARBITRUM &&
    token.address.toLowerCase() === ARBITRUM_USDC_ADDRESS.toLowerCase();

  return (
    isHyperliquidDeposit &&
    (strategy === TransactionPayStrategy.Relay ||
      (strategy === TransactionPayStrategy.Across &&
        parentTransactionType !== undefined &&
        PERPS_DEPOSIT_TYPES.includes(parentTransactionType)))
  );
}

function getStrategyContext(
  transactionId: string,
  messenger: TransactionPayControllerMessenger,
): {
  parentTransactionType?: TransactionType;
  strategy: TransactionPayStrategy;
} {
  const transaction = getTransaction(
    transactionId,
    messenger,
  ) as TransactionMeta;

  return {
    parentTransactionType: transaction.type,
    strategy: messenger.call(
      'TransactionPayController:getStrategy',
      transaction,
    ),
  };
}
