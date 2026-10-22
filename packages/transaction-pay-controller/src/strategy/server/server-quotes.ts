import { Interface } from '@ethersproject/abi';
import { toHex } from '@metamask/controller-utils';
import type {
  AuthorizationList,
  TransactionMeta,
} from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { CHAIN_ID_HYPERCORE, TransactionPayStrategy } from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type {
  PayStrategyGetQuotesRequest,
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayFees,
  TransactionPayQuote,
} from '../../types.js';
import { getFiatValueFromUsd } from '../../utils/amounts.js';
import { getSlippage, isEIP7702Chain } from '../../utils/feature-flags.js';
import {
  GasPaymentMode,
  resolveGasPayment,
  resolveGasStationCost,
} from '../../utils/gas-payment.js';
import { calculateGasCost, getGasFee } from '../../utils/gas.js';
import {
  getPolymarketDepositWalletOverrides,
  getPredictWithdrawFeeTokenAccount,
  getPredictWithdrawSafeAddress,
} from '../../utils/polymarket/withdraw.js';
import { processPostQuotePaymentOverride } from '../../utils/post-quote-payment-override.js';
import { reservePostQuoteGas } from '../../utils/post-quote.js';
import { estimateSourceGas } from '../../utils/quote-gas.js';
import type { QuoteGasTransaction } from '../../utils/quote-gas.js';
import { resolveQuoteRecipient } from '../../utils/quote-recipient.js';
import { getTokenFiatRate } from '../../utils/token.js';
import { getQuotePricing, TradeType } from '../../utils/trade-type.js';
import { hasServerDepositStep } from './deposit-step.js';
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
const HYPERCORE_CHAIN_ID_NUMBER = Number(CHAIN_ID_HYPERCORE);
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
  try {
    const quotes = await fetchQuotes(quoteRequest, fullRequest);

    if (!quoteRequest.isPostQuote) {
      return quotes;
    }

    // Post-quote flows commit the whole source balance, so any gas paid in the
    // source token has to be reserved by re-quoting the same provider for less.
    return await Promise.all(
      quotes.map((quote) =>
        reservePostQuoteGas({
          quote,
          requote: (adjustedRequest) =>
            requoteProvider(adjustedRequest, fullRequest, quote.original),
        }),
      ),
    );
  } catch (error) {
    log('Error fetching quotes', { error });
    return [];
  }
}

async function requoteProvider(
  quoteRequest: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
  { provider }: ServerQuote,
): Promise<TransactionPayQuote<ServerQuote>> {
  const [quote] = await fetchQuotes(quoteRequest, fullRequest, provider);

  if (!quote) {
    throw new Error(`No re-quote from provider: ${provider}`);
  }

  return quote;
}

