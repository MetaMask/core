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
  CHAIN_ID_HYPERCORE,
  PaymentOverride,
  TransactionPayStrategy,
} from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayFees,
  TransactionPayQuote,
} from '../../types.js';
import { getFiatValueFromUsd } from '../../utils/amounts.js';
import {
  getFeatureFlags,
  getSlippage,
  isEIP7702Chain,
} from '../../utils/feature-flags.js';
import {
  GasPaymentMode,
  resolveGasPayment,
  resolveGasStationCost,
} from '../../utils/gas-payment.js';
import { calculateGasCost, getGasFee } from '../../utils/gas.js';
import { estimateQuoteGasLimits } from '../../utils/quote-gas.js';
import type { QuoteGasTransaction } from '../../utils/quote-gas.js';
import { resolveExecutionAccount } from '../../utils/second-leg.js';
import { getTokenFiatRate } from '../../utils/token.js';
import { getQuotePricing, TradeType } from '../../utils/trade-type.js';
import { normalizeServerPerpsRequest } from './perps.js';
import { fetchServerQuote } from './server-api.js';
import type {
  ServerQuote,
  ServerQuotePayload,
  ServerQuoteRequest,
  ServerQuoteResult,
  ServerTransactionStep,
} from './types.js';

const log = createModuleLogger(projectLogger, 'server-quotes');
const TOKEN_TRANSFER_FOUR_BYTE = '0xa9059cbb';
const TRANSFER_INTERFACE = new Interface([
  'function transfer(address to, uint256 amount)',
]);
const ZERO_AMOUNT = { fiat: '0', human: '0', raw: '0', usd: '0' };
const ZERO_FIAT_VALUE = { fiat: '0', usd: '0' };

type FulfilledServerQuoteResult = ServerQuoteResult & {
  quote: NonNullable<ServerQuoteResult['quote']>;
};

/**
 * A quote request whose pricing is not yet decided.
 *
 * The pricing basis depends on whether calls end up bundled into the request,
 * so it is derived once the calls are known. A step that bundles calls may pin
 * `amount` itself, in which case that amount wins.
 */
type ServerQuoteRequestDraft = Omit<
  ServerQuoteRequest,
  'amount' | 'tradeType'
> &
  Partial<Pick<ServerQuoteRequest, 'amount'>>;

type SourceNetworkCost = Pick<
  TransactionPayFees['sourceNetwork'],
  'estimate' | 'max'
> & {
  gasLimits: number[];
  is7702: boolean;
  isSourceGasFeeToken?: boolean;
  maxFeePerGas: string | undefined;
  maxPriorityFeePerGas: string | undefined;
};

function isTransactionStep(
  step: ServerQuote['steps'][number],
): step is ServerTransactionStep {
  return step.type === 'transaction';
}

/**
 * Fetch server intents-api quotes and normalize them into Transaction Pay quotes.
 *
 * @param request - Quote request context.
 * @returns Normalized server strategy quotes.
 */
