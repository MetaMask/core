/* eslint-disable require-atomic-updates */

import { Interface } from '@ethersproject/abi';
import { toHex } from '@metamask/controller-utils';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { TransactionPayStrategy } from '../..';
import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
  CHAIN_ID_POLYGON,
  HYPERCORE_USDC_ADDRESS,
  HYPERCORE_USDC_DECIMALS,
  NATIVE_TOKEN_ADDRESS,
  USDC_DECIMALS,
  STABLECOINS,
} from '../../constants';
import { projectLogger } from '../../logger';
import type {
  Amount,
  FiatRates,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import { getFiatValueFromUsd } from '../../utils/amounts';
import {
  getFeatureFlags,
  getRelayOriginGasOverhead,
  getSlippage,
  isEIP7702Chain,
  isRelayExecuteEnabled,
} from '../../utils/feature-flags';
import { calculateGasCost } from '../../utils/gas';
import { estimateQuoteGasLimits } from '../../utils/quote-gas';
import type { QuoteGasTransaction } from '../../utils/quote-gas';
import {
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
  normalizeTokenAddress,
  TokenAddressTarget,
} from '../../utils/token';
import { isPredictWithdrawTransaction } from '../../utils/transaction';
import { TOKEN_TRANSFER_FOUR_BYTE } from './constants';
import {
  getGasStationCostInSourceTokenRaw,
  getGasStationEligibility,
} from './gas-station';
import { fetchRelayQuote } from './relay-api';
import { getRelayMaxGasStationQuote } from './relay-max-gas-station';
import type {
  RelayQuote,
  RelayQuoteMetamask,
  RelayQuoteRequest,
  RelayTransactionStep,
} from './types';

const log = createModuleLogger(projectLogger, 'relay-strategy');

/**
 * Fetches Relay quotes.
 *
 * @param request - Request object.
 * @returns Array of quotes.
 */
export async function getRelayQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<RelayQuote>[]> {
  const { requests } = request;

  log('Fetching quotes', requests);

  try {
    const normalizedRequests = requests
      // Ignore gas fee token requests (which have both target=0 and source=0)
      // but keep post-quote requests (identified by isPostQuote flag)
      .filter(
        (singleRequest) =>
          singleRequest.targetAmountMinimum !== '0' ||
          singleRequest.isPostQuote,
      )
      .map((singleRequest) => normalizeRequest(singleRequest));

    log('Normalized requests', normalizedRequests);

    return await Promise.all(
      normalizedRequests.map((singleRequest) =>
        getQuoteWithMaxAmountHandling(singleRequest, request),
      ),
    );
  } catch (error) {
    log('Error fetching quotes', { error });
    throw new Error(`Failed to fetch Relay quotes: ${String(error)}`);
  }
}

async function getQuoteWithMaxAmountHandling(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<RelayQuote>> {
  const { isMaxAmount } = request;

  if (!isMaxAmount) {
    return getQuoteWithPostQuoteGasHandling(request, fullRequest);
  }

  return getRelayMaxGasStationQuote(request, fullRequest, getSingleQuote);
}

/**
 * For post-quote flows, fetch an initial quote to compute gas cost in source
 * token, then re-quote with the source amount reduced by the gas cost.
 * This ensures Relay reserves enough for the gas fee token payment.
 *
 * For non-post-quote flows, just returns a single quote.
 *
 * @param request - Quote request.
 * @param fullRequest - Full request context.
 * @returns The final quote (phase 2 for post-quote, or phase 1 for normal).
 */
async function getQuoteWithPostQuoteGasHandling(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<RelayQuote>> {
  const phase1Quote = await getSingleQuote(request, fullRequest);

  if (!request.isPostQuote || !phase1Quote.fees.isSourceGasFeeToken) {
    return phase1Quote;
  }

  const gasCostRaw = phase1Quote.fees.sourceNetwork.max.raw;

  const adjustedSourceAmount = new BigNumber(request.sourceTokenAmount)
    .minus(gasCostRaw)
    .integerValue(BigNumber.ROUND_DOWN);

  log('Subtracting gas from source for post-quote two-call', {
    originalSourceAmount: request.sourceTokenAmount,
    gasCostRaw,
    adjustedSourceAmount: adjustedSourceAmount.toString(10),
  });

  if (!adjustedSourceAmount.isGreaterThan(0)) {
    log(
      'Insufficient balance after gas subtraction for post-quote, using phase 1',
    );
    return phase1Quote;
  }

  try {
    const phase2Quote = await getSingleQuote(
      {
        ...request,
        sourceTokenAmount: adjustedSourceAmount.toFixed(
          0,
          BigNumber.ROUND_DOWN,
        ),
      },
      fullRequest,
    );

    if (
      phase1Quote.fees.isSourceGasFeeToken &&
      !phase2Quote.fees.isSourceGasFeeToken
    ) {
      log('Phase 2 lost gas fee token eligibility, falling back to phase 1');
      return phase1Quote;
    }

    return phase2Quote;
  } catch (error) {
    log('Phase 2 quote failed, falling back to phase 1', { error });
    return phase1Quote;
  }
}

/**
 * Fetches a single Relay quote.
 *
 * @param request  - Quote request.
 * @param fullRequest - Full quotes request.
 * @returns  Single quote.
 */
async function getSingleQuote(
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<RelayQuote>> {
  const { messenger, transaction } = fullRequest;

  const {
    from,
    isMaxAmount,
    sourceChainId,
    sourceTokenAddress,
    sourceTokenAmount,
    targetAmountMinimum,
    targetChainId,
    targetTokenAddress,
  } = request;

  const slippageDecimal = getSlippage(
    messenger,
    sourceChainId,
    sourceTokenAddress,
  );

  const slippageTolerance = new BigNumber(slippageDecimal * 100 * 100).toFixed(
    0,
  );

  try {
    // For post-quote or max amount flows, use EXACT_INPUT - user specifies how much to send,
    // and we show them how much they'll receive after fees.
    // For regular flows with a target amount, use EXPECTED_OUTPUT.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const useExactInput = isMaxAmount || request.isPostQuote;

    const useExecute =
      isRelayExecuteEnabled(messenger) &&
      isEIP7702Chain(messenger, sourceChainId);

    const body: RelayQuoteRequest = {
      amount: useExactInput ? sourceTokenAmount : targetAmountMinimum,
      destinationChainId: Number(targetChainId),
      destinationCurrency: targetTokenAddress,
      originChainId: Number(sourceChainId),
      originCurrency: sourceTokenAddress,
      ...(useExecute
        ? { originGasOverhead: getRelayOriginGasOverhead(messenger) }
        : {}),
      recipient: from,
      slippageTolerance,
      tradeType: useExactInput ? 'EXACT_INPUT' : 'EXPECTED_OUTPUT',
      user: from,
    };

    // Skip transaction processing for post-quote flows - the original transaction
    // will be included in the batch separately, not as part of the quote
    if (!request.isPostQuote) {
      await processTransactions(transaction, request, body, messenger);
    } else if (request.refundTo) {
      // For post-quote flows, honour the caller-specified refund address so that
      // failed Relay transactions refund to the correct account (e.g. the Predict
      // Safe proxy) rather than defaulting to the EOA.
      body.refundTo = request.refundTo;
    }

    log('Request body', body);

    const quote = await fetchRelayQuote(messenger, body);

    log('Fetched relay quote', quote);

    return await normalizeQuote(quote, request, fullRequest);
  } catch (error) {
    log('Error fetching relay quote', error);
    throw error;
  }
}

/**
 * Add tranasction data to request body if needed.
 *
 * @param transaction - Transaction metadata.
 * @param request - Quote request.
 * @param requestBody  - Request body to populate.
 * @param messenger  - Controller messenger.
 */
async function processTransactions(
  transaction: TransactionMeta,
  request: QuoteRequest,
  requestBody: RelayQuoteRequest,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const { nestedTransactions, txParams } = transaction;
  const { isMaxAmount, targetChainId } = request;
  const data = txParams?.data as Hex | undefined;

  const singleData =
    nestedTransactions?.length === 1 ? nestedTransactions[0].data : data;

  const isHypercore = targetChainId === CHAIN_ID_HYPERCORE;

  const isTokenTransfer =
    !isHypercore && Boolean(singleData?.startsWith(TOKEN_TRANSFER_FOUR_BYTE));

  if (isTokenTransfer) {
    requestBody.recipient = getTransferRecipient(singleData as Hex);

    log('Updating recipient as token transfer', requestBody.recipient);
  }

  const hasNoData = singleData === undefined || singleData === '0x';
  const skipDelegation = hasNoData || isTokenTransfer || isHypercore;

  if (skipDelegation) {
    log('Skipping delegation as token transfer or Hypercore deposit');
    return;
  }

  if (isMaxAmount) {
    throw new Error('Max amount quotes do not support included transactions');
  }

  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction },
  );

  const normalizedAuthorizationList = delegation.authorizationList?.map(
    (a) => ({
      ...a,
      chainId: Number(a.chainId),
      nonce: Number(a.nonce),
      r: a.r as Hex,
      s: a.s as Hex,
      yParity: Number(a.yParity),
    }),
  );

  requestBody.authorizationList = normalizedAuthorizationList;
  requestBody.tradeType = 'EXACT_OUTPUT';

  const tokenTransferData = nestedTransactions?.find((nestedTx) =>
    nestedTx.data?.startsWith(TOKEN_TRANSFER_FOUR_BYTE),
  )?.data;

  // If the transactions include a token transfer, change the recipient
  // so any extra dust is also sent to the same address, rather than back to the user.
  if (tokenTransferData) {
    requestBody.recipient = getTransferRecipient(tokenTransferData);
    requestBody.refundTo = request.from;
  }

  requestBody.txs = [
    {
      to: request.targetTokenAddress,
      data: buildTokenTransferData(request.from, request.targetAmountMinimum),
      value: '0x0',
    },
    {
      to: delegation.to,
      data: delegation.data,
      value: delegation.value,
    },
  ];
}

/**
 * Normalizes requests for Relay.
 *
 * @param request - Quote request to normalize.
 * @returns Normalized request.
 */
function normalizeRequest(request: QuoteRequest): QuoteRequest {
  const newRequest = {
    ...request,
  };

  const isHyperliquidDeposit =
    !request.isPostQuote &&
    request.targetChainId === CHAIN_ID_ARBITRUM &&
    request.targetTokenAddress.toLowerCase() ===
      ARBITRUM_USDC_ADDRESS.toLowerCase();

  newRequest.sourceTokenAddress = normalizeTokenAddress(
    newRequest.sourceTokenAddress,
    newRequest.sourceChainId,
    TokenAddressTarget.Relay,
  );
  newRequest.targetTokenAddress = normalizeTokenAddress(
    newRequest.targetTokenAddress,
    newRequest.targetChainId,
    TokenAddressTarget.Relay,
  );

  if (isHyperliquidDeposit) {
    newRequest.targetChainId = CHAIN_ID_HYPERCORE;
    newRequest.targetTokenAddress = HYPERCORE_USDC_ADDRESS;
    newRequest.targetAmountMinimum = new BigNumber(request.targetAmountMinimum)
      .shiftedBy(HYPERCORE_USDC_DECIMALS - USDC_DECIMALS)
      .toString(10);

    log('Converting Arbitrum Hyperliquid deposit to direct deposit', {
      originalRequest: request,
      normalizedRequest: newRequest,
    });
  }

  // HyperLiquid withdrawal: source is HyperCore Perps USDC, not Arbitrum.
  if (request.isHyperliquidSource) {
    newRequest.sourceChainId = CHAIN_ID_HYPERCORE;
    newRequest.sourceTokenAddress = HYPERCORE_USDC_ADDRESS;

    if (newRequest.sourceTokenAmount) {
      newRequest.sourceTokenAmount = new BigNumber(newRequest.sourceTokenAmount)
        .shiftedBy(HYPERCORE_USDC_DECIMALS - USDC_DECIMALS)
        .toString(10);
    }
  }

  return newRequest;
}

/**
 * Normalizes a Relay quote into a TransactionPayQuote.
 *
 * @param quote - Relay quote.
 * @param request - Original quote request.
 * @param fullRequest - Full quotes request.
 * @returns Normalized quote.
 */
async function normalizeQuote(
  quote: RelayQuote,
  request: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<RelayQuote>> {
  const { messenger } = fullRequest;
  const { details } = quote;
  const { currencyIn, currencyOut } = details;

  const { usdToFiatRate } = getFiatRates(messenger, request);

  const dust = getFiatValueFromUsd(
    calculateDustUsd(quote, request),
    usdToFiatRate,
  );

  const subsidizedFeeUsd = getSubsidizedFeeAmountUsd(quote);

  const appFeeUsd = new BigNumber(quote.fees?.app?.amountUsd ?? '0');
  const metaMaskFee = getFiatValueFromUsd(appFeeUsd, usdToFiatRate);

  // Subtract app fee from provider fee since totalImpact.usd already includes it
  const providerFeeUsd = calculateProviderFee(quote).minus(appFeeUsd);
  const provider = subsidizedFeeUsd.gt(0)
    ? { usd: '0', fiat: '0' }
    : getFiatValueFromUsd(providerFeeUsd, usdToFiatRate);

  const {
    gasLimits,
    is7702,
    isGasFeeToken: isSourceGasFeeToken,
    ...sourceNetwork
  } = await calculateSourceNetworkCost(
    quote,
    messenger,
    request,
    fullRequest.transaction,
  );

  const targetNetwork = {
    usd: '0',
    fiat: '0',
  };

  const sourceAmount: Amount = {
    human: currencyIn.amountFormatted,
    raw: currencyIn.amount,
    ...getFiatValueFromUsd(new BigNumber(currencyIn.amountUsd), usdToFiatRate),
  };

  const isTargetStablecoin = isStablecoin(
    request.targetChainId,
    request.targetTokenAddress,
  );

  const additionalTargetAmountUsd =
    quote.request.tradeType === 'EXACT_INPUT'
      ? subsidizedFeeUsd
      : new BigNumber(0);

  if (additionalTargetAmountUsd.gt(0)) {
    log(
      'Including subsidized fee in target amount',
      additionalTargetAmountUsd.toString(10),
    );
  }

  const baseTargetAmountUsd = isTargetStablecoin
    ? new BigNumber(currencyOut.amountFormatted)
    : new BigNumber(currencyOut.amountUsd);

  const targetAmountUsd = baseTargetAmountUsd.plus(additionalTargetAmountUsd);

  const targetAmount = getFiatValueFromUsd(targetAmountUsd, usdToFiatRate);

  const metamask: RelayQuoteMetamask = {
    ...quote.metamask,
    gasLimits: is7702 ? [gasLimits[0]] : gasLimits,
    is7702,
  };

  return {
    dust,
    estimatedDuration: details.timeEstimate,
    fees: {
      isSourceGasFeeToken,
      metaMask: metaMaskFee,
      provider,
      sourceNetwork,
      targetNetwork,
    },
    original: {
      ...quote,
      metamask,
    },
    request,
    sourceAmount,
    targetAmount,
    strategy: TransactionPayStrategy.Relay,
  };
}

/**
 * Calculate dust USD value.
 *
 * @param quote - Relay quote.
 * @param request - Quote request.
 * @returns Dust value in USD and fiat.
 */
function calculateDustUsd(quote: RelayQuote, request: QuoteRequest): BigNumber {
  const { currencyOut } = quote.details;
  const { amountUsd, amountFormatted, minimumAmount } = currencyOut;
  const { decimals: targetDecimals } = currencyOut.currency;

  const targetUsdRate = new BigNumber(amountUsd).dividedBy(amountFormatted);

  const dustRaw = new BigNumber(minimumAmount).minus(
    request.targetAmountMinimum,
  );

  return dustRaw.shiftedBy(-targetDecimals).multipliedBy(targetUsdRate);
}

/**
 * Calculates USD to fiat rate.
 *
 * @param messenger - Controller messenger.
 * @param request - Quote request.
 * @returns USD to fiat rate.
 */
function getFiatRates(
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
): {
  sourceFiatRate: FiatRates;
  usdToFiatRate: BigNumber;
} {
  // For HyperLiquid source, the normalized chain/token (HyperCore + Perps USDC)
  // won't have a fiat rate entry. Use Arbitrum USDC instead since Perps USDC
  // is pegged 1:1.
  const sourceChainId = request.isHyperliquidSource
    ? CHAIN_ID_ARBITRUM
    : request.sourceChainId;
  const sourceTokenAddress = request.isHyperliquidSource
    ? ARBITRUM_USDC_ADDRESS
    : request.sourceTokenAddress;

  const finalSourceTokenAddress =
    sourceChainId === CHAIN_ID_POLYGON &&
    sourceTokenAddress === NATIVE_TOKEN_ADDRESS
      ? getNativeToken(sourceChainId)
      : sourceTokenAddress;

  const sourceFiatRate = getTokenFiatRate(
    messenger,
    finalSourceTokenAddress,
    sourceChainId,
  );

  if (!sourceFiatRate) {
    throw new Error('Source token fiat rate not found');
  }

  const usdToFiatRate = new BigNumber(sourceFiatRate.fiatRate).dividedBy(
    sourceFiatRate.usdRate,
  );

  return { sourceFiatRate, usdToFiatRate };
}

/**
 * Calculates source network cost from a Relay quote.
 *
 * For post-quote flows (e.g. predictWithdraw), the cost also includes the
 * original transaction's gas (the user's Polygon USDC.e transfer) in addition
 * to the Relay deposit transaction gas, by appending the original
 * transaction's params so that gas estimation and gas-fee-token logic handle
 * both transactions together.
 *
 * When the execute flow is active (indicated by `quote.metamask.isExecute`),
 * network fees are zeroed because the relayer covers them.
 *
 * @param quote - Relay quote.
 * @param messenger - Controller messenger.
 * @param request - Quote request.
 * @param transaction - Original transaction metadata.
 * @returns Total source network cost in USD and fiat.
 */
async function calculateSourceNetworkCost(
  quote: RelayQuote,
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
  transaction: TransactionMeta,
): Promise<
  TransactionPayQuote<RelayQuote>['fees']['sourceNetwork'] & {
    gasLimits: number[];
    isGasFeeToken?: boolean;
    is7702: boolean;
  }
> {
  const { from, sourceChainId, sourceTokenAddress } = request;

  if (quote.metamask?.isExecute) {
    log('Zeroing network fees for execute flow');

    const zeroAmount = { fiat: '0', human: '0', raw: '0', usd: '0' };

    return {
      estimate: zeroAmount,
      max: zeroAmount,
      gasLimits: [],
      is7702: false,
    };
  }

  // HyperLiquid withdrawals are gasless -- the "deposit" step is an HL
  // sendAsset (off-chain signature), not an on-chain transaction.
  if (request.isHyperliquidSource) {
    log('Zeroing network fees for HyperLiquid withdrawal (gasless)');

    const zeroAmount = { fiat: '0', human: '0', raw: '0', usd: '0' };

    return {
      estimate: zeroAmount,
      max: zeroAmount,
      gasLimits: [],
      is7702: false,
    };
  }

  const txSteps = quote.steps.filter(
    (step): step is RelayTransactionStep => step.kind === 'transaction',
  );
  const relayParams = txSteps
    .flatMap((step) => step.items)
    .map((item) => item.data);

  const { chainId, data, maxFeePerGas, maxPriorityFeePerGas, to, value } =
    relayParams[0];

  const isPredictWithdraw =
    request.isPostQuote && isPredictWithdrawTransaction(transaction);

  const fromOverride = isPredictWithdraw ? request.refundTo : undefined;

  const relayOnlyGas = await calculateSourceNetworkGasLimit(
    relayParams,
    messenger,
    fromOverride,
  );

  const { gasLimits, is7702, totalGasEstimate, totalGasLimit } =
    request.isPostQuote
      ? combinePostQuoteGas(relayOnlyGas, transaction)
      : relayOnlyGas;

  log('Gas limit', {
    is7702,
    totalGasEstimate,
    totalGasLimit,
    gasLimits,
  });

  const estimate = calculateGasCost({
    chainId,
    gas: totalGasEstimate,
    maxFeePerGas,
    maxPriorityFeePerGas,
    messenger,
  });

  const max = calculateGasCost({
    chainId,
    gas: totalGasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    messenger,
    isMax: true,
  });

  const nativeBalance = getTokenBalance(
    messenger,
    from,
    sourceChainId,
    getNativeToken(sourceChainId),
  );

  const result = { estimate, max, gasLimits, is7702 };

  if (new BigNumber(nativeBalance).isGreaterThanOrEqualTo(max.raw)) {
    return result;
  }

  const gasStationEligibility = getGasStationEligibility(
    messenger,
    sourceChainId,
  );

  if (gasStationEligibility.isDisabledChain) {
    log('Skipping gas station as disabled chain', {
      sourceChainId,
    });

    return result;
  }

  if (!gasStationEligibility.chainSupportsGasStation) {
    log('Skipping gas station as chain does not support EIP-7702', {
      sourceChainId,
    });

    return result;
  }

  log('Checking gas fee tokens as insufficient native balance', {
    nativeBalance,
    max: max.raw,
  });

  if (isPredictWithdraw && request.refundTo) {
    log('Using proxy address for predict withdraw gas station simulation', {
      proxyAddress: request.refundTo,
      sourceTokenAddress,
      totalGasEstimate,
    });

    const gasFeeTokenCost = await getGasStationCostInSourceTokenRaw({
      firstStepData: {
        data,
        to,
        value,
      },
      messenger,
      request: {
        from: request.refundTo,
        sourceChainId,
        sourceTokenAddress,
      },
      totalGasEstimate,
      totalItemCount: relayParams.length + 1,
    });

    if (gasFeeTokenCost) {
      log('Using predict withdraw gas fee token for source network', {
        gasFeeTokenCost,
      });

      return {
        isGasFeeToken: true,
        estimate: gasFeeTokenCost,
        max: gasFeeTokenCost,
        gasLimits,
        is7702,
      };
    }

    return result;
  }

  const gasFeeTokenCost = await getGasStationCostInSourceTokenRaw({
    firstStepData: {
      data,
      to,
      value,
    },
    messenger,
    request: {
      from,
      sourceChainId,
      sourceTokenAddress,
    },
    totalGasEstimate,
    totalItemCount: Math.max(relayParams.length, gasLimits.length),
  });

  if (!gasFeeTokenCost) {
    return result;
  }

  log('Using gas fee token for source network', {
    gasFeeTokenCost,
  });

  return {
    isGasFeeToken: true,
    estimate: gasFeeTokenCost,
    max: gasFeeTokenCost,
    gasLimits,
    is7702,
  };
}

/**
 * Calculate the total gas limit for the source network.
 *
 * @param params - Array of relay transaction parameters.
 * @param messenger - Controller messenger.
 * @param fromOverride - Optional address to use as `from` in gas estimation
 * instead of the address in the relay params. Used in predict withdraw flows
 * to estimate with the proxy/Safe address that holds the source token balance.
 * @returns Total gas estimates and per-transaction gas limits.
 */
async function calculateSourceNetworkGasLimit(
  params: RelayTransactionStep['items'][0]['data'][],
  messenger: TransactionPayControllerMessenger,
  fromOverride?: Hex,
): Promise<{
  totalGasEstimate: number;
  totalGasLimit: number;
  gasLimits: number[];
  is7702: boolean;
}> {
  const transactions = params.map((singleParams) =>
    toRelayQuoteGasTransaction(singleParams, fromOverride),
  );

  const relayGasResult = await estimateQuoteGasLimits({
    fallbackGas: getFeatureFlags(messenger).relayFallbackGas,
    fallbackOnSimulationFailure: true,
    messenger,
    transactions,
  });

  return {
    gasLimits: relayGasResult.gasLimits.map((gasLimit) => gasLimit.max),
    is7702: relayGasResult.is7702,
    totalGasEstimate: relayGasResult.totalGasEstimate,
    totalGasLimit: relayGasResult.totalGasLimit,
  };
}

function toRelayQuoteGasTransaction(
  singleParams: RelayTransactionStep['items'][0]['data'],
  fromOverride?: Hex,
): QuoteGasTransaction {
  return {
    chainId: toHex(singleParams.chainId),
    data: singleParams.data,
    from: fromOverride ?? singleParams.from,
    gas: fromOverride ? undefined : singleParams.gas,
    to: singleParams.to,
    value: singleParams.value ?? '0',
  };
}

/**
 * Combine the original transaction's gas with relay gas for post-quote flows.
 *
 * Prefers gas from `nestedTransactions` (preserves the caller-provided value)
 * since TransactionController may re-estimate `txParams.gas` during batch
 * creation.
 *
 * @param relayGas - Gas estimates from relay transactions.
 * @param relayGas.totalGasEstimate - Estimated gas total.
 * @param relayGas.totalGasLimit - Maximum gas total.
 * @param relayGas.gasLimits - Per-transaction gas limits.
 * @param relayGas.is7702 - Whether the relay gas came from a combined 7702 batch estimate.
 * @param transaction - Original transaction metadata.
 * @returns Combined gas estimates including the original transaction.
 */
function combinePostQuoteGas(
  relayGas: {
    totalGasEstimate: number;
    totalGasLimit: number;
    gasLimits: number[];
    is7702: boolean;
  },
  transaction: TransactionMeta,
): {
  totalGasEstimate: number;
  totalGasLimit: number;
  gasLimits: number[];
  is7702: boolean;
} {
  const nestedGas = transaction.nestedTransactions?.find((tx) => tx.gas)?.gas;
  const rawGas = nestedGas ?? transaction.txParams.gas;
  const originalTxGas = rawGas ? new BigNumber(rawGas).toNumber() : undefined;

  if (originalTxGas === undefined) {
    return relayGas;
  }

  let { gasLimits } = relayGas;

  if (relayGas.is7702) {
    // Combined 7702 gas limit — add the original tx gas so the batch
    // keeps using a single 7702 limit.
    gasLimits = [gasLimits[0] + originalTxGas];
  } else {
    // Multiple individual gas limits — prepend the original tx gas
    // so the list order matches relay-submit's transaction order.
    gasLimits = [originalTxGas, ...gasLimits];
  }

  const totalGasEstimate = relayGas.totalGasEstimate + originalTxGas;
  const totalGasLimit = relayGas.totalGasLimit + originalTxGas;

  log('Combined original tx gas with relay gas', {
    originalTxGas,
    is7702: relayGas.is7702,
    gasLimits,
    totalGasLimit,
  });

  return {
    totalGasEstimate,
    totalGasLimit,
    gasLimits,
    is7702: relayGas.is7702,
  };
}

/**
 * Calculate the provider fee for a Relay quote.
 *
 * @param quote - Relay quote.
 * @returns - Provider fee in USD.
 */
function calculateProviderFee(quote: RelayQuote): BigNumber {
  return new BigNumber(quote.details.totalImpact.usd).abs();
}

/**
 * Build token transfer data.
 *
 * @param recipient - Recipient address.
 * @param amountRaw - Amount in raw format.
 * @returns Token transfer data.
 */
function buildTokenTransferData(recipient: Hex, amountRaw: string): Hex {
  return new Interface([
    'function transfer(address to, uint256 amount)',
  ]).encodeFunctionData('transfer', [recipient, amountRaw]) as Hex;
}

/**
 * Get transfer recipient from token transfer data.
 *
 * @param data - Token transfer data.
 * @returns Transfer recipient.
 */
function getTransferRecipient(data: Hex): Hex {
  return new Interface(['function transfer(address to, uint256 amount)'])
    .decodeFunctionData('transfer', data)
    .to.toLowerCase();
}
function getSubsidizedFeeAmountUsd(quote: RelayQuote): BigNumber {
  const subsidizedFee = quote.fees?.subsidized;
  const amountUsd = new BigNumber(subsidizedFee?.amountUsd ?? '0');
  const amountFormatted = new BigNumber(subsidizedFee?.amountFormatted ?? '0');

  if (!subsidizedFee || amountUsd.isZero()) {
    return new BigNumber(0);
  }

  const isSubsidizedStablecoin = isStablecoin(
    toHex(subsidizedFee.currency.chainId),
    subsidizedFee.currency.address,
  );

  return isSubsidizedStablecoin ? amountFormatted : amountUsd;
}

function isStablecoin(chainId: string, tokenAddress: string): boolean {
  return Boolean(
    STABLECOINS[chainId as Hex]?.includes(tokenAddress.toLowerCase() as Hex),
  );
}
