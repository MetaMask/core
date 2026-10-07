/* eslint-disable require-atomic-updates */

import { Interface } from '@ethersproject/abi';
import { toHex } from '@metamask/controller-utils';
import type {
  AuthorizationList,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
  CHAIN_ID_POLYGON,
  HYPERCORE_USDC_ADDRESS,
  HYPERCORE_USDC_DECIMALS,
  NATIVE_TOKEN_ADDRESS,
  PERPS_DEPOSIT_TYPES,
  USDC_DECIMALS,
  PaymentOverride,
} from '../../constants.js';
import { TransactionPayStrategy } from '../../index.js';
import { projectLogger } from '../../logger.js';
import type {
  Amount,
  FiatRates,
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../../types.js';
import { getFiatValueFromUsd } from '../../utils/amounts.js';
import {
  getRelayOriginGasOverhead,
  getSlippage,
  getStablecoins,
  isAtomicMaxEnabled,
  isEIP7702Chain,
  isRelayExecuteEnabled,
} from '../../utils/feature-flags.js';
import {
  GasPaymentMode,
  resolveGasPayment,
  resolveGasStationCost,
} from '../../utils/gas-payment.js';
import { calculateGasCost } from '../../utils/gas.js';
import {
  getPolymarketDepositWalletOverrides,
  getPredictWithdrawFeeTokenAccount,
  getPredictWithdrawSafeAddress,
} from '../../utils/polymarket/withdraw.js';
import {
  estimateSourceGas,
  reservePostQuoteGas,
} from '../../utils/post-quote.js';
import type { QuoteGasTransaction } from '../../utils/quote-gas.js';
import { resolveNonAtomicRecipient } from '../../utils/second-leg.js';
import {
  getNativeToken,
  getTokenFiatRate,
  normalizeTokenAddress,
  TokenAddressTarget,
} from '../../utils/token.js';
import { getQuotePricing } from '../../utils/trade-type.js';
import { TOKEN_TRANSFER_FOUR_BYTE } from './constants.js';
import { hasRelayDepositStep } from './deposit-step.js';
import { applyHyperliquidActivationFee } from './hyperliquid-activation.js';
import { fetchRelayQuote } from './relay-api.js';
import {
  getRelayMaxQuote,
  isSubsidizedAtomicMaxQuote,
  throwAtomicPromotionFailed,
} from './relay-max.js';
import { validateRelayQuotes } from './relay-validation.js';
import type {
  RelayQuote,
  RelayQuoteMetamask,
  RelayQuoteRequest,
  RelayTransactionStep,
} from './types.js';

const log = createModuleLogger(projectLogger, 'relay-strategy');

const ZERO_AMOUNT = { fiat: '0', human: '0', raw: '0', usd: '0' };

type RelayQuoteRequestDraft = Omit<RelayQuoteRequest, 'amount' | 'tradeType'> &
  Partial<Pick<RelayQuoteRequest, 'amount'>>;

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
    const normalizedRequests = await Promise.all(
      requests
        .filter((singleRequest) => {
          const hasTargetMinimum = singleRequest.targetAmountMinimum !== '0';
          const isPostQuote = Boolean(singleRequest.isPostQuote);
          const isExactInputRequest =
            Boolean(singleRequest.isMaxAmount) &&
            new BigNumber(singleRequest.sourceTokenAmount).gt(0);

          return hasTargetMinimum || isPostQuote || isExactInputRequest;
        })
        .map((singleRequest) =>
          normalizeRequest(singleRequest, request.transaction),
        )
        .map((normalizedRequest) =>
          applyHyperliquidActivationFee(
            normalizedRequest,
            request.messenger,
            request.transaction,
            request.signal,
          ),
        ),
    );

    log('Normalized requests', normalizedRequests);

    const quotes = await Promise.all(
      normalizedRequests.map((singleRequest) =>
        getQuoteWithMaxAmountHandling(singleRequest, request),
      ),
    );

    const atomicMaxQuotes = quotes.filter(isSubsidizedAtomicMaxQuote);
    const otherQuotes = quotes.filter(
      (quote) => !isSubsidizedAtomicMaxQuote(quote),
    );

    if (otherQuotes.length > 0) {
      await validateRelayQuotes({
        messenger: request.messenger,
        quotes: otherQuotes,
        signal: request.signal,
        transaction: request.transaction,
      });
    }

    if (atomicMaxQuotes.length > 0) {
      try {
        await validateRelayQuotes({
          messenger: request.messenger,
          quotes: atomicMaxQuotes,
          signal: request.signal,
          transaction: request.transaction,
        });
      } catch (error) {
        throwAtomicPromotionFailed(error);
      }
    }

    return quotes;
  } catch (error) {
    log('Error fetching quotes', { error });
    throw error;
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

  return getRelayMaxQuote(request, fullRequest, getSingleQuote);
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

  if (!request.isPostQuote) {
    return phase1Quote;
  }

  if (phase1Quote.original.metamask?.isExecute) {
    return phase1Quote;
  }

  return await reservePostQuoteGas({
    quote: phase1Quote,
    requote: (adjustedRequest) => getSingleQuote(adjustedRequest, fullRequest),
  });
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
  const {
    accountSupports7702: supports7702,
    messenger,
    signal,
    transaction,
  } = fullRequest;

  const {
    from,
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
    const useExecute =
      supports7702 &&
      isRelayExecuteEnabled(messenger) &&
      isEIP7702Chain(messenger, sourceChainId);

    const nonAtomicRecipient = await resolveNonAtomicRecipient(
      transaction,
      request,
      messenger,
    );

    const effectiveRequest = nonAtomicRecipient
      ? { ...request, recipient: nonAtomicRecipient }
      : request;

    const body: RelayQuoteRequestDraft = {
      destinationChainId: Number(targetChainId),
      destinationCurrency: targetTokenAddress,
      originChainId: Number(sourceChainId),
      originCurrency: sourceTokenAddress,
      ...(useExecute
        ? {
            originGasOverhead: getRelayOriginGasOverhead(messenger),
            metamask: { executeVersion: 2 },
          }
        : {}),
      recipient: effectiveRequest.recipient ?? from,
      slippageTolerance,
      user: from,
    };

    if (effectiveRequest.isPolymarketDepositWallet) {
      const overrides = await getPolymarketDepositWalletOverrides(
        from,
        messenger,
      );
      const { depositWallet } = overrides;

      body.originCurrency = overrides.sourceTokenAddress;
      body.user = depositWallet;
      body.refundTo = depositWallet;
      body.useDepositAddress = true;
      body.strict = true;
    }

    const isAtomic = effectiveRequest.atomic !== false;

    const processedTransactions = await processTransactions(
      transaction,
      effectiveRequest,
      body,
      messenger,
    );

    if (
      !processedTransactions &&
      isAtomic &&
      effectiveRequest.isPostQuote &&
      effectiveRequest.paymentOverride === PaymentOverride.MoneyAccount
    ) {
      await processMoneyAccountPostQuote(
        transaction,
        effectiveRequest,
        body,
        messenger,
      );
    } else if (!processedTransactions && effectiveRequest.refundTo) {
      // For post-quote flows, honour the caller-specified refund address so that
      // failed Relay transactions refund to the correct account (e.g. the Predict
      // Safe proxy) rather than defaulting to the EOA.
      body.refundTo = effectiveRequest.refundTo;
    }

    const pricing = getQuotePricing({
      hasCalls: Boolean(body.txs?.length),
      sourceTokenAmount,
      targetAmountMinimum,
      transaction,
    });

    const finalBody: RelayQuoteRequest = {
      ...body,
      // A step that bundled its own calls has already pinned the amount those
      // calls consume, so it wins over the derived amount.
      amount: body.amount ?? pricing.amount,
      tradeType: pricing.tradeType,
    };

    log('Request body', finalBody);

    const quote = await fetchRelayQuote(messenger, finalBody, signal);

    log('Fetched relay quote', quote);

    return await normalizeQuote(quote, effectiveRequest, fullRequest);
  } catch (error) {
    log('Error fetching relay quote', error);
    throw error;
  }
}

