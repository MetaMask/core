import type { Quote as RampsQuote } from '@metamask/ramps-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayRequiredToken,
  TransactionPayQuote,
} from '../../types';
import { computeRawFromFiatAmount, getTokenFiatRate } from '../../utils/token';
import { getRelayQuotes } from '../relay/relay-quotes';
import type { RelayQuote } from '../relay/types';
import type { FiatQuote } from './types';
import { deriveFiatAssetForFiatPayment, pickBestFiatQuote } from './utils';

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
): Promise<TransactionPayQuote<FiatQuote>[]> {
  const { fiatPaymentMethod, messenger, transaction } = request;
  const transactionId = transaction.id;

  const state = messenger.call('TransactionPayController:getState');
  const transactionData = state.transactionData[transactionId];
  const amountFiat = transactionData?.fiatPayment?.amountFiat;
  const walletAddress = transaction.txParams.from as Hex;
  const requiredTokens = getRequiredTokens(transactionData?.tokens);
  const fiatAsset = deriveFiatAssetForFiatPayment(transaction);

  if (
    !amountFiat ||
    !fiatPaymentMethod ||
    !requiredTokens.length ||
    !fiatAsset
  ) {
    return [];
  }

  try {
    if (requiredTokens.length > 1) {
      throw new Error(
        'Multiple required tokens not supported for fiat strategy',
      );
    }

    const requiredToken = requiredTokens[0];

    const relayRequest = buildRelayRequestFromAmountFiat({
      amountFiat,
      fiatAsset,
      messenger,
      requiredToken,
      walletAddress,
    });

    if (!relayRequest) {
      throw new Error('Failed to build relay request from fiat amount');
    }

    const relayQuotes = await getRelayQuotes({
      messenger,
      requests: [relayRequest],
      transaction,
    });

    const relayQuote = relayQuotes[0];
    if (!relayQuote) {
      throw new Error('No relay quote available for fiat estimation');
    }

    const relayTotalFeeUsd = getRelayTotalFeeUsd(relayQuote);
    const adjustedAmountFiat = new BigNumber(amountFiat).plus(relayTotalFeeUsd);

    if (
      !adjustedAmountFiat.isFinite() ||
      !adjustedAmountFiat.gt(0) ||
      !relayTotalFeeUsd.isFinite() ||
      !relayTotalFeeUsd.gte(0)
    ) {
      throw new Error('Invalid fiat amount after relay fee adjustment');
    }

    const adjustedAmount = adjustedAmountFiat.toNumber();

    if (!Number.isFinite(adjustedAmount) || adjustedAmount <= 0) {
      throw new Error('Invalid fiat amount after relay fee adjustment');
    }

    log('Fiat quote flow', {
      adjustedAmountFiat: adjustedAmountFiat.toString(10),
      amountFiat,
      paymentMethods: [fiatPaymentMethod],
      relayTotalFeeUsd: relayTotalFeeUsd.toString(10),
      sourceAmountRaw: relayRequest.sourceTokenAmount,
      transactionId,
    });

    const quotes = await messenger.call('RampsController:getQuotes', {
      amount: adjustedAmount,
      paymentMethods: [fiatPaymentMethod],
      walletAddress,
    });

    log('Fetched ramps quotes', {
      rampsQuotesCount: quotes.success?.length ?? 0,
      transactionId,
    });

    const fiatQuote = pickBestFiatQuote(quotes);

    if (!fiatQuote) {
      throw new Error('No matching ramps quote found for selected provider');
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

function getRequiredTokens(
  tokens?: TransactionPayRequiredToken[],
): TransactionPayRequiredToken[] {
  return tokens?.filter((token) => !token.skipIfBalance) ?? [];
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

  const sourceAmountRaw = computeRawFromFiatAmount(
    amountFiat,
    fiatAsset.decimals,
    sourceFiatRate.usdRate,
  );

  if (!sourceAmountRaw) {
    return undefined;
  }

  return {
    from: walletAddress,
    // Force EXACT_INPUT mode: source amount is pre-calculated from the fiat
    // amount, so the relay should treat it as a fixed input rather than
    // computing it from the target.
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
 * - `fees.provider`: Total provider fee (relay provider/swap fee + ramps provider/network fee).
 *   Consumed by UI transaction fee row and tooltip provider fee.
 * - `fees.providerFiat`: Fiat on-ramp provider fees only (`providerFee + networkFee` from ramps quote).
 *   Optional breakdown; client can derive relay portion via `provider - providerFiat`.
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
}): TransactionPayQuote<FiatQuote> {
  const rampsProviderFee = getRampsProviderFee(fiatQuote);
  const totalProviderFee = new BigNumber(relayQuote.fees.provider.usd)
    .plus(rampsProviderFee)
    .toString(10);
  const rampsProviderFeeStr = rampsProviderFee.toString(10);
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
      provider: {
        fiat: totalProviderFee,
        usd: totalProviderFee,
      },
      providerFiat: {
        fiat: rampsProviderFeeStr,
        usd: rampsProviderFeeStr,
      },
    },
    original: {
      rampsQuote: fiatQuote,
      relayQuote: relayQuote.original,
    },
    strategy: TransactionPayStrategy.Fiat,
  };
}

/**
 * Ramps providers handle network gas fees themselves but report them separately
 * as `networkFee` alongside their `providerFee`. We combine both into a single
 * ramps provider fee for the `providerFiat` breakdown.
 *
 * @param fiatQuote - The ramps quote containing provider and network fees.
 * @returns Combined ramps provider fee as a BigNumber.
 */
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
  return new BigNumber(amountFiat).plus(adjustedAmountFiat).dividedBy(100);
}
