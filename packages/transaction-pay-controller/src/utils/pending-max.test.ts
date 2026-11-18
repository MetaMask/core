import { describe, expect, it } from 'vitest';

import { PaymentOverride } from '../constants.js';
import { isPendingPrependedMax } from './pending-max.js';

describe('isPendingPrependedMax', () => {
  const pendingMax = {
    isPostQuote: true,
    isMaxAmount: true,
    tokens: [{ amountRaw: '0', skipIfBalance: false }],
  };

  it('returns true when a required prepended max transfer is still encoded as 0', () => {
    expect(isPendingPrependedMax(pendingMax)).toBe(true);
  });

  it('returns true when a later required token is still encoded as 0', () => {
    expect(
      isPendingPrependedMax({
        ...pendingMax,
        tokens: [
          { amountRaw: '0', skipIfBalance: true },
          { amountRaw: '0', skipIfBalance: false },
        ],
      }),
    ).toBe(true);
  });

  it('returns false when the transaction is not a post-quote max', () => {
    expect(isPendingPrependedMax({ ...pendingMax, isPostQuote: false })).toBe(
      false,
    );
    expect(isPendingPrependedMax({ ...pendingMax, isMaxAmount: false })).toBe(
      false,
    );
  });

  it('returns false when the quote funds the transfer', () => {
    expect(
      isPendingPrependedMax({ ...pendingMax, isHyperliquidSource: true }),
    ).toBe(false);
    expect(
      isPendingPrependedMax({
        ...pendingMax,
        isPolymarketDepositWallet: true,
      }),
    ).toBe(false);
    expect(
      isPendingPrependedMax({
        ...pendingMax,
        paymentOverride: PaymentOverride.MoneyAccount,
      }),
    ).toBe(false);
  });

  it('returns false when no required token amount is still unencoded', () => {
    expect(isPendingPrependedMax({ ...pendingMax, tokens: undefined })).toBe(
      false,
    );
    expect(
      isPendingPrependedMax({
        ...pendingMax,
        tokens: [
          { amountRaw: '0', skipIfBalance: true },
          { amountRaw: '1', skipIfBalance: false },
        ],
      }),
    ).toBe(false);
  });
});