function normalizeAuthorizationList(
  authorizationList: AuthorizationList | undefined,
): RelayQuoteRequest['authorizationList'] {
  return authorizationList?.map((a) => ({
    ...a,
    chainId: Number(a.chainId),
    nonce: Number(a.nonce),
    r: a.r as Hex,
    s: a.s as Hex,
    yParity: Number(a.yParity),
  }));
}

/**
 * Add tranasction data to request body if needed.
 *
 * @param transaction - Transaction metadata.
 * @param request - Quote request.
 * @param requestBody  - Request body to populate.
 * @param messenger  - Controller messenger.
 * @returns `true` when the transaction was embedded in the quote; `false` when
 * skipped so the caller can route to an alternate handler.
 */
async function processTransactions(
  transaction: TransactionMeta,
  request: QuoteRequest,
  requestBody: RelayQuoteRequestDraft,
  messenger: TransactionPayControllerMessenger,
): Promise<boolean> {
  // Skip when skipProcessTransactions (defaulting to isPostQuote) is set — the
  // original transaction is submitted separately, not embedded in the quote.
  // Skip Polymarket deposit wallet flows — the source is already a bridged
  // token transfer, not a contract call to embed. Skip non-atomic flows — the
  // second leg is submitted after Relay settlement.
  if (
    (request.skipProcessTransactions ?? request.isPostQuote) === true ||
    request.isPolymarketDepositWallet === true ||
    request.atomic === false
  ) {
    return false;
  }

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
    return true;
  }

  // Eligible atomic max requests carry a destination amount, so the calls
  // below use EXACT_OUTPUT rather than the usual max EXACT_INPUT quote.
  if (
    isMaxAmount &&
    (request.isPostQuote === true ||
      !isAtomicMaxEnabled(messenger, transaction))
  ) {
    throw new Error('Max amount quotes do not support included transactions');
  }

  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction },
  );

  requestBody.authorizationList = normalizeAuthorizationList(
    delegation.authorizationList,
  );

  const tokenTransferData = nestedTransactions?.find((nestedTx) =>
    nestedTx.data?.startsWith(TOKEN_TRANSFER_FOUR_BYTE),
  )?.data;

  // If the transactions include a token transfer, change the recipient
  // so any extra dust is also sent to the same address, rather than back to the user.
  if (tokenTransferData) {
    requestBody.recipient = getTransferRecipient(tokenTransferData);
    requestBody.refundTo = request.from;
  }

  const fundingRecipient = (transaction.txParams?.from as Hex) ?? request.from;

  requestBody.txs = [
    {
      to: request.targetTokenAddress,
      data: buildTokenTransferData(
        fundingRecipient,
        request.targetAmountMinimum,
      ),
      value: '0x0',
    },
    {
      to: delegation.to,
      data: delegation.data,
      value: delegation.value,
    },
  ];

  return true;
}

