import type { PaymentOverride } from '../constants.js';
import type { TransactionPayRequiredToken } from '../types.js';

/**
 * A max post-quote withdrawal whose prepended transfer is still encoded as 0.
 *
 * The source amount is withheld until that transfer can fund the deposit.
 * This is not a direct route: an empty source-amount list here means the
 * amount has not been encoded yet, so no no-op quote should be stored and
 * the original transaction must not be published.
 *
 * @param data - Pay transaction fields used to detect the pending max.
 * @param data.isHyperliquidSource - Whether the source is HyperLiquid.
 * @param data.isMaxAmount - Whether the user requested the maximum amount.
 * @param data.isPolymarketDepositWallet - Whether the source is a Polymarket deposit wallet.
 * @param data.isPostQuote - Whether the original transaction is prepended to the quote.
 * @param data.paymentOverride - Payment override, when the quote funds the transfer.
 * @param data.tokens - Required tokens decoded from the transaction.
 * @returns Whether the max transfer amount is not encoded yet.
 */
export function isPendingPrependedMax(data: {
  isHyperliquidSource?: boolean;
  isMaxAmount?: boolean;
  isPolymarketDepositWallet?: boolean;
  isPostQuote?: boolean;
  paymentOverride?: PaymentOverride;
  tokens?: Pick<TransactionPayRequiredToken, 'amountRaw' | 'skipIfBalance'>[];
}): boolean {
  if (!data.isPostQuote || !data.isMaxAmount) {
    return false;
  }

  // These sources are funded by the quote, so a zero encoded amount is
  // expected and the live balance is the source amount.
  if (
    data.isHyperliquidSource ||
    data.isPolymarketDepositWallet ||
    data.paymentOverride
  ) {
    return false;
  }

  return (data.tokens ?? []).some(
    (token) => !token.skipIfBalance && token.amountRaw === '0',
  );
}
