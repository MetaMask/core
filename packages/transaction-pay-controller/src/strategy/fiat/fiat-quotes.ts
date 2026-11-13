import type { Quote as RampsQuote } from '@metamask/ramps-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  NATIVE_TOKEN_ADDRESS,
  TransactionPayStrategy,
} from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionFiatPayment,
  TransactionPayRequiredToken,
  TransactionPayQuote,
} from '../../types.js';
import { getDirectMoneyMusdEnabled } from '../../utils/feature-flags.js';
import {
  buildCaipAssetType,
  computeRawFromFiatAmount,
  getTokenFiatRate,
  getTokenInfo,
} from '../../utils/token.js';
import type { TransactionPayFiatAsset } from './constants.js';
import type { FiatCryptoLeg, FiatCryptoLegQuote } from './fiat-crypto-leg.js';
import { getFiatCryptoLeg } from './fiat-crypto-leg.js';
import { getDirectMusdFiatQuote } from './fiat-direct-musd.js';
import type { FiatQuote } from './types.js';
import {
  deriveFiatAssetForFiatPayment,
  getRampsQuote,
  isMoneyAccountDepositTransaction,
} from './utils.js';

const log = createModuleLogger(projectLogger, 'fiat-strategy');

type FiatQuotePipelineOptions = {
  amountFiat: string;
  fiatAsset: TransactionPayFiatAsset;
  fiatPaymentMethod: string;
  rampsWalletAddress: Hex;
  requiredTokens: TransactionPayRequiredToken[];
};

/**
 * Fetches MM Pay fiat strategy quotes using a crypto-leg-first estimation flow.
 *
 * The crypto leg is quoted by the relay strategy, or by the server strategy
 * when enabled by feature flag.
 *
 * When the direct-to-mUSD flag is enabled and the transaction is a Money
 * Account deposit, uses direct mUSD params (asset, wallet, recipient).
 * Otherwise, uses the standard ETH flow.
 *
 * @param request - Strategy quotes request.
 * @returns A single combined fiat strategy quote, or an empty array when inputs/quotes are unavailable.
 */
export async function getFiatQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<FiatQuote>[]> {
  const { messenger, transaction } = request;

  const state = messenger.call('TransactionPayController:getState');
  const transactionData = state.transactionData[transaction.id];
  const amountFiat = transactionData?.fiatPayment?.amountFiat;
  const requiredTokens = transactionData?.tokens ?? [];

  if (
    !amountFiat ||
    !request.fiatPaymentMethod ||
    requiredTokens.length !== 1
  ) {
    return [];
  }

  const useDirectMusd =
    getDirectMoneyMusdEnabled(messenger) &&
    isMoneyAccountDepositTransaction(transaction);

  if (useDirectMusd) {
    const requiredToken = requiredTokens[0];

    const directQuote = await getDirectMusdFiatQuote({
      amountFiat,
      fiatPaymentMethod: request.fiatPaymentMethod,
      messenger,
      moneyAccountAddress: transaction.txParams.from as Hex,
      requiredToken,
      transactionId: transaction.id,
    });

    return directQuote ? [directQuote] : [];
  }

  return executeFiatQuotePipeline(request, {
    amountFiat,
    fiatAsset: deriveFiatAssetForFiatPayment(transaction, messenger),
    fiatPaymentMethod: request.fiatPaymentMethod,
    rampsWalletAddress: request.from,
    requiredTokens,
  });
}