export async function getServerQuotes(
  request: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<ServerQuote>[]> {
  const quoteRequests = request.requests.filter(shouldRequestQuote);

  log('Fetching quotes', { quoteRequests });

  const quotes = await Promise.all(
    quoteRequests.map((quoteRequest) =>
      getQuotesForRequest(quoteRequest, request),
    ),
  );

  return quotes.flat();
}

async function getQuotesForRequest(
  quoteRequest: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
): Promise<TransactionPayQuote<ServerQuote>[]> {
  const { accountSupports7702, messenger, signal, transaction } = fullRequest;

  try {
    const body = await buildServerQuoteRequest(
      quoteRequest,
      transaction,
      messenger,
      accountSupports7702,
    );

    log('Request body', body);

    const response = await fetchServerQuote(messenger, body, signal);

    log('Raw quote response', response);

    const fulfilledResults = response.results.filter(isFulfilledResult);

    // The quote settles the funding token on the executing account rather than
    // the payer, so carry it on the request. The second leg runs from
    // `request.recipient`, which has to match where the funds actually landed.
    const executionAccount = resolveExecutionAccount(
      transaction,
      quoteRequest.from,
    );

    const settledRequest = executionAccount
      ? { ...quoteRequest, recipient: executionAccount }
      : quoteRequest;

    const normalized = await Promise.all(
      fulfilledResults.map((result) =>
        normalizeQuote(
          result,
          settledRequest,
          messenger,
          body.tradeType === TradeType.ExactInput,
          transaction,
          accountSupports7702,
          isSecondLegRequired(body, quoteRequest, transaction, result.quote),
        ),
      ),
    );

    log('Normalized quotes', normalized);

    return normalized;
  } catch (error) {
    log('Error fetching quotes', { error });
    return [];
  }
}

async function buildServerQuoteRequest(
  quoteRequest: QuoteRequest,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  accountSupports7702: boolean,
): Promise<ServerQuoteRequest> {
  const normalizedRequest = normalizeServerPerpsRequest(
    quoteRequest,
    transaction,
  );
  const {
    atomic,
    from,
    isMaxAmount,
    isPostQuote,
    paymentOverride,
    sourceChainId,
    sourceTokenAddress,
    sourceTokenAmount,
    targetAmountMinimum,
    targetChainId,
    targetTokenAddress,
  } = normalizedRequest;

  const singleData = getSingleTransactionData(transaction);
  const isHypercore = targetChainId === CHAIN_ID_HYPERCORE;
  const isTokenTransfer =
    !isHypercore && Boolean(singleData?.startsWith(TOKEN_TRANSFER_FOUR_BYTE));

  const executionAccount = resolveExecutionAccount(transaction, from);

  let recipient = executionAccount ?? from;

  if (isTokenTransfer && singleData) {
    recipient = decodeTransferRecipient(singleData);
  }

  const isHypercoreSource = sourceChainId === CHAIN_ID_HYPERCORE;
  const supportsGasless =
    !isHypercoreSource &&
    accountSupports7702 &&
    isEIP7702Chain(messenger, sourceChainId);

  const body: ServerQuoteRequestDraft = {
    source: { chainId: Number(sourceChainId), token: sourceTokenAddress },
    target: { chainId: Number(targetChainId), token: targetTokenAddress },
    sender: from,
    recipient,
    slippage: Math.round(
      getSlippage(messenger, sourceChainId, sourceTokenAddress) * 10000,
    ),
    supportsGasless,
  };

  const hasNoData = singleData === undefined || singleData === '0x';
  const skipDelegation =
    hasNoData ||
    isTokenTransfer ||
    isHypercore ||
    isHypercoreSource ||
    // Explicitly non-atomic requests want the calls run after settlement, so
    // they must not be embedded in the quote.
    atomic === false ||
    (isPostQuote ?? false) ||
    (isMaxAmount ?? false);

  if (isPostQuote && paymentOverride === PaymentOverride.MoneyAccount) {
    await processMoneyAccountPostQuote(
      transaction,
      normalizedRequest,
      body,
      messenger,
    );
  } else if (!skipDelegation) {
    const delegation = await messenger.call(
      'TransactionPayController:getDelegationTransaction',
      { transaction },
    );

    body.calls = [
      {
        data: buildTransferData(from, targetAmountMinimum),
        to: targetTokenAddress,
        value: '0x0',
      },
      {
        data: delegation.data,
        to: delegation.to,
        value: delegation.value,
      },
    ];

    // Prefer atomic execution, but let providers that cannot run the calls
    // still quote for the funds. Only this path can fall back to a second leg:
    // the calls run as `from`, which is also the recipient, so we can submit
    // them ourselves once the funds land. Post-quote flows submit their own
    // calls and must not opt in.
    body.isCallsOptional = true;

    if (delegation.authorizationList?.length) {
      body.authorizationList = normalizeAuthorizationList(
        delegation.authorizationList,
      );
    }
  }

  const pricing = getQuotePricing({
    hasCalls: Boolean(body.calls?.length),
    sourceTokenAmount,
    targetAmountMinimum,
    transaction,
  });

  return {
    ...body,
    // A step that bundled its own calls has already pinned the amount those
    // calls consume, so it wins over the derived amount.
    amount: body.amount ?? pricing.amount,
    tradeType: pricing.tradeType,
  };
}

function normalizeAuthorizationList(
  authorizationList: AuthorizationList,
): NonNullable<ServerQuoteRequest['authorizationList']> {
  return authorizationList.map((entry) => ({
    address: entry.address,
    chainId: Number(entry.chainId),
    nonce: Number(entry.nonce),
    r: entry.r as Hex,
    s: entry.s as Hex,
    yParity: Number(entry.yParity),
  }));
}

async function processMoneyAccountPostQuote(
  transaction: TransactionMeta,
  request: QuoteRequest,
  body: ServerQuoteRequestDraft,
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

  // The bundled calls transfer exactly this amount, so pin it rather than
  // letting the amount be derived from the request.
  body.amount = rawAmount;

  // Settle directly on the Money Account. The deposit calls are delegated from
  // the Money Account, so the funds have to be there before they run.
  body.recipient = fundingRecipient;

  body.calls = overrideCalls.map((call) => ({
    data: call.data as Hex,
    to: call.to as Hex,
    value: call.value ?? '0x0',
  }));

  if (authorizationList?.length) {
    body.authorizationList = normalizeAuthorizationList(authorizationList);
  }

  log('Added money account post-quote calls to server quote body', {
    callCount: overrideCalls.length,
  });
}

function shouldRequestQuote(quoteRequest: QuoteRequest): boolean {
  return (
    quoteRequest.targetAmountMinimum !== '0' ||
    Boolean(quoteRequest.isPostQuote) ||
    Boolean(quoteRequest.isMaxAmount) ||
    Boolean(quoteRequest.isHyperliquidSource)
  );
}

/**
 * Determines whether the transaction's calls must be submitted as a separate
 * second leg on the target chain after the quote settles.
 *
 * `atomic` is only a hint: whether the calls can be executed by the provider
 * depends on the flow, so this checks what the built request actually carries
 * rather than what the caller asked for. Flows with nothing to run, or that
 * submit their own calls, are excluded.
 *
 * A second leg is needed either because we declined to embed the calls, or
 * because the provider that won the quote told us it will not execute them.
 *
 * @param body - The built server quote request.
 * @param quoteRequest - The originating quote request.
 * @param transaction - Original transaction meta.
 * @param quote - The provider's quote payload.
 * @returns `true` when a second leg is required.
 */
function isSecondLegRequired(
  body: ServerQuoteRequest,
  quoteRequest: QuoteRequest,
  transaction: TransactionMeta,
  quote: ServerQuotePayload,
): boolean {
  // Embedded calls are executed by the provider as part of the quote, unless
  // it quoted for the funds alone and told us to run the calls ourselves.
  if (body.calls?.length && quote.callsSupported !== false) {
    return false;
  }

  // No calls to run. Plain funding transfers and empty calldata are already
  // satisfied by the quote delivering the target token to the recipient.
  if (!transaction.nestedTransactions?.length) {
    return false;
  }

  const singleData = getSingleTransactionData(transaction);

  if (singleData === undefined || singleData === '0x') {
    return false;
  }

  if (singleData.startsWith(TOKEN_TRANSFER_FOUR_BYTE)) {
    return false;
  }

  // HyperCore settles off-chain, so there is no target-chain transfer to read
  // a settled amount from.
  if (
    quoteRequest.targetChainId === CHAIN_ID_HYPERCORE ||
    quoteRequest.sourceChainId === CHAIN_ID_HYPERCORE
  ) {
    return false;
  }

  // Post-quote flows submit the original transaction separately, so running it
  // again as a second leg would double-execute it.
  if (quoteRequest.isPostQuote) {
    return false;
  }

  return true;
}

async function normalizeQuote(
  result: FulfilledServerQuoteResult,
  quoteRequest: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
  isInputBased: boolean,
  transaction: TransactionMeta,
  accountSupports7702: boolean,
  requiresSecondLeg: boolean,
): Promise<TransactionPayQuote<ServerQuote>> {
  const { quote } = result;
  const { gasless } = quote;
  const transactionSteps = quote.steps.filter(isTransactionStep);
  const isSignatureOnly = transactionSteps.length === 0;
  const sourceNetwork = await calculateSourceNetworkCost({
    accountSupports7702,
    gasless: gasless || isSignatureOnly,
    messenger,
    quoteRequest,
    steps: transactionSteps,
    transaction,
  });

  const sourceFiatRate = getTokenFiatRate(
    messenger,
    quoteRequest.sourceTokenAddress,
    quoteRequest.sourceChainId,
  );

  const usdToFiatRate = sourceFiatRate
    ? new BigNumber(sourceFiatRate.fiatRate).dividedBy(sourceFiatRate.usdRate)
    : new BigNumber(1);

  const targetFiatRate = getTokenFiatRate(
    messenger,
    quoteRequest.targetTokenAddress,
    quoteRequest.targetChainId,
  );

  const metaMask = getFiatValueFromUsd(
    new BigNumber(quote.fees.metamask),
    usdToFiatRate,
  );

  const provider = getFiatValueFromUsd(
    new BigNumber(quote.fees.provider),
    usdToFiatRate,
  );

  return {
    dust: ZERO_FIAT_VALUE,
    estimatedDuration: quote.duration,
    fees: {
      ...(sourceNetwork.isSourceGasFeeToken
        ? { isSourceGasFeeToken: true }
        : {}),
      metaMask,
      provider,
      sourceNetwork: {
        estimate: sourceNetwork.estimate,
        max: sourceNetwork.max,
      },
      targetNetwork: ZERO_FIAT_VALUE,
    },
    isInputBased,
    original: {
      client: {
        gasLimits: sourceNetwork.gasLimits,
        is7702: sourceNetwork.is7702,
        maxFeePerGas: sourceNetwork.maxFeePerGas,
        maxPriorityFeePerGas: sourceNetwork.maxPriorityFeePerGas,
      },
      duration: quote.duration,
      fees: quote.fees,
      gasless,
      id: quote.id,
      input: quote.input,
      output: quote.output,
      provider: result.provider,
      steps: quote.steps,
    },
    request: quoteRequest,
    requiresSecondLeg,
    sourceAmount: {
      fiat: sourceFiatRate
        ? new BigNumber(quote.input.formatted)
            .multipliedBy(sourceFiatRate.fiatRate)
            .toString(10)
        : '0',
      human: quote.input.formatted,
      raw: quote.input.raw,
      usd: sourceFiatRate
        ? new BigNumber(quote.input.formatted)
            .multipliedBy(sourceFiatRate.usdRate)
            .toString(10)
        : '0',
    },
    strategy: TransactionPayStrategy.Server,
    targetAmount: {
      fiat: targetFiatRate
        ? new BigNumber(quote.output.formatted)
            .multipliedBy(targetFiatRate.fiatRate)
            .toString(10)
        : '0',
      usd: targetFiatRate
        ? new BigNumber(quote.output.formatted)
            .multipliedBy(targetFiatRate.usdRate)
            .toString(10)
        : '0',
    },
  };
}

async function calculateSourceNetworkCost({
  accountSupports7702,
  gasless,
  messenger,
  quoteRequest,
  steps,
  transaction,
}: {
  accountSupports7702: boolean | undefined;
  gasless: boolean;
  messenger: TransactionPayControllerMessenger;
  quoteRequest: QuoteRequest;
  steps: ServerTransactionStep[];
  transaction: TransactionMeta;
}): Promise<SourceNetworkCost> {
  const noFees = {
    estimate: ZERO_AMOUNT,
    gasLimits: [],
    is7702: false,
    max: ZERO_AMOUNT,
    maxFeePerGas: undefined,
    maxPriorityFeePerGas: undefined,
  };

  const { from, sourceChainId, sourceTokenAddress } = quoteRequest;

  const gasPayment = resolveGasPayment({
    isDelegated: gasless,
    sourceTokenAddress,
    sponsorship: {
      accountSupports7702,
      request: quoteRequest,
      transaction,
    },
  });

  if (gasPayment.mode === GasPaymentMode.Delegation) {
    log('Zeroing source network fees for gasless quote');
    return noFees;
  }

  if (gasPayment.mode === GasPaymentMode.Sponsored) {
    log('Zeroing source network fees for sponsored same-chain server route');

    // Gas limit is zero as sponsored transactions go through the EIP-7702
    // gas station hook and do not require user-paid gas.
    return { ...noFees, gasLimits: [0], is7702: true };
  }

  const firstStep = steps[0];
  const chainIdHex = toHex(firstStep.chainId);

  const needsGasFeeEstimate =
    !firstStep.maxFeePerGas && !firstStep.maxPriorityFeePerGas;

  const gasFeeEstimate = needsGasFeeEstimate
    ? getGasFee(chainIdHex, messenger)
    : { maxFeePerGas: undefined, maxPriorityFeePerGas: undefined };

  const maxFeePerGas = firstStep.maxFeePerGas ?? gasFeeEstimate.maxFeePerGas;
  const maxPriorityFeePerGas =
    firstStep.maxPriorityFeePerGas ?? gasFeeEstimate.maxPriorityFeePerGas;

  const gasTransactions = steps.map((step) => stepToGasTransaction(step, from));

  const gasResult = await estimateQuoteGasLimits({
    fallbackGas: getFeatureFlags(messenger).relayFallbackGas,
    fallbackOnSimulationFailure: true,
    messenger,
    transactions: gasTransactions,
  });

  const { is7702 } = gasResult;
  const gasLimits = is7702
    ? [gasResult.gasLimits[0].max]
    : gasResult.gasLimits.map((gasLimit) => gasLimit.max);

  const estimate = calculateGasCost({
    chainId: chainIdHex,
    gas: gasResult.totalGasEstimate,
    maxFeePerGas: maxFeePerGas ?? '0',
    maxPriorityFeePerGas: maxPriorityFeePerGas ?? '0',
    messenger,
  });

  const max = calculateGasCost({
    chainId: chainIdHex,
    gas: gasResult.totalGasLimit,
    isMax: true,
    maxFeePerGas: maxFeePerGas ?? '0',
    maxPriorityFeePerGas: maxPriorityFeePerGas ?? '0',
    messenger,
  });

  const fees = { maxFeePerGas, maxPriorityFeePerGas };

  const gasStationCost = await resolveGasStationCost({
    firstStepData: {
      data: firstStep.data,
      to: firstStep.to,
      value: firstStep.value,
    },
    messenger,
    nativeGasCostRaw: max.raw,
    request: {
      from,
      sourceChainId,
      sourceTokenAddress,
    },
    totalGasEstimate: gasResult.totalGasEstimate,
    totalItemCount: steps.length,
  });

  if (!gasStationCost.amount) {
    return { estimate, gasLimits, is7702, max, ...fees };
  }

  log('Using gas fee token for source network', {
    gasFeeTokenCost: gasStationCost.amount,
  });

  return {
    estimate: gasStationCost.amount,
    gasLimits,
    is7702,
    isSourceGasFeeToken: true,
    max: gasStationCost.amount,
    ...fees,
  };
}

function stepToGasTransaction(
  step: ServerTransactionStep,
  from: Hex,
): QuoteGasTransaction {
  return {
    chainId: toHex(step.chainId),
    data: step.data,
    from,
    to: step.to,
    value: step.value,
  };
}

function getSingleTransactionData(
  transaction: TransactionMeta,
): Hex | undefined {
  for (const nested of transaction.nestedTransactions ?? []) {
    if (nested.data && nested.data !== '0x') {
      return nested.data;
    }
  }

  return transaction.txParams?.data as Hex | undefined;
}

function isFulfilledResult(
  result: ServerQuoteResult,
): result is FulfilledServerQuoteResult {
  return (
    result.quote?.id !== undefined &&
    result.quote.input !== undefined &&
    result.quote.output !== undefined
  );
}

function decodeTransferRecipient(data: Hex): Hex {
  return TRANSFER_INTERFACE.decodeFunctionData(
    'transfer',
    data,
  ).to.toLowerCase() as Hex;
}

function buildTransferData(recipient: Hex, amountRaw: string): Hex {
  return TRANSFER_INTERFACE.encodeFunctionData('transfer', [
    recipient,
    amountRaw,
  ]) as Hex;
}
