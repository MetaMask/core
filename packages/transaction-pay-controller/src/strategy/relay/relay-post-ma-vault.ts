import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../../logger';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { submitMoneyAccountVaultDeposit } from '../../utils/ma-vault-deposit';
import {
  getTransferredAmountFromTxHash,
  isPerpsWithdrawTransaction,
  isPredictWithdrawTransaction,
} from '../../utils/transaction';
import { MUSD_MONAD_FIAT_ASSET } from '../fiat/constants';
import { isMoneyAccountDepositTransaction } from '../fiat/utils';
import { FALLBACK_HASH } from './constants';
import type { RelayCompletionOutcome, RelayQuote } from './types';

const log = createModuleLogger(projectLogger, 'relay-post-ma-vault');

/**
 * Whether a quote must settle into the Money Account vault via a post-Relay
 * vault deposit (Relay lands mUSD on the Money Account, then a separate
 * sponsored deposit mints vmUSD) instead of embedding the deposit atomically.
 *
 * Two cases, both keyed on transaction type (resolving nested batch types):
 * - Crypto/fiat Money Account deposits, but only for max amount — non-max
 *   deposits embed a fixed-amount vault batch (EXACT_OUTPUT).
 * - Perps/Predict withdraws whose destination is mUSD on Monad. These are
 *   EXACT_INPUT post-quote flows whose settled mUSD is only known after Relay
 *   completes, so they always use the post-Relay deposit.
 *
 * @param request - The quote request to test.
 * @param transaction - The parent transaction metadata.
 * @returns True when the quote uses the post-Relay Money Account vault deposit.
 */
export function usesPostRelayMoneyAccountVaultDeposit(
  request: QuoteRequest,
  transaction: TransactionMeta,
): boolean {
  if (
    Boolean(request.isMaxAmount) &&
    isMoneyAccountDepositTransaction(transaction)
  ) {
    return true;
  }

  return (
    (isPerpsWithdrawTransaction(transaction) ||
      isPredictWithdrawTransaction(transaction)) &&
    request.targetChainId === MUSD_MONAD_FIAT_ASSET.chainId &&
    request.targetTokenAddress.toLowerCase() ===
      MUSD_MONAD_FIAT_ASSET.address.toLowerCase()
  );
}

/**
 * Runs the Money Account vault deposit after a max-amount Relay bridge has
 * settled mUSD into the Money Account. Resolves the actually-settled amount,
 * then delegates to the shared `submitMoneyAccountVaultDeposit` util.
 *
 * @param options - Submit options.
 * @param options.completion - Outcome of `waitForRelayCompletion`.
 * @param options.messenger - Controller messenger.
 * @param options.quote - The Relay quote that was submitted.
 * @param options.transaction - Original Money Account transaction meta.
 * @returns Hash of the final submitted child transaction, if available.
 */
export async function submitPostRelayVaultDeposit({
  completion,
  messenger,
  quote,
  transaction,
}: {
  completion: RelayCompletionOutcome;
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  transaction: TransactionMeta;
}): Promise<{ transactionHash?: Hex }> {
  const sourceAmountRaw = await resolvePostRelayAmount({
    completion,
    messenger,
    quote,
    transaction,
  });

  log('Submitting post-Relay vault deposit', {
    sourceAmountRaw,
    targetHash: completion.targetHash,
    transactionId: transaction.id,
  });

  return submitMoneyAccountVaultDeposit({
    messenger,
    sourceAmountRaw,
    transaction,
    // This is intentionally set to false, turning this on will leverage
    // CHOMP usage for vault deposits.
    vaultDisabled: false,
  });
}

/**
 * Resolves the actual mUSD amount that landed in the Money Account after a
 * Relay bridge to Monad. Prefers the on-chain Transfer log on
 * `completion.targetHash`; falls back to the Relay quote's minimum output
 * when the target hash is the same-chain `FALLBACK_HASH` placeholder or the
 * on-chain read fails.
 *
 * @param options - Resolution options.
 * @param options.completion - Outcome of `waitForRelayCompletion`.
 * @param options.messenger - Controller messenger.
 * @param options.quote - The Relay quote that was submitted.
 * @param options.transaction - Original Money Account transaction meta.
 * @returns The raw (atomic) settled mUSD amount as a decimal string.
 */
async function resolvePostRelayAmount({
  completion,
  messenger,
  quote,
  transaction,
}: {
  completion: RelayCompletionOutcome;
  messenger: TransactionPayControllerMessenger;
  quote: TransactionPayQuote<RelayQuote>;
  transaction: TransactionMeta;
}): Promise<string> {
  const moneyAccountAddress = (quote.request.recipient ??
    quote.request.from ??
    transaction.txParams.from) as Hex | undefined;

  if (
    moneyAccountAddress &&
    completion.targetHash &&
    completion.targetHash !== FALLBACK_HASH
  ) {
    try {
      const { amountRaw: onChainAmount } = await getTransferredAmountFromTxHash(
        {
          messenger,
          txHash: completion.targetHash,
          chainId: MUSD_MONAD_FIAT_ASSET.chainId,
          tokenAddress: MUSD_MONAD_FIAT_ASSET.address,
          walletAddress: moneyAccountAddress,
        },
      );

      if (onChainAmount) {
        log('Resolved post-Relay amount from on-chain transaction', {
          targetHash: completion.targetHash,
          onChainAmount,
        });
        return onChainAmount;
      }
    } catch (error) {
      log(
        'Failed to read on-chain amount, falling back to quote minimum output',
        { targetHash: completion.targetHash, error },
      );
    }
  }

  const fallback = quote.original.details.currencyOut.minimumAmount;

  if (!fallback) {
    throw new Error('Cannot resolve post-Relay vault deposit amount');
  }

  log('Resolved post-Relay amount from quote minimum output', {
    fallback,
    targetHash: completion.targetHash,
  });

  return fallback;
}
