import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger.js';
import type {
  PayStrategyExecuteRequest,
  QuoteRequest,
  TransactionPayQuote,
} from '../../types.js';
import {
  getFiatFeeReserveMultiplier,
  getFiatMaxRateDriftPercent,
} from '../../utils/feature-flags.js';
import { getTransaction, updateTransaction } from '../../utils/transaction.js';
import { getServerQuotes } from '../server/server-quotes.js';
import { submitServerQuotes } from '../server/server-submit.js';
import type { ServerQuote } from '../server/types.js';
import type { FiatQuote } from './types.js';
import { validateRelayRateDrift } from './utils.js';

const log = createModuleLogger(projectLogger, 'fiat-submit-calldata');

/**
 * Submits relay quotes using the three-phase flow for transactions with nested
 * calldata that needs re-encoding (e.g. moneyAccountDeposit with approve + deposit).
 *
 * Phase 1: Discovery quote (EXACT_INPUT) to learn the target token output.
 * Phase 2: Delegate calldata re-encoding to the client via getAmountData.
 * Phase 3: Delegation quote (EXACT_OUTPUT) with updated nested transaction data.
 *
 * @param options - The submission options.
 * @param options.baseRequest - The base quote request from the original fiat quote.
 * @param options.request - The original fiat strategy execute request.
 * @param options.sourceAmountRaw - The settled source amount in atomic units.
 * @param options.transaction - The transaction metadata.
 * @returns An object containing the relay transaction hash if available.
 */
export async function submitWithTransactionData({
  baseRequest,
  request,
  sourceAmountRaw,
  transaction,
}: {
  baseRequest: QuoteRequest;
  request: PayStrategyExecuteRequest<FiatQuote>;
  sourceAmountRaw: string;
  transaction: PayStrategyExecuteRequest<FiatQuote>['transaction'];
}): Promise<{ transactionHash?: Hex }> {
  const { messenger } = request;
  const transactionId = transaction.id;
  const originalRelayQuote = request.quotes[0].original.relayQuote;

  if (!originalRelayQuote) {
    throw new Error('Missing Relay quote');
  }

  const feeReserveRaw = calculateFeeReserve({
    feeQuote: request.quotes[0],
    multiplier: getFiatFeeReserveMultiplier(messenger),
  });

  const discoverySourceAmount = BigNumber.max(
    new BigNumber(sourceAmountRaw).minus(feeReserveRaw),
    1,
  ).toFixed(0);

  log('Fee reserve for discovery', {
    feeReserveRaw: feeReserveRaw.toFixed(0),
    discoverySourceAmount,
    sourceAmountRaw,
    transactionId,
  });

  const discoveryRequest: QuoteRequest = {
    ...baseRequest,
    isMaxAmount: false,
    isPostQuote: true,
    sourceBalanceRaw: sourceAmountRaw,
    sourceTokenAmount: discoverySourceAmount,
  };

  const discoveryQuotes = await getServerQuotes({
    accountSupports7702: request.accountSupports7702,
    from: baseRequest.from,
    messenger,
    requests: [discoveryRequest],
    transaction,
  });

  if (!discoveryQuotes.length) {
    throw new Error('No relay quotes returned for fiat discovery');
  }

  const discoveryRelay = discoveryQuotes[0];

  const adjustedTargetRaw = calculateAdjustedTarget(discoveryRelay);

  log('Adjusted target for final quote', {
    discoveryMinimum: discoveryRelay.original.output.raw,
    adjustedTargetRaw,
    transactionId,
  });

  const { updates } = await messenger.call(
    'TransactionPayController:getAmountData',
    { amount: adjustedTargetRaw, transaction },
  );

  if (!updates.length) {
    throw new Error(
      'getAmountData returned no updates for transaction with nested calldata',
    );
  }

  updateTransaction(
    { transactionId, messenger, note: 'Fiat deposit: update settled amount' },
    (tx) => {
      for (const { nestedTransactionIndex, data } of updates) {
        if (tx.nestedTransactions?.[nestedTransactionIndex]) {
          tx.nestedTransactions[nestedTransactionIndex].data = data;
        }
      }
      if (tx.requiredAssets?.[0]) {
        tx.requiredAssets[0].amount = `0x${new BigNumber(adjustedTargetRaw).toString(16)}`;
      }
    },
  );

  const updatedTransaction =
    getTransaction(transactionId, messenger) ?? transaction;

  const relayRequest: QuoteRequest = {
    ...baseRequest,
    isMaxAmount: false,
    isPostQuote: false,
    sourceBalanceRaw: sourceAmountRaw,
    sourceTokenAmount: sourceAmountRaw,
    targetAmountMinimum: adjustedTargetRaw,
  };

  const relayQuotes = await getServerQuotes({
    accountSupports7702: request.accountSupports7702,
    from: baseRequest.from,
    messenger,
    requests: [relayRequest],
    transaction: updatedTransaction,
  });

  if (!relayQuotes.length) {
    throw new Error('No relay quotes returned for completed fiat order');
  }

  validateRelayRateDrift({
    originalQuote: request.quotes[0],
    discoveryQuote: relayQuotes[0],
    maxRateDriftPercent: getFiatMaxRateDriftPercent(messenger),
    transactionId,
  });

  log('Received relay quotes for completed fiat order', {
    relayQuoteCount: relayQuotes.length,
    transactionId,
  });

  return await submitServerQuotes({
    accountSupports7702: request.accountSupports7702,
    isSmartTransaction: request.isSmartTransaction,
    messenger,
    quotes: relayQuotes,
    transaction: updatedTransaction,
  });
}

