import type { TransactionMeta } from '@metamask/transaction-controller';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMessengerMock } from '../../tests/messenger-mock.js';
import { PaymentOverride } from '../constants.js';
import type { QuoteRequest } from '../types.js';
import { processPostQuotePaymentOverride } from './post-quote-payment-override.js';

const TRANSACTION_MOCK = { id: 'transaction-id' } as TransactionMeta;
const RECIPIENT_MOCK = '0x1111111111111111111111111111111111111111';
const REQUEST_MOCK = {
  isPostQuote: true,
  paymentOverride: PaymentOverride.MoneyAccount,
} as QuoteRequest;

describe('processPostQuotePaymentOverride', () => {
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
  });

  it.each([
    { isPostQuote: false },
    { atomic: false },
    { paymentOverride: undefined },
  ])('does not request an atomic override for %j', async (request) => {
    const result = await processPostQuotePaymentOverride({
      messenger,
      request: { ...REQUEST_MOCK, ...request },
      transaction: TRANSACTION_MOCK,
    });

    expect(result).toBeUndefined();
    expect(getPaymentOverrideDataMock).not.toHaveBeenCalled();
  });

  it('accepts any configured override and uses destination raw units for funding', async () => {
    getPaymentOverrideDataMock.mockResolvedValue({
      authorizationList: [],
      calls: [{ data: '0x1234', to: RECIPIENT_MOCK }],
      recipient: RECIPIENT_MOCK,
    });

    const result = await processPostQuotePaymentOverride({
      messenger,
      request: {
        ...REQUEST_MOCK,
        paymentOverride: 'another-override' as PaymentOverride,
        sourceTokenAmount: '1500000000000000000',
      },
      transaction: TRANSACTION_MOCK,
    });

    expect(getPaymentOverrideDataMock).toHaveBeenCalledWith({
      amount: '1.5',
      transaction: TRANSACTION_MOCK,
      transactionData: {
        tokens: [{ amountHuman: '1.5', amountRaw: '1500000' }],
      },
    });
    expect(result).toStrictEqual({
      amount: '1500000',
      authorizationList: [],
      calls: [{ data: '0x1234', to: RECIPIENT_MOCK, value: '0x0' }],
      recipient: RECIPIENT_MOCK,
    });
  });

  it('rejects a missing recipient before skipping an empty override', async () => {
    getPaymentOverrideDataMock.mockResolvedValue({ calls: [] });

    await expect(
      processPostQuotePaymentOverride({
        messenger,
        request: REQUEST_MOCK,
        transaction: TRANSACTION_MOCK,
      }),
    ).rejects.toThrow('Missing post-quote payment override recipient');
  });
});
