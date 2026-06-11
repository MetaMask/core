import type { Quote as RampsQuote } from '@metamask/ramps-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { PaymentOverride, TransactionPayStrategy } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionFiatPayment,
  TransactionPayRequiredToken,
  TransactionPayQuote,
} from '../../types';
import { getUseFiatMUSDQuoteToInjectForMoneyAccount } from '../../utils/feature-flags';
import {
  buildCaipAssetType,
  computeRawFromFiatAmount,
  getTokenFiatRate,
  getTokenInfo,
} from '../../utils/token';
import { getRelayQuotes } from '../relay/relay-quotes';
import type { RelayQuote } from '../relay/types';
import {
  DEFAULT_FIAT_CURRENCY,
  MUSD_MONAD_FIAT_ASSET,
  MUSD_PROBE_AMOUNT_USD,
} from './constants';
import type { TransactionPayFiatAsset } from './constants';
import type { FiatQuote } from './types';
import {
  deriveFiatAssetForFiatPayment,
  isMoneyAccountDepositTransaction,
} from './utils';

const log = createModuleLogger(projectLogger, 'fiat-strategy');

/**
 * Fetches MM Pay fiat strategy quotes using a relay-first estimation flow.
 *
 * When the direct-to-mUSD flag is enabled and the transaction is a Money
 * Account deposit, attempts the direct mUSD flow first and falls back to
 * the standard ETH flow if the probe or quotes fail.
 *
 * @param request - Strategy quotes request.
 * @returns A single combined fiat strategy quote, or an empty array when inputs/quotes are unavailable.
 */
export async function getFiatQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<FiatQuote>[]> {
  if (
    getUseFiatMUSDQuoteToInjectForMoneyAccount(request.messenger) &&
    isMoneyAccountDepositTransaction(request.transaction)
  ) {
    const directQuotes = await getDirectMusdToMoneyAccountQuotes(request);
    if (directQuotes.length > 0) {
      return directQuotes;
    }
  }

  return getStandardFiatQuotes(request);
}

async function getStandardFiatQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<FiatQuote>[]> {
  const {
    accountSupports7702,
    fiatPaymentMethod,
    from: walletAddress,
    messenger,
    transaction,
  } = request;
  const transactionId = transaction.id;

  const state = messenger.call('TransactionPayController:getState');
  const transactionData = state.transactionData[transactionId];
  const amountFiat = transactionData?.fiatPayment?.amountFiat;
  const requiredTokens = transactionData?.tokens ?? [];
  const fiatAsset = deriveFiatAssetForFiatPayment(transaction, messenger);

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

    const relayQuotes = await getRelayQuotes({
      accountSupports7702,
      from: walletAddress,
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

    const fiatQuote = await getRampsQuote({
      adjustedAmount,
      fiatAsset,
      fiatPaymentMethod,
      messenger,
      walletAddress,
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

async function probeMusdFiatAvailability({
  messenger,
  walletAddress,
}: {
  messenger: PayStrategyGetQuotesRequest['messenger'];
  walletAddress: string;
}): Promise<boolean> {
  try {
    const quotes = await messenger.call('RampsController:getQuotes', {
      amount: MUSD_PROBE_AMOUNT_USD,
      assetId: buildCaipAssetType(
        MUSD_MONAD_FIAT_ASSET.chainId,
        MUSD_MONAD_FIAT_ASSET.address,
      ),
      autoSelectProvider: true,
      fiat: DEFAULT_FIAT_CURRENCY,
      restrictToKnownOrNativeProviders: true,
      walletAddress,
    });

    const isAvailable = (quotes.success?.length ?? 0) > 0;

    log('mUSD fiat probe result', {
      isAvailable,
      providerCount: quotes.success?.length ?? 0,
    });

    return isAvailable;
  } catch (error) {
    log('mUSD fiat probe failed', { error });
    return false;
  }
}

async function getDirectMusdToMoneyAccountQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<FiatQuote>[]> {
  const {
    accountSupports7702,
    fiatPaymentMethod,
    from: userWalletAddress,
    messenger,
    transaction,
  } = request;
  const transactionId = transaction.id;

  const state = messenger.call('TransactionPayController:getState');
  const transactionData = state.transactionData[transactionId];
  const amountFiat = transactionData?.fiatPayment?.amountFiat;
  const requiredTokens = transactionData?.tokens ?? [];

  const moneyAccountAddress = transaction.txParams.from as Hex;

  if (!amountFiat || !fiatPaymentMethod || !requiredTokens.length) {
    return [];
  }

  const probeOk = await probeMusdFiatAvailability({
    messenger,
    walletAddress: moneyAccountAddress,
  });

  if (!probeOk) {
    log('Probe failed — no provider supports mUSD on Monad, falling back', {
      transactionId,
    });
    return [];
  }

  try {
    if (requiredTokens.length > 1) {
      throw new Error(
        'Multiple required tokens not supported for direct mUSD strategy',
      );
    }

    const requiredToken = requiredTokens[0];
    const fiatAsset = MUSD_MONAD_FIAT_ASSET;

    const baseRelayRequest = buildRelayRequestFromAmountFiat({
      amountFiat,
      fiatAsset,
      messenger,
      requiredToken,
      walletAddress: userWalletAddress,
    });

    if (!baseRelayRequest) {
      throw new Error('Failed to build relay request for direct mUSD flow');
    }

    const relayRequest = {
      ...baseRelayRequest,
      paymentOverride: PaymentOverride.MoneyAccount,
    };

    const relayQuotes = await getRelayQuotes({
      accountSupports7702,
      from: userWalletAddress,
      messenger,
      requests: [relayRequest],
      transaction,
    });

    const relayQuote = relayQuotes[0];
    if (!relayQuote) {
      throw new Error('No relay quote available for direct mUSD estimation');
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

    log('Direct mUSD quote flow', {
      adjustedAmountFiat: adjustedAmountFiat.toString(10),
      amountFiat,
      moneyAccountAddress,
      relayTotalFeeUsd: relayTotalFeeUsd.toString(10),
      transactionId,
    });

    const fiatQuote = await getRampsQuote({
      adjustedAmount,
      fiatAsset,
      fiatPaymentMethod,
      messenger,
      walletAddress: moneyAccountAddress,
    });

    messenger.call('TransactionPayController:updateFiatPayment', {
      callback: (fiatPayment: TransactionFiatPayment) => {
        fiatPayment.rampsQuote = fiatQuote;
        fiatPayment.caipAssetId = buildCaipAssetType(
          MUSD_MONAD_FIAT_ASSET.chainId,
          MUSD_MONAD_FIAT_ASSET.address,
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
    log('Failed to fetch direct mUSD quotes', { error, transactionId });
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