async function processMoneyAccountPostQuote(
  transaction: TransactionMeta,
  request: QuoteRequest,
  requestBody: RelayQuoteRequestDraft,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const { transactionData: transactionDataList } = messenger.call(
    'TransactionPayController:getState',
  );

  const transactionData = transactionDataList[transaction.id];
  const amountHuman = transactionData?.tokens?.[0]?.amountHuman ?? '0';

  const {
    calls: overrideCalls,
    recipient,
    authorizationList,
  } = await messenger.call('TransactionPayController:getPaymentOverrideData', {
    amount: amountHuman,
    transaction,
    transactionData,
  });

  if (!overrideCalls.length) {
    log('No payment override calls for money account post-quote');
    return;
  }

  const fundingRecipient = recipient ?? request.from;
  const rawAmount = transactionData?.tokens?.[0]?.amountRaw ?? '0';

  requestBody.authorizationList = normalizeAuthorizationList(authorizationList);
  requestBody.amount = rawAmount;
  requestBody.txs = [
    {
      to: request.targetTokenAddress,
      data: buildTokenTransferData(fundingRecipient, rawAmount),
      value: '0x0',
    },
    ...overrideCalls.map((call) => ({
      to: call.to as Hex,
      data: call.data as Hex,
      value: (call.value as Hex) ?? '0x0',
    })),
  ];

  log('Added money account deposit calls to quote body', {
    callCount: overrideCalls.length,
  });
}

/**
 * Normalizes requests for Relay.
 *
 * @param request - Quote request to normalize.
 * @param transaction - Parent transaction metadata, used to gate
 * Hyperliquid-specific rewrites on transaction type.
 * @returns Normalized request.
 */
