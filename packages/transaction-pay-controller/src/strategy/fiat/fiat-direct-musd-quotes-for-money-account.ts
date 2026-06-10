import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { PaymentOverride } from '../../constants';
import { projectLogger } from '../../logger';
import type {
  PayStrategyGetQuotesRequest,
  TransactionFiatPayment,
  TransactionPayQuote,
} from '../../types';
import { buildCaipAssetType } from '../../utils/token';
import { getRelayQuotes } from '../relay/relay-quotes';
import {
  DEFAULT_FIAT_CURRENCY,
  MUSD_MONAD_FIAT_ASSET,
  MUSD_PROBE_AMOUNT_USD,
} from './constants';
import {
  buildRelayRequestFromAmountFiat,
  combineQuotes,
  getRelayTotalFeeUsd,
  getRequiredTokens,
  getRampsQuote,
} from './fiat-quotes';
import type { FiatQuote } from './types';

const log = createModuleLogger(projectLogger, 'fiat-direct-musd-ma');

/**
 * Probes whether any fiat provider can sell mUSD on Monad by requesting
 * a small fixed-amount quote. Returns `true` if at least one provider
 * returns a successful quote, `false` otherwise.
 *
 * This is intentionally cheap: a single ramps call with a small amount.
 * The result is used to decide whether the direct-mUSD flow is viable
 * before committing the real user transaction to this path.
 *
 * @param options - Probe options.
 * @param options.messenger - Controller messenger for RampsController access.
 * @param options.walletAddress - Wallet address for the ramps probe (money account).
 * @returns `true` if mUSD on Monad is purchasable via at least one fiat provider.
 */
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

/**
 * Fetches fiat strategy quotes for direct mUSD purchase on Monad,
 * delivered to the Money Account address.
 *
 * Probes fiat provider availability first. If no provider supports mUSD
 * on Monad, returns an empty array so the caller can fall back to the
 * standard fiat flow.
 *
 * @param request - Strategy quotes request.
 * @returns A single combined fiat strategy quote, or an empty array when
 * the probe fails or inputs/quotes are unavailable.
 */
export async function getDirectMusdToMoneyAccountQuotes(
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
  const requiredTokens = getRequiredTokens(transactionData?.tokens);

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
