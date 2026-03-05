import type { Quote as RampsQuote } from '@metamask/ramps-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import type { FiatOriginalQuote } from './types';
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
import { getTokenFiatRate } from '../../utils/token';
import { getRelayQuotes } from '../relay/relay-quotes';
import type { RelayQuote } from '../relay/types';

const log = createModuleLogger(projectLogger, 'fiat-strategy');

/**
 * Fetches MM Pay fiat strategy quotes using a relay-first estimation flow.
 *
 * @param request - Strategy quotes request.
 * @returns A single combined fiat strategy quote, or an empty array when inputs/quotes are unavailable.
 * @remarks
 * Flow summary:
 * 1. Read `amountFiat` and selected payment method from transaction pay state.
 * 2. Build a synthetic relay request from `amountFiat` using source token USD rate.
 * 3. Fetch relay quote and compute total relay fee (`provider + source network + target network + MetaMask`).
 * 4. Call ramps quotes with `adjustedAmountFiat = amountFiat + relayTotalFeeUsd`.
 * 5. Pick the configured ramps provider quote and combine it with relay quote into one fiat strategy quote.
 */
export async function getFiatQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<FiatOriginalQuote>[]> {
  const { messenger, transaction } = request;
  const transactionId = transaction.id;

  const state = messenger.call('TransactionPayController:getState');
  const transactionData = state.transactionData[transactionId];
  const selectedPaymentMethodId =
    transactionData?.fiatPayment?.selectedPaymentMethodId;
  const amountFiat = transactionData?.fiatPayment?.amountFiat;
  const walletAddress = transaction.txParams.from as Hex;
  const requiredToken = getFirstRequiredToken(transactionData?.tokens);
  const fiatAsset = deriveFiatAssetForFiatPayment(transaction);

  if (!amountFiat || !selectedPaymentMethodId || !requiredToken || !fiatAsset) {
    return [];
  }

  try {
    const relayRequest = buildRelayRequestFromAmountFiat({
      amountFiat,
      fiatAsset,
      messenger,
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

    const relayTotalFeeUsd = getRelayTotalFeeUsd(relayQuote);
    const adjustedAmountFiat = new BigNumber(amountFiat).plus(relayTotalFeeUsd);

    if (
      !adjustedAmountFiat.isFinite() ||
      !adjustedAmountFiat.gt(0) ||
      !relayTotalFeeUsd.isFinite() ||
      !relayTotalFeeUsd.gte(0)
    ) {
      return [];
    }

    const adjustedAmount = adjustedAmountFiat.toNumber();

    if (!Number.isFinite(adjustedAmount) || adjustedAmount <= 0) {
      return [];
    }

    log('Using relay-first fiat estimate', {
      adjustedAmountFiat: adjustedAmountFiat.toString(10),
      amountFiat,
      relayTotalFeeUsd: relayTotalFeeUsd.toString(10),
      sourceAmountRaw: relayRequest.sourceTokenAmount,
      transactionId,
    });

    const quotes = await messenger.call('RampsController:getQuotes', {
      amount: adjustedAmount,
      paymentMethods: [selectedPaymentMethodId],
      walletAddress,
    });

    log('Fetched fiat quotes', {
      adjustedAmountFiat: adjustedAmountFiat.toString(10),
      amountFiat,
      paymentMethods: [selectedPaymentMethodId],
      relayTotalFeeUsd: relayTotalFeeUsd.toString(10),
      transactionId,
      walletAddress,
    });

    const fiatQuote = pickBestFiatQuote(quotes);

    if (!fiatQuote) {
      return [];
    }

    return [
      combineQuotes({
        adjustedAmountFiat: adjustedAmountFiat.toString(10),
        amountFiat,
        fiatQuote,
        relayQuote,
      }),
    ];
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

function buildRelayRequestFromAmountFiat({
  amountFiat,
  fiatAsset,
  messenger,
  requiredToken,
  walletAddress,
}: {
  amountFiat: string;
  fiatAsset: {
    address: Hex;
    chainId: Hex;
    decimals: number;
  };
  messenger: PayStrategyGetQuotesRequest['messenger'];
  requiredToken: TransactionPayRequiredToken;
  walletAddress: Hex;
}): QuoteRequest | undefined {
  const sourceFiatRate = getTokenFiatRate(
    messenger,
    fiatAsset.address,
    fiatAsset.chainId,
  );

  if (!sourceFiatRate) {
    return undefined;
  }

  const usdRate = new BigNumber(sourceFiatRate.usdRate);
  if (!usdRate.isFinite() || !usdRate.gt(0)) {
    return undefined;
  }

  const sourceAmountHuman = new BigNumber(amountFiat).dividedBy(usdRate);
  if (!sourceAmountHuman.isFinite() || !sourceAmountHuman.gt(0)) {
    return undefined;
  }

  const sourceAmountRaw = sourceAmountHuman
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

/**
 * Combines fiat and relay legs into a single MM Pay fiat strategy quote.
 *
 * @param params - Combined quote inputs.
 * @param params.adjustedAmountFiat - Fiat amount sent to ramps after adding relay fee estimate.
 * @param params.amountFiat - User-entered fiat amount.
 * @param params.fiatQuote - Selected ramps quote.
 * @param params.relayQuote - Estimated relay quote.
 * @returns A single fiat strategy quote with split fee buckets.
 * @remarks
 * Fee mapping contract for MM Pay Fiat strategy:
 * - `fees.provider`: Relay provider/swap fee only.
 *   Consumed by UI transaction fee row and tooltip provider fee (with `fees.fiatProvider`).
 * - `fees.fiatProvider`: Fiat on-ramp provider fees only (`providerFee + networkFee` from ramps quote).
 *   Consumed by UI transaction fee row and tooltip provider fee (with `fees.provider`).
 * - `fees.sourceNetwork` / `fees.targetNetwork`: Relay settlement network fees.
 *   Consumed by UI transaction fee row and tooltip network fee.
 * - `fees.metaMask`: MM Pay fee (currently 100 bps over `amountFiat + adjustedAmountFiat`).
 *   Consumed by UI transaction fee row and tooltip MetaMask fee.
 * - `totals.total` should represent Amount + Transaction Fee using the totals pipeline.
 */
function combineQuotes({
  adjustedAmountFiat,
  amountFiat,
  fiatQuote,
  relayQuote,
}: {
  adjustedAmountFiat: string;
  amountFiat: string;
  fiatQuote: RampsQuote;
  relayQuote: TransactionPayQuote<RelayQuote>;
}): TransactionPayQuote<FiatOriginalQuote> {
  const rampsProviderFee = getRampsProviderFee(fiatQuote).toString(10);
  const metaMaskFee = getMetaMaskFee({
    adjustedAmountFiat,
    amountFiat,
  }).toString(10);

  return {
    ...relayQuote,
    fees: {
      ...relayQuote.fees,
      metaMask: {
        fiat: metaMaskFee,
        usd: metaMaskFee,
      },
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

function getRampsProviderFee(fiatQuote: RampsQuote): BigNumber {
  return new BigNumber(fiatQuote.quote.providerFee ?? 0).plus(
    fiatQuote.quote.networkFee ?? 0,
  );
}

function getRelayTotalFeeUsd(
  relayQuote: TransactionPayQuote<RelayQuote>,
): BigNumber {
  return new BigNumber(relayQuote.fees.provider.usd)
    .plus(relayQuote.fees.sourceNetwork.estimate.usd)
    .plus(relayQuote.fees.targetNetwork.usd)
    .plus(relayQuote.fees.metaMask.usd);
}

function getMetaMaskFee({
  adjustedAmountFiat,
  amountFiat,
}: {
  adjustedAmountFiat: BigNumber.Value;
  amountFiat: BigNumber.Value;
}): BigNumber {
  return new BigNumber(amountFiat)
    .plus(adjustedAmountFiat)
    .multipliedBy(100)
    .dividedBy(10_000);
}