/**
 * Calculates the fee reserve in raw source token units from the original
 * relay fee quote. This reserve is subtracted from the discovery quote's
 * source amount so the final EXACT_OUTPUT quote stays within the settled
 * balance.
 *
 * @param options - Calculation options.
 * @param options.feeQuote - The original relay quote from the fee/quoting phase.
 * @param options.multiplier - Multiplier applied to the fee reserve (default 1).
 * @returns The fee reserve in raw source token units.
 */
function calculateFeeReserve({
  feeQuote,
  multiplier,
}: {
  feeQuote: TransactionPayQuote<unknown>;
  multiplier: number;
}): BigNumber {
  const sourceRaw = new BigNumber(feeQuote.sourceAmount.raw);
  const sourceUsd = new BigNumber(feeQuote.sourceAmount.usd);
  const feeUsd = sourceUsd.minus(feeQuote.targetAmount.usd);

  if (!sourceUsd.gt(0) || !sourceRaw.gt(0) || !feeUsd.gt(0)) {
    return new BigNumber(0);
  }

  const usdPerSourceRaw = sourceUsd.dividedBy(sourceRaw);

  return feeUsd
    .dividedBy(usdPerSourceRaw)
    .multipliedBy(multiplier)
    .decimalPlaces(0, BigNumber.ROUND_UP);
}

/**
 * Calculates the adjusted target amount for the final EXACT_OUTPUT quote
 * by adding the discovery quote's fee back to its minimum output.
 *
 * The discovery quote (EXACT_INPUT) reports a smaller fee than the final
 * EXACT_OUTPUT quote will charge. Adding the discovery fee back to the
 * minimum output compensates for this differential, ensuring the final
 * quote targets a realistic amount.
 *
 * @param discoveryQuote - The relay quote from the discovery phase.
 * @returns The adjusted target amount in raw target token units.
 */
function calculateAdjustedTarget(
  discoveryQuote: TransactionPayQuote<ServerQuote>,
): string {
  const targetMinRaw = new BigNumber(discoveryQuote.original.output.raw);
  const targetUsd = new BigNumber(discoveryQuote.targetAmount.usd);
  const sourceUsd = new BigNumber(discoveryQuote.sourceAmount.usd);

  if (!targetUsd.gt(0) || !targetMinRaw.gt(0)) {
    return targetMinRaw.toFixed(0);
  }

  // Discovery fee in USD
  const discoveryFeeUsd = sourceUsd.minus(targetUsd);

  if (!discoveryFeeUsd.gt(0)) {
    return targetMinRaw.toFixed(0);
  }

  // Convert fee from USD to raw target token units
  const usdPerTargetRaw = targetUsd.dividedBy(targetMinRaw);
  const discoveryFeeInTargetRaw = discoveryFeeUsd
    .dividedBy(usdPerTargetRaw)
    .decimalPlaces(0, BigNumber.ROUND_DOWN);

  const adjusted = targetMinRaw.plus(discoveryFeeInTargetRaw);

  log('Adjusted target', {
    targetMinRaw: targetMinRaw.toFixed(0),
    discoveryFeeUsd: discoveryFeeUsd.toFixed(6),
    discoveryFeeInTargetRaw: discoveryFeeInTargetRaw.toFixed(0),
    adjustedTargetRaw: adjusted.toFixed(0),
  });

  return adjusted.toFixed(0);
}