async function executeFiatQuotePipeline(
  request: PayStrategyGetQuotesRequest,
  options: FiatQuotePipelineOptions,
): Promise<TransactionPayQuote<FiatQuote>[]> {
  const {
    accountSupports7702,
    from: walletAddress,
    messenger,
    transaction,
  } = request;
  const {
    amountFiat,
    fiatAsset,
    fiatPaymentMethod,
    rampsWalletAddress,
    requiredTokens,
  } = options;
  const transactionId = transaction.id;
  const leg = getFiatCryptoLeg(messenger);

  try {
    const requiredToken = requiredTokens[0];

    const cryptoRequest = buildCryptoRequestFromAmountFiat({
      amountFiat,
      fiatAsset,
      messenger,
      requiredToken,
      walletAddress,
    });

    if (!cryptoRequest) {
      throw new Error(
        `Failed to build ${leg.name.toLowerCase()} request from fiat amount`,
      );
    }

    const cryptoQuotes = await leg.getQuotes({
      accountSupports7702,
      from: walletAddress,
      messenger,
      requests: [cryptoRequest],
      transaction,
    });

    const cryptoQuote = cryptoQuotes[0];
    if (!cryptoQuote) {
      throw new Error(
        `No ${leg.name.toLowerCase()} quote available for fiat estimation`,
      );
    }

    const isSourceNative =
      fiatAsset.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
    const gasDeductedFromSource =
      isSourceNative || cryptoQuote.fees.isSourceGasFeeToken === true;

    const cryptoTotalFeeUsd = gasDeductedFromSource
      ? getCryptoTotalFeeUsd(cryptoQuote)
      : getNonGasCryptoFeeUsd(cryptoQuote);
    const adjustedAmountFiat = new BigNumber(amountFiat).plus(
      cryptoTotalFeeUsd,
    );

    if (
      !adjustedAmountFiat.isFinite() ||
      !adjustedAmountFiat.gt(0) ||
      !cryptoTotalFeeUsd.isFinite() ||
      !cryptoTotalFeeUsd.gte(0)
    ) {
      throw new Error(
        `Invalid fiat amount after ${leg.name.toLowerCase()} fee adjustment`,
      );
    }

    const adjustedAmount = adjustedAmountFiat.toNumber();

    if (!Number.isFinite(adjustedAmount) || adjustedAmount <= 0) {
      throw new Error(
        `Invalid fiat amount after ${leg.name.toLowerCase()} fee adjustment`,
      );
    }

    log('Fiat quote flow', {
      adjustedAmountFiat: adjustedAmountFiat.toString(10),
      amountFiat,
      cryptoLeg: leg.name,
      cryptoTotalFeeUsd: cryptoTotalFeeUsd.toString(10),
      rampsWalletAddress,
      sourceAmountRaw: cryptoRequest.sourceTokenAmount,
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
        cryptoQuote,
        fiatQuote,
        leg,
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

function buildCryptoRequestFromAmountFiat({
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
    // amount, so the crypto leg should treat it as a fixed input rather than
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
 * Combines fiat and crypto legs into a single MM Pay fiat strategy quote.
 *
 * @param params - Combined quote inputs.
 * @param params.adjustedAmountFiat - Fiat amount sent to ramps after adding crypto leg fee estimate.
 * @param params.amountFiat - User-entered fiat amount.
 * @param params.cryptoQuote - Estimated crypto leg quote.
 * @param params.fiatQuote - Selected ramps quote, with fees already reconciled
 * to the resolved provider by `RampsController:getQuoteWithFees`.
 * @param params.leg - Strategy that provided the crypto leg quote.
 * @returns A single fiat strategy quote with split fee buckets.
 * @remarks
 * Fee mapping contract for MM Pay Fiat strategy:
 * - `fees.provider`: Total provider fee (crypto leg provider/swap fee + ramps provider/network fee).
 *   Consumed by UI transaction fee row and tooltip provider fee.
 * - `fees.providerFiat`: Fiat on-ramp provider fees only (`providerFee + networkFee` from ramps quote).
 *   Optional breakdown; client can derive crypto leg portion via `provider - providerFiat`.
 * - `fees.sourceNetwork` / `fees.targetNetwork`: Crypto leg settlement network fees.
 *   Consumed by UI transaction fee row and tooltip network fee.
 * - `fees.metaMask`: MM Pay fee (currently 100 bps over `amountFiat + adjustedAmountFiat`).
 *   Consumed by UI transaction fee row and tooltip MetaMask fee.
 * - `totals.total` should represent Amount + Transaction Fee using the totals pipeline.
 */
function combineQuotes({
  adjustedAmountFiat,
  amountFiat,
  cryptoQuote,
  fiatQuote,
  leg,
}: {
  adjustedAmountFiat: string;
  amountFiat: string;
  cryptoQuote: TransactionPayQuote<FiatCryptoLegQuote>;
  fiatQuote: RampsQuote;
  leg: FiatCryptoLeg;
}): TransactionPayQuote<FiatQuote> {
  const rampsProviderFee = getRampsProviderFee(fiatQuote);
  const totalProviderFee = new BigNumber(cryptoQuote.fees.provider.usd)
    .plus(rampsProviderFee)
    .toString(10);
  const rampsProviderFeeStr = rampsProviderFee.toString(10);
  const metaMaskFee = getMetaMaskFee({
    adjustedAmountFiat,
    amountFiat,
  }).toString(10);

  return {
    ...cryptoQuote,
    fees: {
      ...cryptoQuote.fees,
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
      ...leg.toFiatOriginal(cryptoQuote.original),
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

function getCryptoTotalFeeUsd(
  cryptoQuote: TransactionPayQuote<FiatCryptoLegQuote>,
): BigNumber {
  return new BigNumber(cryptoQuote.fees.provider.usd)
    .plus(cryptoQuote.fees.sourceNetwork.estimate.usd)
    .plus(cryptoQuote.fees.targetNetwork.usd)
    .plus(cryptoQuote.fees.metaMask.usd);
}

function getNonGasCryptoFeeUsd(
  cryptoQuote: TransactionPayQuote<FiatCryptoLegQuote>,
): BigNumber {
  return new BigNumber(cryptoQuote.fees.provider.usd)
    .plus(cryptoQuote.fees.targetNetwork.usd)
    .plus(cryptoQuote.fees.metaMask.usd);
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
