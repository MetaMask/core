import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { FiatOriginalQuote, FiatQuote, FiatQuotesResponse } from './types';
import { TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayRequiredToken,
  TransactionPayQuote,
} from '../../types';
import {
  deriveFiatAssetForFiatPayment,
  pickBestFiatQuote,
} from '../../utils/fiat';
import { getRelayQuotes } from '../relay/relay-quotes';
import type { RelayQuote } from '../relay/types';

const log = createModuleLogger(projectLogger, 'fiat-strategy');

/**
 * Fetch Fiat quotes.
 *
 * @param request - Strategy quotes request.
 * @returns Fiat strategy quotes.
 */
export async function getFiatQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<FiatOriginalQuote>[]> {
  const { messenger, transaction } = request;
  const transactionId = transaction.id;

  const state = messenger.call('TransactionPayController:getState');
  const transactionData = state.transactionData[transactionId];
  const selectedPaymentMethodId = transactionData?.fiatPayment
    ?.selectedPaymentMethodId as string;
  const amountString = transactionData?.fiatPayment?.amount;
  const walletAddress = transaction.txParams.from as Hex;
  const amount = Number(amountString);

  if (!Number.isFinite(amount)) {
    return [];
  }

  try {
    const quotes = await messenger.call('RampsController:getQuotes', {
      amount,
      paymentMethods: [selectedPaymentMethodId],
      walletAddress,
    });

    log('Fetched fiat quotes', {
      amount,
      paymentMethods: [selectedPaymentMethodId],
      quotes,
      transactionId,
      walletAddress,
    });

    const fiatQuote = pickBestFiatQuote(quotes as FiatQuotesResponse);
    const requiredToken = getFirstRequiredToken(transactionData?.tokens);
    const fiatAsset = deriveFiatAssetForFiatPayment(transaction);

    if (!fiatQuote || !requiredToken || !fiatAsset) {
      return [];
    }

    const relayRequest = buildRelayRequest({
      fiatAsset,
      fiatQuote,
      requiredToken,
      walletAddress,
    });

    if (!relayRequest) {
      return [];
    }

    const relayQuotes = await getRelayQuotes({
      messenger,
      requests: [relayRequest],
      transaction,
    });

    const relayQuote = relayQuotes[0];

    if (!relayQuote) {
      return [];
    }

    return [combineQuotes({ fiatQuote, relayQuote })];
  } catch (error) {
    log('Failed to fetch fiat quotes', { error, transactionId });
  }

  return [];
}

function getFirstRequiredToken(
  tokens?: TransactionPayRequiredToken[],
): TransactionPayRequiredToken | undefined {
  return tokens?.find((token) => !token.skipIfBalance);
}

function buildRelayRequest({
  fiatAsset,
  fiatQuote,
  requiredToken,
  walletAddress,
}: {
  fiatAsset: {
    address: Hex;
    chainId: Hex;
    decimals: number;
  };
  fiatQuote: FiatQuote;
  requiredToken: TransactionPayRequiredToken;
  walletAddress: Hex;
}): QuoteRequest | undefined {
  const sourceAmountRaw = new BigNumber(fiatQuote.quote.amountOut)
    .shiftedBy(fiatAsset.decimals)
    .decimalPlaces(0, BigNumber.ROUND_DOWN)
    .toFixed(0);

  if (!new BigNumber(sourceAmountRaw).gt(0)) {
    return undefined;
  }

  return {
    from: walletAddress,
    isPostQuote: true,
    sourceBalanceRaw: sourceAmountRaw,
    sourceChainId: fiatAsset.chainId,
    sourceTokenAddress: fiatAsset.address,
    sourceTokenAmount: sourceAmountRaw,
    targetAmountMinimum: requiredToken.amountRaw,
    targetChainId: requiredToken.chainId,
    targetTokenAddress: requiredToken.address,
  };
}

function combineQuotes({
  fiatQuote,
  relayQuote,
}: {
  fiatQuote: FiatQuote;
  relayQuote: TransactionPayQuote<RelayQuote>;
}): TransactionPayQuote<FiatOriginalQuote> {
  const rampsProviderFee = getRampsProviderFee(fiatQuote).toString(10);

  return {
    ...relayQuote,
    fees: {
      ...relayQuote.fees,
      provider: relayQuote.fees.provider,
      fiatProvider: {
        fiat: rampsProviderFee,
        usd: rampsProviderFee,
      },
    },
    original: {
      fiatQuote,
      relayQuote: relayQuote.original,
    },
    strategy: TransactionPayStrategy.Fiat,
  };
}

function getRampsProviderFee(fiatQuote: FiatQuote): BigNumber {
  return new BigNumber(fiatQuote.quote.providerFee ?? 0)
    .plus(fiatQuote.quote.networkFee ?? 0)
    .plus(fiatQuote.quote.extraFee ?? 0);
}