function normalizeRequest(
  request: QuoteRequest,
  transaction: TransactionMeta,
): QuoteRequest {
  const newRequest = {
    ...request,
  };

  const isPerpsDeposit =
    transaction.type !== undefined &&
    PERPS_DEPOSIT_TYPES.includes(transaction.type);

  const isHyperliquidDeposit =
    isPerpsDeposit &&
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

  const subsidizedFeeUsd = getSubsidizedFeeAmountUsd(messenger, quote);

  const appFeeUsd = new BigNumber(quote.fees?.app?.amountUsd ?? '0');
  const metaMaskFee = getFiatValueFromUsd(appFeeUsd, usdToFiatRate);

  // Subtract app fee from provider fee since totalImpact.usd already includes
  // it. The relay provider fee is forced to zero when the quote is subsidized,
  // but any reserved HyperLiquid activation fee is withheld from the source
  // send regardless, so it must always be surfaced in the provider fee.
  const activationFeeUsd = new BigNumber(
    request.hyperliquidActivationFeeUsd ?? '0',
  );
  const providerFeeUsd = subsidizedFeeUsd.gt(0)
    ? activationFeeUsd
    : calculateProviderFee(quote).minus(appFeeUsd).plus(activationFeeUsd);
  const provider = getFiatValueFromUsd(providerFeeUsd, usdToFiatRate);

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
    fullRequest.accountSupports7702,
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
    messenger,
    request.targetChainId,
    request.targetTokenAddress,
  );

  const targetAmountUsd = isTargetStablecoin
    ? new BigNumber(currencyOut.amountFormatted)
    : new BigNumber(currencyOut.amountUsd);

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
    isInputBased: quote.request.tradeType === 'EXACT_INPUT',
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

  const dustRaw = BigNumber.maximum(
    new BigNumber(minimumAmount).minus(request.targetAmountMinimum),
    0,
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
 * Network fees are zeroed whenever the user does not pay origin gas, either
 * because a relayer covers it or because MetaMask sponsors it.
 *
 * @param quote - Relay quote.
 * @param messenger - Controller messenger.
 * @param request - Quote request.
 * @param transaction - Original transaction metadata.
 * @param accountSupports7702 - Whether the source account supports EIP-7702.
 * @returns Total source network cost in USD and fiat.
 */
async function calculateSourceNetworkCost(
  quote: RelayQuote,
  messenger: TransactionPayControllerMessenger,
  request: QuoteRequest,
  transaction: TransactionMeta,
  accountSupports7702: boolean | undefined,
): Promise<
  TransactionPayQuote<RelayQuote>['fees']['sourceNetwork'] & {
    gasLimits: number[];
    isGasFeeToken?: boolean;
    is7702: boolean;
  }
> {
  const { from, sourceChainId, sourceTokenAddress } = request;

  // None of these flows bill origin gas to the user: the execute flow has a
  // relayer redeem a signed delegation, a HyperLiquid withdrawal's "deposit"
  // step is an off-chain HL sendAsset signature rather than an on-chain
  // transaction, and a Polymarket deposit-wallet withdraw is submitted by the
  // Polymarket relayer.
  const isExecuteFlow = Boolean(quote.metamask?.isExecute);
  const isHyperliquidWithdrawal = Boolean(request.isHyperliquidSource);
  const isPolymarketDepositWallet = Boolean(request.isPolymarketDepositWallet);

  const gasPayment = resolveGasPayment({
    isDelegated:
      isExecuteFlow || isHyperliquidWithdrawal || isPolymarketDepositWallet,
    sourceTokenAddress,
    sponsorship: {
      accountSupports7702,
      request,
      transaction,
    },
  });

  if (gasPayment.mode === GasPaymentMode.Delegation) {
    log('Zeroing network fees as the user does not pay origin gas', {
      isExecuteFlow,
      isHyperliquidWithdrawal,
      isPolymarketDepositWallet,
    });

    return {
      estimate: ZERO_AMOUNT,
      max: ZERO_AMOUNT,
      gasLimits: [],
      is7702: false,
    };
  }

  if (gasPayment.mode === GasPaymentMode.Sponsored) {
    log('Zeroing source network fees for sponsored same-chain Relay route');

    // Gas limit is zero as sponsored transactions go through the EIP-7702
    // gas station hook and do not require user-paid gas.
    return {
      estimate: ZERO_AMOUNT,
      max: ZERO_AMOUNT,
      gasLimits: [0],
      is7702: true,
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

  // `fromOverride = Safe proxy` is only valid for deposit-style Relay routes
  // where the deposit contract reads the user's source-token balance directly.
  // Same-chain destinations route through DEX swap aggregators that frequently
  // reject contract callers (anti-MEV `msg.sender == tx.origin` checks,
  // ERC777-style callback interfaces, native wrap/unwrap requiring caller
  // native balance). Simulating those from the Safe proxy reverts and breaks
  // gas estimation. For swap-only routes, fall back to the relay params'
  // EOA `from` so simulation succeeds.
  const fromOverride = getPredictWithdrawSafeAddress(
    request,
    transaction,
    hasRelayDepositStep(quote.steps),
  );

  const { gasLimits, is7702, totalGasEstimate, totalGasLimit } =
    await estimateSourceGas({
      fromOverride,
      messenger,
      request,
      transaction,
      transactions: relayParams.map(toQuoteGasTransaction),
    });

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

  const result = { estimate, max, gasLimits, is7702 };

  // Gas-fee-token lookup must use the Safe proxy for ALL Predict withdraws,
  // not only deposit-style routes. The user's source token (pUSD) lives in
  // the Safe; the EOA is empty until the Safe.execTransaction sub-call runs
  // mid-batch. Querying the EOA for gas-fee-token availability would always
  // return nothing and force users to hold POL.
  // (`useFromOverride` only governs the gas-estimation `from` address, where
  // swap-style routes need EOA because DEX routers reject contract callers.)
  const proxyFeeTokenAccount = getPredictWithdrawFeeTokenAccount(
    request,
    transaction,
  );

  const gasStationCost = await resolveGasStationCost({
    accountSupports7702,
    feeTokenAccount: proxyFeeTokenAccount,
    firstStepData: {
      data,
      to,
      value,
    },
    messenger,
    nativeGasCostRaw: max.raw,
    request: {
      from,
      sourceChainId,
      sourceTokenAddress,
    },
    totalGasEstimate,
    totalItemCount: proxyFeeTokenAccount
      ? relayParams.length + 1
      : Math.max(relayParams.length, gasLimits.length),
  });

  if (!gasStationCost.amount) {
    return result;
  }

  log('Using gas fee token for source network', {
    gasFeeTokenCost: gasStationCost.amount,
    proxyFeeTokenAccount,
  });

  return {
    isGasFeeToken: true,
    estimate: gasStationCost.amount,
    max: gasStationCost.amount,
    gasLimits,
    is7702,
  };
}

function toQuoteGasTransaction(
  singleParams: RelayTransactionStep['items'][0]['data'],
): QuoteGasTransaction {
  return {
    chainId: toHex(singleParams.chainId),
    data: singleParams.data,
    from: singleParams.from,
    gas: singleParams.gas,
    to: singleParams.to,
    value: singleParams.value ?? '0',
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
function getSubsidizedFeeAmountUsd(
  messenger: TransactionPayControllerMessenger,
  quote: RelayQuote,
): BigNumber {
  const subsidizedFee = quote.fees?.subsidized;
  const amountUsd = new BigNumber(subsidizedFee?.amountUsd ?? '0');
  const amountFormatted = new BigNumber(subsidizedFee?.amountFormatted ?? '0');

  if (!subsidizedFee || amountUsd.isZero()) {
    return new BigNumber(0);
  }

  const isSubsidizedStablecoin = isStablecoin(
    messenger,
    toHex(subsidizedFee.currency.chainId),
    subsidizedFee.currency.address,
  );

  return isSubsidizedStablecoin ? amountFormatted : amountUsd;
}

function isStablecoin(
  messenger: TransactionPayControllerMessenger,
  chainId: string,
  tokenAddress: string,
): boolean {
  return Boolean(
    getStablecoins(messenger)[chainId as Hex]?.includes(
      tokenAddress.toLowerCase() as Hex,
    ),
  );
}
