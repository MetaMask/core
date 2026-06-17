import type { Quote as RampsQuote } from '@metamask/ramps-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { NATIVE_TOKEN_ADDRESS, TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionFiatPayment,
  TransactionPayRequiredToken,
  TransactionPayQuote,
} from '../../types';
import { getDirectMoneyMusdEnabled } from '../../utils/feature-flags';
import {
  buildCaipAssetType,
  computeRawFromFiatAmount,
  getTokenFiatRate,
  getTokenInfo,
} from '../../utils/token';
import { getRelayQuotes } from '../relay/relay-quotes';
import type { RelayQuote } from '../relay/types';
import { DEFAULT_FIAT_CURRENCY } from './constants';
import type { TransactionPayFiatAsset } from './constants';
import {
  assertDirectMusdRelayExecute,
  getDirectMusdFiatQuoteOptions,
} from './fiat-direct-musd';
import type { FiatQuote } from './types';
import {
  deriveFiatAssetForFiatPayment,
  getRawSourceAmountFromOrderCryptoAmount,
  isMoneyAccountDepositTransaction,
} from './utils';

const log = createModuleLogger(projectLogger, 'fiat-strategy');

type FiatQuotePipelineOptions = {
  fiatAsset: TransactionPayFiatAsset;
  rampsWalletAddress: Hex;
  relayRequestOverrides?: Partial<QuoteRequest>;
};

/**
 * Fetches MM Pay fiat strategy quotes using a relay-first estimation flow.
 *
 * When the direct-to-mUSD flag is enabled and the transaction is a Money
 * Account deposit, probes ramps for mUSD availability on Monad. If viable,
 * uses direct mUSD params (asset, wallet, recipient); otherwise falls back
 * to the standard ETH flow. Both paths share a single quote pipeline.
 *
 * @param request - Strategy quotes request.
 * @returns A single combined fiat strategy quote, or an empty array when inputs/quotes are unavailable.
 */
export async function getFiatQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<FiatQuote>[]> {
  const { messenger, transaction } = request;

  const useDirectMusd =
    getDirectMoneyMusdEnabled(messenger) &&
    isMoneyAccountDepositTransaction(transaction);

  if (useDirectMusd) {
    const moneyAccountAddress = transaction.txParams.from as Hex;

    const directOptions = await getDirectMusdFiatQuoteOptions({
      messenger,
      moneyAccountAddress,
    });

    if (directOptions) {
      const directResult = await executeFiatQuotePipeline(
        request,
        directOptions,
      );

      if (directResult.length > 0) {
        return directResult;
      }
    }
  }

  return executeFiatQuotePipeline(request, {
    fiatAsset: deriveFiatAssetForFiatPayment(transaction, messenger),
    rampsWalletAddress: request.from,
  });
}

async function executeFiatQuotePipeline(
  request: PayStrategyGetQuotesRequest,
  options: FiatQuotePipelineOptions,
): Promise<TransactionPayQuote<FiatQuote>[]> {
  const {
    accountSupports7702,
    fiatPaymentMethod,
    from: walletAddress,
    messenger,
    transaction,
  } = request;
  const { fiatAsset, rampsWalletAddress, relayRequestOverrides } = options;
  const transactionId = transaction.id;

  const state = messenger.call('TransactionPayController:getState');
  const transactionData = state.transactionData[transactionId];
  const amountFiat = transactionData?.fiatPayment?.amountFiat;
  const requiredTokens = transactionData?.tokens ?? [];

  if (!amountFiat || !fiatPaymentMethod || !requiredTokens.length) {
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

    const finalRelayRequest = relayRequestOverrides
      ? { ...relayRequest, ...relayRequestOverrides }
      : relayRequest;

    if (finalRelayRequest.isDirectMusdMoneyAccount) {
      const adjustedAmount = Number(amountFiat);

      if (!Number.isFinite(adjustedAmount) || adjustedAmount <= 0) {
        throw new Error('Invalid fiat amount for direct mUSD quote');
      }

      const fiatQuote = await getRampsQuote({
        adjustedAmount,
        fiatAsset,
        fiatPaymentMethod,
        messenger,
        walletAddress: rampsWalletAddress,
      });

      messenger.call('TransactionPayController:updateFiatPayment', {
        callback: (fiatPayment: TransactionFiatPayment) => {
          fiatPayment.rampsQuote = fiatQuote;
          fiatPayment.caipAssetId = buildCaipAssetType(
            fiatAsset.chainId,
            fiatAsset.address,
          );
        },
        transactionId,
      });

      log('Direct mUSD fiat quote flow', {
        amountFiat,
        rampsWalletAddress,
        transactionId,
      });

      return [
        combineDirectMusdFiatQuote({
          amountFiat,
          fiatAsset,
          fiatQuote,
          messenger,
          request: finalRelayRequest,
        }),
      ];
    }

    const relayQuotes = await getRelayQuotes({
      accountSupports7702,
      from: walletAddress,
      messenger,
      requests: [finalRelayRequest],
      transaction,
    });

    const relayQuote = relayQuotes[0];
    if (!relayQuote) {
      throw new Error('No relay quote available for fiat estimation');
    }

    assertDirectMusdRelayExecute(relayQuote);

    const isSourceNative =
      fiatAsset.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
    const gasDeductedFromSource =
      isSourceNative || relayQuote.fees.isSourceGasFeeToken === true;

    const relayTotalFeeUsd = gasDeductedFromSource
      ? getRelayTotalFeeUsd(relayQuote)
      : getNonGasRelayFeeUsd(relayQuote);
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
      isDirectMusd: Boolean(relayRequestOverrides),
      rampsWalletAddress,
      relayTotalFeeUsd: relayTotalFeeUsd.toString(10),
      sourceAmountRaw: relayRequest.sourceTokenAmount,
      transactionId,
    });

    const fiatQuote = await getRampsQuote({
      adjustedAmount,
      fiatAsset,
      fiatPaymentMethod,
      messenger,
      walletAddress: rampsWalletAddress,
    });

    messenger.call('TransactionPayController:updateFiatPayment', {
      callback: (fiatPayment: TransactionFiatPayment) => {
        fiatPayment.rampsQuote = fiatQuote;
        fiatPayment.caipAssetId = buildCaipAssetType(
          fiatAsset.chainId,
          fiatAsset.address,
        );
      },
      transactionId,
    });

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

    messenger.call('TransactionPayController:updateFiatPayment', {
      callback: (fiatPayment) => {
        fiatPayment.rampsQuote = undefined;
      },
      transactionId,
    });
  }

  return [];
}

