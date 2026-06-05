import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger';
import type { PayStrategyExecuteRequest, QuoteRequest } from '../../types';
import {
  getFiatFeeReserveMultiplier,
  getFiatMaxRateDriftPercent,
} from '../../utils/feature-flags';
import { getNetworkClientId } from '../../utils/provider';
import { getTransaction, updateTransaction } from '../../utils/transaction';
import { getRelayQuotes } from '../relay/relay-quotes';
import { submitRelayQuotes } from '../relay/relay-submit';
import type { RelayQuote } from '../relay/types';
import type { FiatQuote } from './types';
import { validateRelayRateDrift } from './utils';

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
export async function submitWithCalldataReEncoding({
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

  const feeReserveRaw = calculateFeeReserve({
    feeQuote: request.quotes[0].original.relayQuote,
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

  const discoveryQuotes = await getRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    messenger,
    requests: [discoveryRequest],
    transaction,
  });

  if (!discoveryQuotes.length) {
    throw new Error('No relay quotes returned for fiat discovery');
  }

  const discoveryRelay = discoveryQuotes[0].original;

  const originalRelayQuote = request.quotes[0].original.relayQuote;
  validateRelayRateDrift({
    originalQuote: originalRelayQuote,
    discoveryQuote: discoveryRelay,
    maxRateDriftPercent: getFiatMaxRateDriftPercent(messenger),
    transactionId,
  });

  const adjustedTargetRaw = calculateAdjustedTarget(discoveryRelay);

  log('Adjusted target for final quote', {
    discoveryMinimum: discoveryRelay.details.currencyOut.minimumAmount,
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

  // The transaction's chainId is the target chain (e.g. Monad 0x8f), but the
  // relay deposit executes on the source chain (e.g. Ethereum 0x1).
  // Override chainId and networkClientId so that processTransactions /
  // getDelegationTransaction operate on the correct (source) chain.
  const { sourceChainId } = baseRequest;
  const sourceNetworkClientId = getNetworkClientId(messenger, sourceChainId);

  const relayQuotes = await getRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    messenger,
    requests: [relayRequest],
    transaction: {
      ...updatedTransaction,
      chainId: sourceChainId,
      networkClientId: sourceNetworkClientId,
    },
  });

  if (!relayQuotes.length) {
    throw new Error('No relay quotes returned for completed fiat order');
  }

  log('Received relay quotes for completed fiat order', {
    relayQuoteCount: relayQuotes.length,
    transactionId,
  });

  return await submitRelayQuotes({
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
  feeQuote: RelayQuote;
  multiplier: number;
}): BigNumber {
  const sourceRaw = new BigNumber(feeQuote.details.currencyIn.amount);
  const sourceUsd = new BigNumber(feeQuote.details.currencyIn.amountUsd);
  const targetUsd = new BigNumber(feeQuote.details.currencyOut.amountUsd);

  if (!sourceUsd.gt(0) || !sourceRaw.gt(0)) {
    return new BigNumber(0);
  }

  // Fee in USD = what the relay consumed beyond the target value
  const feeUsd = sourceUsd.minus(targetUsd);

  if (!feeUsd.gt(0)) {
    return new BigNumber(0);
  }

  // Convert USD fee to raw source token units using the quote's own rate
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
function calculateAdjustedTarget(discoveryQuote: RelayQuote): string {
  const targetMinRaw = new BigNumber(
    discoveryQuote.details.currencyOut.minimumAmount,
  );
  const targetUsd = new BigNumber(discoveryQuote.details.currencyOut.amountUsd);
  const sourceUsd = new BigNumber(discoveryQuote.details.currencyIn.amountUsd);

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

  log('calculateAdjustedTarget', {
    targetMinRaw: targetMinRaw.toFixed(0),
    discoveryFeeUsd: discoveryFeeUsd.toFixed(6),
    discoveryFeeInTargetRaw: discoveryFeeInTargetRaw.toFixed(0),
    adjustedTargetRaw: adjusted.toFixed(0),
  });

  return adjusted.toFixed(0);
}