async function fetchQuotes(
  quoteRequest: QuoteRequest,
  fullRequest: PayStrategyGetQuotesRequest,
  provider?: string,
): Promise<TransactionPayQuote<ServerQuote>[]> {
  const { accountSupports7702, messenger, signal, transaction } = fullRequest;

  const body = await buildServerQuoteRequest(
    quoteRequest,
    transaction,
    messenger,
    accountSupports7702,
  );

  if (provider) {
    body.providers = [provider];
  }

  log('Request body', body);

  const response = await fetchServerQuote(messenger, body, signal);

  log('Raw quote response', response);

  const fulfilledResults = response.results.filter(
    (result): result is FulfilledServerQuoteResult =>
      isFulfilledResult(result) &&
      (!provider || result.provider === provider) &&
      isUsableDepositAddressQuote(body, result),
  );

  const normalized = await Promise.all(
    fulfilledResults.map((result) =>
      normalizeQuote(
        result,
        { ...quoteRequest, recipient: body.recipient },
        messenger,
        body,
        transaction,
        accountSupports7702,
        isSecondLegRequired(body, quoteRequest, transaction, result.quote),
      ),
    ),
  );

  log('Normalized quotes', normalized);

  return normalized;
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
    isPolymarketDepositWallet,
    isPostQuote,
    refundTo,
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
    !isHypercore &&
    atomic !== false &&
    !isPostQuote &&
    !isPolymarketDepositWallet &&
    !normalizedRequest.skipProcessTransactions &&
    Boolean(singleData?.startsWith(TOKEN_TRANSFER_FOUR_BYTE));

  // `from` is the payer, which differs from the account the transaction's calls
  // run from when an account override (e.g. Money Account) is active.
  const executionAccount = transaction.txParams.from as Hex;

  const tokenTransferRecipient =
    isTokenTransfer && singleData
      ? decodeTransferRecipient(singleData)
      : undefined;

  const override = await processPostQuotePaymentOverride({
    messenger,
    request: normalizedRequest,
    transaction,
  });
  const recipient = await resolveQuoteRecipient({
    messenger,
    request: {
      ...normalizedRequest,
      recipient: override?.recipient ?? tokenTransferRecipient,
    },
    transaction,
  });

  const isHypercoreSource = sourceChainId === CHAIN_ID_HYPERCORE;

  // Deposit wallet withdraws are broadcast by the Polymarket relayer rather
  // than as a gasless EIP-7702 batch, so the provider must not quote gasless.
  const supportsGasless =
    !isHypercoreSource &&
    !isPolymarketDepositWallet &&
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

  if (isPolymarketDepositWallet) {
    await applyDepositWalletOverrides(body, from, messenger);
  }

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
    (isMaxAmount ?? false) ||
    // The deposit wallet funds the quote with a plain token transfer, so there
    // are no calls to embed.
    (isPolymarketDepositWallet ?? false);

  if (override) {
    body.amount = override.amount;
    body.calls = override.calls;

    if (override.authorizationList?.length) {
      body.authorizationList = normalizeAuthorizationList(
        override.authorizationList,
      );
    }
  } else if (!skipDelegation) {
    const delegation = await messenger.call(
      'TransactionPayController:getDelegationTransaction',
      { transaction },
    );

    body.calls = [
      {
        data: buildTransferData(executionAccount, targetAmountMinimum),
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
    // still quote for the funds. The response determines whether execution is
    // deferred. Post-quote flows submit their own calls and must not opt in.
    if (
      canDeferCalls({
        accountSupports7702,
        messenger,
        targetChainId,
        transaction,
      })
    ) {
      body.supportsDeferredCalls = true;
    }

    if (delegation.authorizationList?.length) {
      body.authorizationList = normalizeAuthorizationList(
        delegation.authorizationList,
      );
    }
  } else if (isPostQuote || atomic === false) {
    // Honour the caller's refund address so a failed quote refunds the account
    // the funds came from, such as the Predict Safe, rather than the payer. A
    // deposit wallet refund address is kept, as the sweep reads refunds there.
    body.refundTo ??= refundTo;
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

/**
 * Whether we can run the calls ourselves after the quote settles without
 * involving the user, so a funds-only quote is acceptable.
 *
 * The second leg is an internal, sponsored EIP-7702 batch on the target chain,
 * so the account must be able to sign EIP-7702 authorizations, the target chain
 * must support EIP-7702, and MetaMask must sponsor gas for the transaction on
 * that chain. Otherwise the user would need native gas on the target chain.
 *
 * Temporarily, only nested transactions are supported as second-leg calls, as
 * they are what the second leg re-encodes for the settled amount. Calls that
 * exist only on the top-level transaction are not deferred, so a provider that
 * cannot execute them declines rather than returning a funds-only quote.
 *
 * @param options - Check options.
 * @param options.accountSupports7702 - Whether the account can sign EIP-7702
 * authorizations.
 * @param options.messenger - Controller messenger.
 * @param options.targetChainId - Chain the second leg would run on.
 * @param options.transaction - Transaction being paid for.
 * @returns Whether the calls can be deferred to a second leg.
 */
function canDeferCalls({
  accountSupports7702,
  messenger,
  targetChainId,
  transaction,
}: {
  accountSupports7702: boolean;
  messenger: TransactionPayControllerMessenger;
  targetChainId: Hex;
  transaction: TransactionMeta;
}): boolean {
  return (
    Boolean(transaction.nestedTransactions?.length) &&
    accountSupports7702 &&
    transaction.isGasFeeSponsored === true &&
    transaction.chainId === targetChainId &&
    isEIP7702Chain(messenger, targetChainId)
  );
}

/**
 * Quote a deposit wallet Predict withdraw from the deposit wallet itself.
 *
 * The deposit wallet funds the provider's deposit address with the USDC.e
 * unwrapped from its pUSD, and is also the refund address so the sweep can wrap
 * any refund back into pUSD.
 *
 * @param body - Quote request body to update.
 * @param from - The user EOA that owns the deposit wallet.
 * @param messenger - Controller messenger.
 */
async function applyDepositWalletOverrides(
  body: ServerQuoteRequestDraft,
  from: Hex,
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const { depositWallet, sourceTokenAddress } =
    await getPolymarketDepositWalletOverrides(from, messenger);

  body.source = { ...body.source, token: sourceTokenAddress };
  body.sender = depositWallet;
  body.refundTo = depositWallet;
  body.useDepositAddress = true;
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
 * Non-atomic post-quote flows always need one: their calls come from the
 * payment override rather than the transaction, and run once funds settle.
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
  if (body.calls?.length && !quote.callsDeferred) {
    return false;
  }

  // HyperCore settles off-chain, so there is no target-chain transfer to read
  // a settled amount from. Checks the built body rather than the original
  // request, since perps deposits are only rewritten to HyperCore there.
  if (body.target.chainId === HYPERCORE_CHAIN_ID_NUMBER) {
    return false;
  }

  // Post-quote flows submit the original transaction alongside the quote, so
  // the second leg never re-runs it. Only non-atomic flows have override calls
  // left to run once the funds settle.
  if (quoteRequest.isPostQuote) {
    return quoteRequest.atomic === false;
  }

  if (body.source.chainId === HYPERCORE_CHAIN_ID_NUMBER) {
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

  return true;
}

async function normalizeQuote(
  result: FulfilledServerQuoteResult,
  quoteRequest: QuoteRequest,
  messenger: TransactionPayControllerMessenger,
  body: ServerQuoteRequest,
  transaction: TransactionMeta,
  accountSupports7702: boolean,
  requiresSecondLeg: boolean,
): Promise<TransactionPayQuote<ServerQuote>> {
  const { quote } = result;
  const { gasless } = quote;
  const isInputBased = body.tradeType === TradeType.ExactInput;
  const transactionSteps = quote.steps.filter(isTransactionStep);
  const isSignatureOnly = transactionSteps.length === 0;
  const sourceNetwork = await calculateSourceNetworkCost({
    accountSupports7702,
    gasless: gasless || isSignatureOnly,
    messenger,
    quoteRequest,
    sender: body.sender,
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
  sender,
  steps,
  transaction,
}: {
  accountSupports7702: boolean | undefined;
  gasless: boolean;
  messenger: TransactionPayControllerMessenger;
  quoteRequest: QuoteRequest;
  sender: Hex;
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

  const { from, isPolymarketDepositWallet, sourceChainId, sourceTokenAddress } =
    quoteRequest;

  // A deposit wallet withdraw is broadcast by the Polymarket relayer, which
  // pays the gas, so the user only signs.
  const gasPayment = resolveGasPayment({
    isDelegated: gasless || Boolean(isPolymarketDepositWallet),
    sourceTokenAddress,
    sponsorship: {
      accountSupports7702,
      request: quoteRequest,
      transaction,
    },
  });

  if (gasPayment.mode === GasPaymentMode.Delegation) {
    log('Zeroing source network fees as the user does not pay origin gas', {
      gasless,
      isPolymarketDepositWallet,
    });
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

  // Legacy Safe Predict withdraws hold the source token in the Safe, so deposit
  // routes are estimated from the Safe. Swap routes keep the sender, as DEX
  // aggregators reject contract callers.
  const fromOverride = getPredictWithdrawSafeAddress(
    quoteRequest,
    transaction,
    hasServerDepositStep(steps),
  );

  const { gasLimits, is7702, totalGasEstimate, totalGasLimit } =
    await estimateSourceGas({
      fromOverride,
      messenger,
      request: quoteRequest,
      transaction,
      transactions: steps.map((step) => stepToGasTransaction(step, sender)),
    });

  const estimate = calculateGasCost({
    chainId: chainIdHex,
    gas: totalGasEstimate,
    maxFeePerGas: maxFeePerGas ?? '0',
    maxPriorityFeePerGas: maxPriorityFeePerGas ?? '0',
    messenger,
  });

  const max = calculateGasCost({
    chainId: chainIdHex,
    gas: totalGasLimit,
    isMax: true,
    maxFeePerGas: maxFeePerGas ?? '0',
    maxPriorityFeePerGas: maxPriorityFeePerGas ?? '0',
    messenger,
  });

  const fees = { maxFeePerGas, maxPriorityFeePerGas };

  // Every Predict withdraw holds the source token in the Safe, so the fee token
  // lookup must use it even on swap routes.
  const feeTokenAccount = getPredictWithdrawFeeTokenAccount(
    quoteRequest,
    transaction,
  );

  const gasStationCost = await resolveGasStationCost({
    feeTokenAccount,
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
    totalGasEstimate,
    totalItemCount: feeTokenAccount
      ? steps.length + 1
      : Math.max(steps.length, gasLimits.length),
  });

  if (!gasStationCost.amount) {
    return { estimate, gasLimits, is7702, max, ...fees };
  }

  log('Using gas fee token for source network', {
    feeTokenAccount,
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

/**
 * Whether a quote can be funded as requested. A deposit-address request is only
 * usable when the quote funds the provider with a plain token transfer, since
 * that transfer is what gets replaced by an unwrap straight to the deposit
 * address.
 *
 * @param body - The built server quote request.
 * @param result - Fulfilled provider result.
 * @returns True when the quote is usable.
 */
function isUsableDepositAddressQuote(
  body: ServerQuoteRequest,
  result: FulfilledServerQuoteResult,
): boolean {
  if (!body.useDepositAddress || hasServerDepositStep(result.quote.steps)) {
    return true;
  }

  log('Ignoring deposit address quote without a plain token transfer', {
    provider: result.provider,
  });

  return false;
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
