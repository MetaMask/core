/* eslint-disable require-atomic-updates */

import { Interface } from '@ethersproject/abi';
import { successfulFetch, toHex } from '@metamask/controller-utils';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { TOKEN_TRANSFER_FOUR_BYTE } from './constants';
import type { RelayQuote, RelayQuoteRequest } from './types';
import { TransactionPayStrategy } from '../..';
import type {
  BatchTransactionParams,
  TransactionMeta,
} from '../../../../transaction-controller/src';
import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
  CHAIN_ID_POLYGON,
  NATIVE_TOKEN_ADDRESS,
  STABLECOINS,
} from '../../constants';
import { projectLogger } from '../../logger';
import type {
  Amount,
  FiatRates,
  FiatValue,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types';
import {
  getEIP7702SupportedChains,
  getFeatureFlags,
  getGasBuffer,
  getSlippage,
} from '../../utils/feature-flags';
import { calculateGasCost, calculateGasFeeTokenCost } from '../../utils/gas';
import {
  getNativeToken,
  getTokenBalance,
  getTokenFiatRate,
} from '../../utils/token';

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
        getSingleQuote(singleRequest, request),
      ),
    );
  } catch (error) {
    log('Error fetching quotes', { error });
    throw new Error(`Failed to fetch Relay quotes: ${String(error)}`);
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

    const body: RelayQuoteRequest = {
      amount: useExactInput ? sourceTokenAmount : targetAmountMinimum,
      destinationChainId: Number(targetChainId),
      destinationCurrency: targetTokenAddress,
      originChainId: Number(sourceChainId),
      originCurrency: sourceTokenAddress,
      recipient: from,
      slippageTolerance,
      tradeType: useExactInput ? 'EXACT_INPUT' : 'EXPECTED_OUTPUT',
      user: from,
    };

    // Skip transaction processing for post-quote flows - the original transaction
    // will be included in the batch separately, not as part of the quote
    if (!request.isPostQuote) {
      await processTransactions(transaction, request, body, messenger);
    }

    const url = getFeatureFlags(messenger).relayQuoteUrl;

    log('Request body', { body, url });

    const response = await successfulFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const quote = (await response.json()) as RelayQuote;
    quote.request = body;

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

  const isPolygonNativeSource =
    request.sourceChainId === CHAIN_ID_POLYGON &&
    request.sourceTokenAddress === getNativeToken(request.sourceChainId);

  if (isPolygonNativeSource) {
    newRequest.sourceTokenAddress = NATIVE_TOKEN_ADDRESS;
  }

  if (isHyperliquidDeposit) {
    newRequest.targetChainId = CHAIN_ID_HYPERCORE;
    newRequest.targetTokenAddress = '0x00000000000000000000000000000000';
    newRequest.targetAmountMinimum = new BigNumber(request.targetAmountMinimum)
      .shiftedBy(2)
      .toString(10);

    log('Converting Arbitrum Hyperliquid deposit to direct deposit', {
      originalRequest: request,
      normalizedRequest: newRequest,
    });
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

  const metamask = {
    gasLimits,
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
 * Converts USD value to fiat value.
 *
 * @param usdValue - USD value.
 * @param usdToFiatRate - USD to fiat rate.
 * @returns Fiat value.
 */
function getFiatValueFromUsd(
  usdValue: BigNumber,
  usdToFiatRate: BigNumber,
): FiatValue {
  const fiatValue = usdValue.multipliedBy(usdToFiatRate);

  return {
    usd: usdValue.toString(10),
    fiat: fiatValue.toString(10),
  };
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
  const { sourceChainId, sourceTokenAddress } = request;

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
  }
> {
  const { from, sourceChainId, sourceTokenAddress } = request;

  const relayParams = quote.steps
    .flatMap((step) => step.items)
    .map((item) => item.data);

  const { relayDisabledGasStationChains } = getFeatureFlags(messenger);

  const { chainId, data, maxFeePerGas, maxPriorityFeePerGas, to, value } =
    relayParams[0];

  const { totalGasEstimate, totalGasLimit, gasLimits } =
    await calculateSourceNetworkGasLimit(
      relayParams,
      messenger,
      request.isPostQuote ? transaction : undefined,
    );

  log('Gas limit', {
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

  const result = { estimate, max, gasLimits };

  if (new BigNumber(nativeBalance).isGreaterThanOrEqualTo(max.raw)) {
    return result;
  }

  if (relayDisabledGasStationChains.includes(sourceChainId)) {
    log('Skipping gas station as disabled chain', {
      sourceChainId,
      disabledChainIds: relayDisabledGasStationChains,
    });

    return result;
  }

  const supportedChains = getEIP7702SupportedChains(messenger);
  const chainSupportsGasStation = supportedChains.some(
    (supportedChainId) =>
      supportedChainId.toLowerCase() === sourceChainId.toLowerCase(),
  );

  if (!chainSupportsGasStation) {
    log('Skipping gas station as chain does not support EIP-7702', {
      sourceChainId,
    });

    return result;
  }

  log('Checking gas fee tokens as insufficient native balance', {
    nativeBalance,
    max: max.raw,
  });

  const gasFeeTokens = await messenger.call(
    'TransactionController:getGasFeeTokens',
    {
      chainId: sourceChainId,
      data,
      from,
      to,
      value: toHex(value ?? '0'),
    },
  );

  log('Source gas fee tokens', { gasFeeTokens });

  const gasFeeToken = gasFeeTokens.find(
    (singleGasFeeToken) =>
      singleGasFeeToken.tokenAddress.toLowerCase() ===
      sourceTokenAddress.toLowerCase(),
  );

  if (!gasFeeToken) {
    log('No matching gas fee token found', {
      sourceTokenAddress,
      gasFeeTokens,
    });

    return result;
  }

  let finalAmount = gasFeeToken.amount;

  const hasMultipleTransactions =
    relayParams.length > 1 || gasLimits.length > 1;

  if (hasMultipleTransactions) {
    const gasRate = new BigNumber(gasFeeToken.amount, 16).dividedBy(
      gasFeeToken.gas,
      16,
    );

    const finalAmountValue = gasRate.multipliedBy(totalGasEstimate);

    finalAmount = toHex(finalAmountValue.toFixed(0));

    log('Estimated gas fee token amount for batch', {
      finalAmount: finalAmountValue.toString(10),
      gasRate: gasRate.toString(10),
      totalGasEstimate,
    });
  }

  const finalGasFeeToken = { ...gasFeeToken, amount: finalAmount };

  const gasFeeTokenCost = calculateGasFeeTokenCost({
    chainId: sourceChainId,
    gasFeeToken: finalGasFeeToken,
    messenger,
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
  };
}

/**
 * Calculate the total gas limit for the source network.
 *
 * For post-quote flows (e.g. predict withdrawals), the original transaction's
 * gas is combined with the relay gas so that source network cost accounts for
 * both the user's transaction and the relay transactions.
 *
 * @param params - Array of relay transaction parameters.
 * @param messenger - Controller messenger.
 * @param postQuoteTransaction - Original transaction for post-quote flows.
 * When provided, its gas is included in the returned totals.
 * @returns Total gas estimates and per-transaction gas limits.
 */
async function calculateSourceNetworkGasLimit(
  params: RelayQuote['steps'][0]['items'][0]['data'][],
  messenger: TransactionPayControllerMessenger,
  postQuoteTransaction?: TransactionMeta,
): Promise<{
  totalGasEstimate: number;
  totalGasLimit: number;
  gasLimits: number[];
}> {
  const relayGas =
    params.length === 1
      ? await calculateSourceNetworkGasLimitSingle(params[0], messenger)
      : await calculateSourceNetworkGasLimitBatch(params, messenger);

  if (!postQuoteTransaction?.txParams.to) {
    return relayGas;
  }

  return combinePostQuoteGas(relayGas, params.length, postQuoteTransaction);
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
 * @param relayParamCount - Number of relay transaction parameters.
 * @param transaction - Original transaction metadata.
 * @returns Combined gas estimates including the original transaction.
 */
function combinePostQuoteGas(
  relayGas: {
    totalGasEstimate: number;
    totalGasLimit: number;
    gasLimits: number[];
  },
  relayParamCount: number,
  transaction: TransactionMeta,
): { totalGasEstimate: number; totalGasLimit: number; gasLimits: number[] } {
  const nestedGas = transaction.nestedTransactions?.find((tx) => tx.gas)?.gas;
  const rawGas = nestedGas ?? transaction.txParams.gas;
  const originalTxGas = rawGas ? new BigNumber(rawGas).toNumber() : undefined;

  if (originalTxGas === undefined) {
    return relayGas;
  }

  let { gasLimits } = relayGas;
  const isEIP7702 = gasLimits.length === 1 && relayParamCount > 1;

  if (isEIP7702) {
    // EIP-7702: single combined gas limit — add the original tx gas
    // so the atomic batch covers both relay and original transactions.
    gasLimits = [gasLimits[0] + originalTxGas];
  } else {
    // Non-7702: individual gas limits — prepend the original tx gas
    // so the list order matches relay-submit's transaction order.
    gasLimits = [originalTxGas, ...gasLimits];
  }

  const totalGasEstimate = relayGas.totalGasEstimate + originalTxGas;
  const totalGasLimit = relayGas.totalGasLimit + originalTxGas;

  log('Combined original tx gas with relay gas', {
    originalTxGas,
    isEIP7702,
    gasLimits,
    totalGasLimit,
  });

  return { totalGasEstimate, totalGasLimit, gasLimits };
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

async function calculateSourceNetworkGasLimitSingle(
  params: RelayQuote['steps'][0]['items'][0]['data'],
  messenger: TransactionPayControllerMessenger,
): Promise<{
  totalGasEstimate: number;
  totalGasLimit: number;
  gasLimits: number[];
}> {
  const paramGasLimit = params.gas
    ? new BigNumber(params.gas).toNumber()
    : undefined;

  if (paramGasLimit) {
    log('Using single gas limit from params', { paramGasLimit });

    return {
      totalGasEstimate: paramGasLimit,
      totalGasLimit: paramGasLimit,
      gasLimits: [paramGasLimit],
    };
  }

  try {
    const {
      chainId: chainIdNumber,
      data,
      from,
      to,
      value: valueString,
    } = params;

    const chainId = toHex(chainIdNumber);
    const value = toHex(valueString ?? '0');
    const gasBuffer = getGasBuffer(messenger, chainId);

    const networkClientId = messenger.call(
      'NetworkController:findNetworkClientIdByChainId',
      chainId,
    );

    const { gas: gasHex, simulationFails } = await messenger.call(
      'TransactionController:estimateGas',
      { from, data, to, value },
      networkClientId,
    );

    const estimatedGas = new BigNumber(gasHex).toNumber();
    const bufferedGas = Math.ceil(estimatedGas * gasBuffer);

    if (!simulationFails) {
      log('Estimated gas limit for single transaction', {
        chainId,
        estimatedGas,
        bufferedGas,
        gasBuffer,
      });

      return {
        totalGasEstimate: bufferedGas,
        totalGasLimit: bufferedGas,
        gasLimits: [bufferedGas],
      };
    }
  } catch (error) {
    log('Failed to estimate gas limit for single transaction', error);
  }

  const fallbackGas = getFeatureFlags(messenger).relayFallbackGas;

  log('Using fallback gas for single transaction', { fallbackGas });

  return {
    totalGasEstimate: fallbackGas.estimate,
    totalGasLimit: fallbackGas.max,
    gasLimits: [fallbackGas.max],
  };
}

/**
 * Calculate the gas limits for a batch of transactions.
 *
 * @param params - Array of transaction parameters.
 * @param messenger - Controller messenger.
 * @returns - Gas limits.
 */
async function calculateSourceNetworkGasLimitBatch(
  params: RelayQuote['steps'][0]['items'][0]['data'][],
  messenger: TransactionPayControllerMessenger,
): Promise<{
  totalGasEstimate: number;
  totalGasLimit: number;
  gasLimits: number[];
}> {
  try {
    const { chainId: chainIdNumber, from } = params[0];
    const chainId = toHex(chainIdNumber);
    const gasBuffer = getGasBuffer(messenger, chainId);

    const transactions: BatchTransactionParams[] = params.map(
      (singleParams) => ({
        ...singleParams,
        gas: singleParams.gas ? toHex(singleParams.gas) : undefined,
        maxFeePerGas: undefined,
        maxPriorityFeePerGas: undefined,
        value: toHex(singleParams.value ?? '0'),
      }),
    );

    const paramGasLimits = params.map((singleParams) =>
      singleParams.gas ? new BigNumber(singleParams.gas).toNumber() : undefined,
    );

    const { totalGasLimit, gasLimits } = await messenger.call(
      'TransactionController:estimateGasBatch',
      {
        chainId,
        from,
        transactions,
      },
    );

    const bufferedGasLimits = gasLimits.map((limit, index) => {
      const useBuffer =
        gasLimits.length === 1 || paramGasLimits[index] !== gasLimits[index];

      const buffer = useBuffer ? gasBuffer : 1;

      return Math.ceil(limit * buffer);
    });

    const bufferedTotalGasLimit = bufferedGasLimits.reduce(
      (acc, limit) => acc + limit,
      0,
    );

    log('Estimated gas limit for batch', {
      chainId,
      totalGasLimit,
      gasLimits,
      bufferedTotalGasLimit,
      bufferedGasLimits,
      gasBuffer,
    });

    return {
      totalGasEstimate: bufferedTotalGasLimit,
      totalGasLimit: bufferedTotalGasLimit,
      gasLimits: bufferedGasLimits,
    };
  } catch (error) {
    log('Failed to estimate gas limit for batch', error);
  }

  const fallbackGas = getFeatureFlags(messenger).relayFallbackGas;

  const totalGasEstimate = params.reduce((acc, singleParams) => {
    const gas = singleParams.gas ?? fallbackGas.estimate;
    return acc + new BigNumber(gas).toNumber();
  }, 0);

  const gasLimits = params.map((singleParams) => {
    const gas = singleParams.gas ?? fallbackGas.max;
    return new BigNumber(gas).toNumber();
  });

  const totalGasLimit = gasLimits.reduce(
    (acc, singleGasLimit) => acc + singleGasLimit,
    0,
  );

  log('Using fallback gas for batch', {
    totalGasEstimate,
    totalGasLimit,
    gasLimits,
  });

  return {
    totalGasEstimate,
    totalGasLimit,
    gasLimits,
  };
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
