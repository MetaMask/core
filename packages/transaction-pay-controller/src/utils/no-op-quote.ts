import type { Hex, Json } from '@metamask/utils';

import { TransactionPayStrategy } from '../constants.js';
import type {
  Amount,
  FiatValue,
  TransactionPaymentToken,
  TransactionPayQuote,
} from '../types.js';

function zeroFiat(): FiatValue {
  return { fiat: '0', usd: '0' };
}

function zeroAmount(): Amount {
  return { ...zeroFiat(), human: '0', raw: '0' };
}

/**
 * Build a no-op quote for a transaction that needs no conversion.
 *
 * Stored instead of an empty quotes array when a payment token is selected
 * but the route is direct (e.g. same token and chain, or sufficient balance).
 * This gives clients and the publish hook an explicit marker to distinguish
 * "no quote needed" from "quote needed but missing". No-op quotes use the
 * `TransactionPayStrategy.None` strategy, cannot be executed, and must be
 * ignored by fee totals and quote refreshes.
 *
 * @param from - Resolved wallet address for the transaction.
 * @param paymentToken - Selected payment token.
 * @returns The no-op quote.
 */
export function buildNoOpQuote(
  from: Hex,
  paymentToken: TransactionPaymentToken,
): TransactionPayQuote<Json> {
  return {
    dust: zeroFiat(),
    estimatedDuration: 0,
    fees: {
      metaMask: zeroFiat(),
      provider: zeroFiat(),
      sourceNetwork: {
        estimate: zeroAmount(),
        max: zeroAmount(),
      },
      targetNetwork: zeroFiat(),
    },
    original: null,
    request: {
      from,
      sourceBalanceRaw: paymentToken.balanceRaw,
      sourceChainId: paymentToken.chainId,
      sourceTokenAddress: paymentToken.address,
      sourceTokenAmount: '0',
      targetAmountMinimum: '0',
      targetChainId: paymentToken.chainId,
      targetTokenAddress: paymentToken.address,
    },
    sourceAmount: zeroAmount(),
    strategy: TransactionPayStrategy.None,
    targetAmount: zeroFiat(),
  };
}