async function getRampsQuote({
  adjustedAmount,
  fiatAsset,
  fiatPaymentMethod,
  messenger,
  walletAddress,
}: {
  adjustedAmount: number;
  fiatAsset: TransactionPayFiatAsset;
  fiatPaymentMethod: string;
  messenger: PayStrategyGetQuotesRequest['messenger'];
  walletAddress: string;
}): Promise<RampsQuote> {
  const quotes = await messenger.call('RampsController:getQuotes', {
    amount: adjustedAmount,
    assetId: buildCaipAssetType(fiatAsset.chainId, fiatAsset.address),
    autoSelectProvider: true,
    fiat: DEFAULT_FIAT_CURRENCY,
    paymentMethods: [fiatPaymentMethod],
    restrictToKnownOrNativeProviders: true,
    walletAddress,
  });

  log('Fetched ramps quotes', {
    quotesCount: quotes.success?.length ?? 0,
  });

  const quote = quotes.success?.[0];

  if (!quote) {
    throw new Error('No matching ramps quote found for selected provider');
  }

  return quote;
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

  const tokenInfo = getTokenInfo(
    messenger,
    fiatAsset.address,
    fiatAsset.chainId,
  );

  if (!tokenInfo) {
    return undefined;
  }

  const sourceAmountRaw = computeRawFromFiatAmount(
    amountFiat,
    tokenInfo.decimals,
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

function combineDirectMusdFiatQuote({
  amountFiat,
  fiatAsset,
  fiatQuote,
  messenger,
  request,
}: {
  amountFiat: string;
  fiatAsset: TransactionPayFiatAsset;
  fiatQuote: RampsQuote;
  messenger: PayStrategyGetQuotesRequest['messenger'];
  request: QuoteRequest;
}): TransactionPayQuote<FiatQuote> {
  const tokenInfo = getTokenInfo(messenger, fiatAsset.address, fiatAsset.chainId);

  if (!tokenInfo) {
    throw new Error(
      `Unable to resolve token info for fiat asset ${fiatAsset.address} on chain ${fiatAsset.chainId}`,
    );
  }

  const sourceAmountRaw = getRawSourceAmountFromOrderCryptoAmount({
    cryptoAmount: fiatQuote.quote.amountOut,
    decimals: tokenInfo.decimals,
  });
  const rampsProviderFee = getRampsProviderFee(fiatQuote).toString(10);
  const sourceAmountHuman = new BigNumber(sourceAmountRaw)
    .shiftedBy(-tokenInfo.decimals)
    .toString(10);

  return {
    dust: { fiat: '0', usd: '0' },
    estimatedDuration: 0,
    fees: {
      metaMask: { fiat: '0', usd: '0' },
      provider: { fiat: rampsProviderFee, usd: rampsProviderFee },
      providerFiat: { fiat: rampsProviderFee, usd: rampsProviderFee },
      sourceNetwork: {
        estimate: { fiat: '0', human: '0', raw: '0', usd: '0' },
        max: { fiat: '0', human: '0', raw: '0', usd: '0' },
      },
      targetNetwork: { fiat: '0', usd: '0' },
    },
    original: {
      rampsQuote: fiatQuote,
      relayQuote: undefined,
    },
    request: {
      ...request,
      sourceBalanceRaw: sourceAmountRaw,
      sourceTokenAmount: sourceAmountRaw,
      targetAmountMinimum: sourceAmountRaw,
    },
    sourceAmount: {
      fiat: amountFiat,
      human: sourceAmountHuman,
      raw: sourceAmountRaw,
      usd: amountFiat,
    },
    strategy: TransactionPayStrategy.Fiat,
    targetAmount: { fiat: amountFiat, usd: amountFiat },
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

function getNonGasRelayFeeUsd(
  relayQuote: TransactionPayQuote<RelayQuote>,
): BigNumber {
  return new BigNumber(relayQuote.fees.provider.usd)
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
