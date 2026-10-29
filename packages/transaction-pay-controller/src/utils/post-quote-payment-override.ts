import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import type {
  GetPaymentOverrideDataResponse,
  QuoteRequest,
  TransactionPayControllerMessenger,
} from '../types.js';

type PostQuotePaymentOverride = Omit<
  GetPaymentOverrideDataResponse,
  'calls'
> & {
  amount: string;
  calls: { data: Hex; to: Hex; value: Hex }[];
  recipient: Hex;
};

type PaymentOverrideOptions = {
  messenger: TransactionPayControllerMessenger;
  transaction: TransactionMeta;
};

/**
 * Prepare an atomic post-quote override for a provider-specific request body.
 *
 * @param options - Quote and callback context.
 * @param options.request - Quote request determining override eligibility.
 * @returns Validated calls, funding amount and authorization data, if applicable.
 */
export async function processPostQuotePaymentOverride({
  request,
  ...options
}: PaymentOverrideOptions & {
  request: QuoteRequest;
}): Promise<PostQuotePaymentOverride | undefined> {
  if (
    !request.isPostQuote ||
    request.atomic === false ||
    request.paymentOverride === undefined
  ) {
    return undefined;
  }

  const override = await getPostQuotePaymentOverrideData(options);

  if (!override.calls.length) {
    return undefined;
  }

  return {
    ...override,
    calls: override.calls.map((call) => ({
      data: call.data as Hex,
      to: call.to as Hex,
      value: (call.value as Hex) ?? '0x0',
    })),
  };
}

/**
 * Resolve the post-quote funding account and calls from the client callback.
 * Both atomic and non-atomic overrides require a recipient, including when
 * the callback cannot build any calls. Pre-quote callbacks have no such rule.
 *
 * @param options - Callback context.
 * @param options.messenger - Controller messenger.
 * @param options.transaction - Original transaction metadata.
 * @returns Override data with its required recipient and raw funding amount.
 */
export async function getPostQuotePaymentOverrideData({
  messenger,
  transaction,
}: PaymentOverrideOptions): Promise<
  GetPaymentOverrideDataResponse & { amount: string; recipient: Hex }
> {
  const { transactionData: transactionDataList } = messenger.call(
    'TransactionPayController:getState',
  );
  const transactionData = transactionDataList[transaction.id];
  const token = transactionData?.tokens?.[0];
  const override = await messenger.call(
    'TransactionPayController:getPaymentOverrideData',
    {
      amount: token?.amountHuman ?? '0',
      transaction,
      transactionData,
    },
  );

  if (!override.recipient) {
    throw new Error('Missing post-quote payment override recipient');
  }

  return {
    ...override,
    amount: token?.amountRaw ?? '0',
    recipient: override.recipient,
  };
}
