import type { TransactionMeta } from '@metamask/transaction-controller';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessengerMock } from '../../tests/messenger-mock.js';
import { PaymentOverride } from '../constants.js';
import type { QuoteRequest } from '../types.js';
import { resolveQuoteRecipient } from './quote-recipient.js';

const EXECUTION_ACCOUNT_MOCK = '0x1111111111111111111111111111111111111111';
const PAYER_MOCK = '0x2222222222222222222222222222222222222222';
const PAYOUT_RECIPIENT_MOCK = '0x3333333333333333333333333333333333333333';
const OVERRIDE_RECIPIENT_MOCK = '0x4444444444444444444444444444444444444444';
const TRANSACTION_MOCK = {
  id: 'transaction-id',
  txParams: { from: EXECUTION_ACCOUNT_MOCK },
} as TransactionMeta;
const REQUEST_MOCK: QuoteRequest = {
  from: PAYER_MOCK,
  sourceBalanceRaw: '2000000',
  sourceChainId: '0x1',
  sourceTokenAddress: '0x5555555555555555555555555555555555555555',
  sourceTokenAmount: '1500000',
  targetAmountMinimum: '1500000',
  targetChainId: '0xa',
  targetTokenAddress: '0x6666666666666666666666666666666666666666',
};

describe('resolveQuoteRecipient', () => {
  const { getControllerStateMock, getPaymentOverrideDataMock, messenger } =
    getMessengerMock();

  beforeEach(() => {
    vi.resetAllMocks();
    getControllerStateMock.mockReturnValue({
      transactionData: {
        [TRANSACTION_MOCK.id]: {
          tokens: [{ amountHuman: '1.5', amountRaw: '1500000' }],
        },
      },
    });
    getPaymentOverrideDataMock.mockResolvedValue({
      calls: [],
      recipient: OVERRIDE_RECIPIENT_MOCK,
    });
  });

  it.each([undefined, true])(
    'defaults deposits to the execution account when atomic is %s',
    async (atomic) => {
      expect(
        await resolveQuoteRecipient({
          messenger,
          request: { ...REQUEST_MOCK, atomic },
          transaction: TRANSACTION_MOCK,
        }),
      ).toBe(EXECUTION_ACCOUNT_MOCK);
      expect(getPaymentOverrideDataMock).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, true])(
    'pays the selected receiving account for ordinary withdrawals when atomic is %s',
    async (atomic) => {
      expect(
        await resolveQuoteRecipient({
          messenger,
          request: { ...REQUEST_MOCK, atomic, isPostQuote: true },
          transaction: TRANSACTION_MOCK,
        }),
      ).toBe(PAYER_MOCK);
      expect(getPaymentOverrideDataMock).not.toHaveBeenCalled();
    },
  );

  it('pays the account override for ordinary withdrawals', async () => {
    expect(
      await resolveQuoteRecipient({
        messenger,
        request: {
          ...REQUEST_MOCK,
          accountOverride: PAYOUT_RECIPIENT_MOCK,
          isPostQuote: true,
        },
        transaction: TRANSACTION_MOCK,
      }),
    ).toBe(PAYOUT_RECIPIENT_MOCK);
  });

  it.each([false, true])(
    'preserves an explicit atomic recipient when isPostQuote is %s',
    async (isPostQuote) => {
      expect(
        await resolveQuoteRecipient({
          messenger,
          request: {
            ...REQUEST_MOCK,
            atomic: true,
            isPostQuote,
            recipient: PAYOUT_RECIPIENT_MOCK,
          },
          transaction: TRANSACTION_MOCK,
        }),
      ).toBe(PAYOUT_RECIPIENT_MOCK);
      expect(getPaymentOverrideDataMock).not.toHaveBeenCalled();
    },
  );

  it('funds the execution account for non-atomic deposits even with an explicit recipient', async () => {
    expect(
      await resolveQuoteRecipient({
        messenger,
        request: {
          ...REQUEST_MOCK,
          atomic: false,
          paymentOverride: PaymentOverride.MoneyAccount,
          recipient: PAYOUT_RECIPIENT_MOCK,
        },
        transaction: TRANSACTION_MOCK,
      }),
    ).toBe(EXECUTION_ACCOUNT_MOCK);
    expect(getPaymentOverrideDataMock).not.toHaveBeenCalled();
  });

  it('resolves the non-atomic post-quote funding account through the callback', async () => {
    expect(
      await resolveQuoteRecipient({
        messenger,
        request: {
          ...REQUEST_MOCK,
          atomic: false,
          isPostQuote: true,
          paymentOverride: PaymentOverride.MoneyAccount,
          recipient: PAYOUT_RECIPIENT_MOCK,
        },
        transaction: TRANSACTION_MOCK,
      }),
    ).toBe(OVERRIDE_RECIPIENT_MOCK);
    expect(getPaymentOverrideDataMock).toHaveBeenCalledTimes(1);
    expect(getPaymentOverrideDataMock).toHaveBeenCalledWith({
      amount: '1.5',
      transaction: TRANSACTION_MOCK,
      transactionData: {
        tokens: [{ amountHuman: '1.5', amountRaw: '1500000' }],
      },
    });
  });

  it.each([undefined, PAYOUT_RECIPIENT_MOCK] as const)(
    'rejects a missing non-atomic override recipient instead of falling back to %s',
    async (recipient) => {
      getPaymentOverrideDataMock.mockResolvedValue({ calls: [] });

      await expect(
        resolveQuoteRecipient({
          messenger,
          request: {
            ...REQUEST_MOCK,
            atomic: false,
            isPostQuote: true,
            recipient,
          },
          transaction: TRANSACTION_MOCK,
        }),
      ).rejects.toThrow('Missing post-quote payment override recipient');
    },
  );

  it('uses a resolved atomic payment override recipient without requesting it again', async () => {
    expect(
      await resolveQuoteRecipient({
        messenger,
        request: {
          ...REQUEST_MOCK,
          atomic: true,
          isPostQuote: true,
          paymentOverride: PaymentOverride.MoneyAccount,
          recipient: OVERRIDE_RECIPIENT_MOCK,
        },
        transaction: TRANSACTION_MOCK,
      }),
    ).toBe(OVERRIDE_RECIPIENT_MOCK);
    expect(getPaymentOverrideDataMock).not.toHaveBeenCalled();
  });
});
