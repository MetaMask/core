import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger';
import type {
  PayStrategyExecuteRequest,
  QuoteRequest,
  TransactionConfig,
} from '../../types';
import {
  getFiatFeeReserveMultiplier,
  getFiatMaxRateDriftPercent,
} from '../../utils/feature-flags';
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
 * @param options.signerOverride - Optional address to use as the relay quote
 * `user`/`from` for BOTH the discovery and final quotes, overriding
 * `baseRequest.from`. `recipient` is left untouched so Relay does not reject
 * the quote with `Sender and recipient cannot be the same`. Used by the
 * direct mUSD → Money Account flow where the originally-quoted EOA cannot
 * sign the relay leg (zero native balance) but the Money Account can (it is
 * EIP-7702-sponsored on Monad). Leaving this undefined preserves the
 * original EOA-signed behaviour for Perps / Predict / non-mUSD deposits.
 * @param options.sourceAmountRaw - The settled source amount in atomic units.
 * @param options.transaction - The transaction metadata.
 * @returns An object containing the relay transaction hash if available.
 */
export async function submitWithTransactionData({
  baseRequest,
  request,
  signerOverride,
  sourceAmountRaw,
  transaction,
}: {
  baseRequest: QuoteRequest;
  request: PayStrategyExecuteRequest<FiatQuote>;
  signerOverride?: Hex;
  sourceAmountRaw: string;
  transaction: PayStrategyExecuteRequest<FiatQuote>['transaction'];
}): Promise<{ transactionHash?: Hex }> {
  const { messenger } = request;
  const transactionId = transaction.id;

  // `getSingleQuote` reads `from` off the per-request QuoteRequest
  // (see relay-quotes.ts → body.user). Apply the override to both the
  // discovery and final quotes so the entire relay flow is signed by the
  // override account, not the original EOA. `recipient` is intentionally
  // not overridden: setting it equal to `user` makes Relay reject the quote
  // with `Sender and recipient cannot be the same for 'send' transactions`.
  const effectiveFrom = signerOverride ?? baseRequest.from;

  // Required for directMusd: flips `transactionData.isPostQuote = true` so the
  // mobile paymentoverride callback returns the 7702-wrapped approve + Teller.deposit
  // calls that `processMoneyAccountPostQuote` writes into `body.txs[]`. Without
  // this, `body.txs[]` stays empty → Relay 400 (`user === recipient`) or
  // MoneyAccount echoed as the on-chain signer (0 MON → "insufficient balance").
  if (signerOverride) {
    // eslint-disable-next-line no-console
    console.log(
      'OGP- submitWithTransactionData: flipping isPostQuote=true AND paymentOverride=moneyAccount',
      {
        transactionId,
        signerOverride,
        baseRequestFrom: baseRequest.from,
        baseRequestRecipient: baseRequest.recipient,
        baseRequestPaymentOverride: baseRequest.paymentOverride,
      },
    );
    messenger.call(
      'TransactionPayController:setTransactionConfig',
      transactionId,
      (config: TransactionConfig) => {
        config.isPostQuote = true;
        config.paymentOverride = baseRequest.paymentOverride;
      },
    );
  }

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
    from: effectiveFrom,
    isMaxAmount: false,
    isPostQuote: true,
    sourceBalanceRaw: sourceAmountRaw,
    sourceTokenAmount: discoverySourceAmount,
  };

  const discoveryQuotes = await getRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    from: effectiveFrom,
    messenger,
    requests: [discoveryRequest],
    transaction,
  });

  if (!discoveryQuotes.length) {
    throw new Error('No relay quotes returned for fiat discovery');
  }

  const discoveryRelay = discoveryQuotes[0].original;

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
    from: effectiveFrom,
    isMaxAmount: false,
    isPostQuote: false,
    sourceBalanceRaw: sourceAmountRaw,
    sourceTokenAmount: sourceAmountRaw,
    targetAmountMinimum: adjustedTargetRaw,
  };

  const relayQuotes = await getRelayQuotes({
    accountSupports7702: request.accountSupports7702,
    from: effectiveFrom,
    messenger,
    requests: [relayRequest],
    transaction: updatedTransaction,
  });

  if (!relayQuotes.length) {
    throw new Error('No relay quotes returned for completed fiat order');
  }

  const originalRelayQuote = request.quotes[0].original.relayQuote;
  validateRelayRateDrift({
    originalQuote: originalRelayQuote,
    discoveryQuote: relayQuotes[0].original,
    maxRateDriftPercent: getFiatMaxRateDriftPercent(messenger),
    transactionId,
  });

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
  const rawImpact = new BigNumber(feeQuote.details.totalImpact.usd);
  const feeUsd = rawImpact.isNegative() ? rawImpact.abs() : new BigNumber(0);

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

  log('Adjusted target', {
    targetMinRaw: targetMinRaw.toFixed(0),
    discoveryFeeUsd: discoveryFeeUsd.toFixed(6),
    discoveryFeeInTargetRaw: discoveryFeeInTargetRaw.toFixed(0),
    adjustedTargetRaw: adjusted.toFixed(0),
  });

  return adjusted.toFixed(0);
}
