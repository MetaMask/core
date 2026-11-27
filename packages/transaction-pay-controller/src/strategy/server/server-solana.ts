import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Base58 } from '@metamask/transaction-controller';
import { createModuleLogger, parseCaipAssetType } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { projectLogger } from '../../logger.js';
import type {
  Amount,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import { getServerPollingInterval } from '../../utils/feature-flags.js';
import {
  compileSolanaTransaction,
  computeSolanaFeeRaw,
  getSolanaNativeAssetId,
  getSolanaRentReserveRaw,
  getSolanaSource,
  isSolanaNativeRequest,
  signAndSendSolanaTransaction,
  SOLANA_DECIMALS,
  waitForSolanaTransactionConfirmed,
} from '../../utils/solana.js';
import type { SolanaSource } from '../../utils/solana.js';
import {
  getAssetBalance,
  getAssetFiatRate,
  getAssetInfo,
} from '../../utils/token.js';
import { updateTransaction } from '../../utils/transaction.js';
import { QuoteError } from '../../utils/validation.js';
import type {
  ServerQuote,
  ServerSolanaQuote,
  ServerSolanaTransactionStep,
} from './types.js';

const log = createModuleLogger(projectLogger, 'server-solana');

/** Network cost of a Solana-source server quote. */
export type ServerSolanaNetworkCost = {
  /** Network fee in the native asset, priced in fiat. */
  fee: Amount;

  /** Solana details to store on the quote. */
  solana: ServerSolanaQuote;
};

/**
 * Get the network fee and rent reserve of a Solana-source quote by compiling
 * its transaction step and asking the account Snap for the fee.
 *
 * @param request - Cost request.
 * @param request.messenger - Controller messenger.
 * @param request.quoteRequest - Solana quote request.
 * @param request.steps - Steps of the server quote.
 * @returns The network fee and rent reserve.
 */
export async function getServerSolanaNetworkCost({
  messenger,
  quoteRequest,
  steps,
}: {
  messenger: TransactionPayControllerMessenger;
  quoteRequest: QuoteRequest;
  steps: ServerQuote['steps'];
}): Promise<ServerSolanaNetworkCost> {
  const source = getSolanaSource(messenger, quoteRequest);

  const { transaction } = await compileSolanaTransaction({
    messenger,
    source,
    transaction: getSolanaTransactionStep(steps),
  });

  const [feeRaw, rentReserveRaw] = await Promise.all([
    computeSolanaFeeRaw(messenger, source, transaction),
    getSolanaRentReserveRaw(messenger, source),
  ]);

  return {
    fee: getNativeAmount(messenger, source, feeRaw),
    solana: { feeRaw, rentReserveRaw },
  };
}

/**
 * Re-quote a native SOL max quote with the network fee and rent reserve
 * withheld from the balance, so the provider never receives a fee-free max.
 * Re-quotes once more if the re-quoted transaction costs a higher fee.
 *
 * @param quote - Max quote for the whole balance.
 * @param requote - Fetch a quote from the same provider for a source amount.
 * @returns The max quote, or the original quote when the balance cannot cover
 * the fee and reserve, so balance validation reports the shortfall.
 */
export async function requoteServerSolanaMax(
  quote: TransactionPayQuote<ServerQuote>,
  requote: (
    sourceTokenAmount: string,
  ) => Promise<TransactionPayQuote<ServerQuote>>,
): Promise<TransactionPayQuote<ServerQuote>> {
  const firstAmount = getMaxAmountRaw(quote);

  if (!firstAmount) {
    return quote;
  }

  const maxQuote = await requote(firstAmount);

  if (!isHigherFee(maxQuote, quote)) {
    return maxQuote;
  }

  log('Re-quoting Solana max with the higher fee', {
    feeRaw: getSolanaQuote(maxQuote).feeRaw,
  });

  const secondAmount = getMaxAmountRaw(maxQuote);

  return secondAmount ? await requote(secondAmount) : maxQuote;
}

/**
 * Throw if the source account cannot cover a Solana-source quote.
 *
 * Native SOL must cover the source amount, network fee and rent reserve. SPL
 * sources must cover the token amount, plus native SOL for the network fee
 * and rent reserve.
 *
 * @param messenger - Controller messenger.
 * @param quotes - Solana-source quotes.
 */
export function validateServerSolanaBalance(
  messenger: TransactionPayControllerMessenger,
  quotes: TransactionPayQuote<ServerQuote>[],
): void {
  for (const quote of quotes) {
    const detail = getShortfallDetail(messenger, quote);

    if (detail.length) {
      throw new QuoteError(
        {
          detail,
          message: 'Insufficient Solana balance for quote',
          reason: 'insufficient-source-balance',
        },
        quotes,
      );
    }
  }
}

/**
 * Sign and broadcast the Solana transaction step of a server quote, then wait
 * until it is confirmed.
 *
 * The transaction is recompiled with a fresh blockhash right before the single
 * Snap request, so it never expires while the user is confirming.
 *
 * @param quote - Solana-source server quote.
 * @param messenger - Controller messenger.
 * @param transaction - Original transaction meta.
 */
export async function submitServerSolanaTransaction(
  quote: TransactionPayQuote<ServerQuote>,
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta,
): Promise<void> {
  const source = getSolanaSource(messenger, quote.request);

  const { lastValidBlockHeight, transaction: unsignedTransaction } =
    await compileSolanaTransaction({
      messenger,
      source,
      transaction: getSolanaTransactionStep(quote.original.steps),
    });

  const signature = await signAndSendSolanaTransaction(
    messenger,
    source,
    unsignedTransaction,
  );

  log('Submitted Solana source transaction', { signature });

  updateTransaction(
    {
      transactionId: transaction.id,
      messenger,
      note: 'Add source hash from Solana source transaction',
    },
    (tx) => {
      tx.metamaskPay ??= {};
      tx.metamaskPay.sourceHash = signature;
    },
  );

  await waitForSolanaTransactionConfirmed({
    lastValidBlockHeight,
    messenger,
    pollingInterval: getServerPollingInterval(messenger),
    scope: source.scope,
    signature,
  });

  log('Solana source transaction confirmed', { signature });
}

/**
 * Get the Solana source address of a quote request, used as the quote sender
 * and refund address.
 *
 * @param messenger - Controller messenger.
 * @param quoteRequest - Solana quote request.
 * @returns The base58 source address.
 */
export function getServerSolanaSender(
  messenger: TransactionPayControllerMessenger,
  quoteRequest: QuoteRequest,
): Base58 {
  return getSolanaSource(messenger, quoteRequest).address;
}

function getMaxAmountRaw(
  quote: TransactionPayQuote<ServerQuote>,
): string | undefined {
  const { feeRaw, rentReserveRaw } = getSolanaQuote(quote);

  const amount = new BigNumber(quote.request.sourceBalanceRaw)
    .minus(feeRaw)
    .minus(rentReserveRaw);

  return amount.gt(0) ? amount.toFixed(0) : undefined;
}

function isHigherFee(
  quote: TransactionPayQuote<ServerQuote>,
  previousQuote: TransactionPayQuote<ServerQuote>,
): boolean {
  return new BigNumber(getSolanaQuote(quote).feeRaw).gt(
    getSolanaQuote(previousQuote).feeRaw,
  );
}

function getSolanaQuote(
  quote: TransactionPayQuote<ServerQuote>,
): ServerSolanaQuote {
  return quote.original.solana as ServerSolanaQuote;
}

function getSolanaTransactionStep(
  steps: ServerQuote['steps'],
): ServerSolanaTransactionStep {
  const solanaSteps = steps.filter(
    (step): step is ServerSolanaTransactionStep =>
      step.type === 'solanaTransaction',
  );

  if (solanaSteps.length !== 1 || solanaSteps.length !== steps.length) {
    throw new Error('Server quote must have a single Solana transaction step');
  }

  return solanaSteps[0];
}

function getShortfallDetail(
  messenger: TransactionPayControllerMessenger,
  quote: TransactionPayQuote<ServerQuote>,
): string[] {
  const { request, sourceAmount } = quote;
  const { feeRaw, rentReserveRaw } = getSolanaQuote(quote);
  const isNative = isSolanaNativeRequest(request);
  const reserve = new BigNumber(feeRaw).plus(rentReserveRaw);

  const requiredSource = isNative
    ? reserve.plus(sourceAmount.raw)
    : new BigNumber(sourceAmount.raw);

  const sourceShortfall = BigNumber.maximum(
    requiredSource.minus(request.sourceBalanceRaw),
    0,
  );

  const nativeShortfall = isNative
    ? new BigNumber(0)
    : BigNumber.maximum(
        reserve.minus(
          getAssetBalance(
            messenger,
            getSolanaSource(messenger, request).accountId,
            getSolanaNativeAssetId(
              parseCaipAssetType(request.sourceAssetId).chainId,
            ),
          ),
        ),
        0,
      );

  if (sourceShortfall.isZero() && nativeShortfall.isZero()) {
    return [];
  }

  const sourceInfo = getAssetInfo(messenger, request.sourceAssetId);

  const toSol = (raw: BigNumber.Value): string =>
    `${new BigNumber(raw).shiftedBy(-SOLANA_DECIMALS).toFixed()} SOL`;

  const toSource = (raw: BigNumber): string =>
    sourceInfo
      ? `${raw.shiftedBy(-sourceInfo.decimals).toFixed()} ${sourceInfo.symbol}`
      : raw.toFixed();

  return [
    `Network fee: ${toSol(feeRaw)}`,
    `Rent reserve: ${toSol(rentReserveRaw)}`,
    ...(nativeShortfall.gt(0)
      ? [`Missing native: ${toSol(nativeShortfall)}`]
      : []),
    ...(sourceShortfall.gt(0)
      ? [`Missing source: ${toSource(sourceShortfall)}`]
      : []),
  ];
}

function getNativeAmount(
  messenger: TransactionPayControllerMessenger,
  source: SolanaSource,
  raw: string,
): Amount {
  const fiatRates = getAssetFiatRate(
    messenger,
    getSolanaNativeAssetId(source.scope),
  );

  if (!fiatRates) {
    throw new Error('Solana native fiat rate not found');
  }

  const human = new BigNumber(raw).shiftedBy(-SOLANA_DECIMALS);

  return {
    fiat: human.multipliedBy(fiatRates.fiatRate).toString(10),
    human: human.toString(10),
    raw,
    usd: human.multipliedBy(fiatRates.usdRate).toString(10),
  };
}
