import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { NATIVE_TOKEN_ADDRESS } from '../constants.js';
import { projectLogger } from '../logger.js';
import type {
  QuoteRequest,
  TransactionPayControllerMessenger,
  TransactionPayQuote,
} from '../types.js';
import { getFeatureFlags } from './feature-flags.js';
import { estimateQuoteGasLimits } from './quote-gas.js';
import type { QuoteGasTransaction } from './quote-gas.js';
import { getNativeToken } from './token.js';

const log = createModuleLogger(projectLogger, 'post-quote');

// Buffer applied to the gas cost when reserving native tokens for gas in
// post-quote flows, accounting for gas limit re-estimation variance.
const POST_QUOTE_GAS_BUFFER = 1.1;

// Hardcoded gas allowance for the prepended payment override transaction(s).
const PAYMENT_OVERRIDE_GAS = 75_000;

/** Gas required on the source chain, including any prepended transactions. */
export type SourceGas = {
  gasLimits: number[];
  is7702: boolean;
  totalGasEstimate: number;
  totalGasLimit: number;
};

/**
 * Estimate the source-chain gas for a quote's transactions, including the
 * transactions prepended at submit time.
 *
 * Post-quote flows prepend the original transaction, so it is estimated with
 * the quote transactions to let batch estimation detect EIP-7702 support.
 * Without it a single quote step is estimated alone, gets `is7702: false`, and
 * the batch falls back to separate transactions that each need native gas.
 * When the original transaction cannot be estimated, fixed allowances for the
 * prepended transactions are added instead.
 *
 * @param options - Options bag.
 * @param options.fromOverride - Address to estimate from instead of each
 * transaction's own `from`, such as the Predict Safe holding the source token.
 * @param options.messenger - Controller messenger.
 * @param options.request - Quote request.
 * @param options.transaction - Original transaction metadata.
 * @param options.transactions - Quote transactions to estimate.
 * @returns Source gas, with per-transaction limits in submission order.
 */
export async function estimateSourceGas({
  fromOverride,
  messenger,
  request,
  transaction,
  transactions,
}: {
  fromOverride?: Hex;
  messenger: TransactionPayControllerMessenger;
  request: QuoteRequest;
  transaction: TransactionMeta;
  transactions: QuoteGasTransaction[];
}): Promise<SourceGas> {
  const originalTransaction = getOriginalTransactionGas(request, transaction);

  const allTransactions = (
    originalTransaction ? [originalTransaction, ...transactions] : transactions
  ).map((singleTransaction) =>
    fromOverride
      ? { ...singleTransaction, from: fromOverride, gas: undefined }
      : singleTransaction,
  );

  const result = await estimateQuoteGasLimits({
    fallbackGas: getFeatureFlags(messenger).relayFallbackGas,
    fallbackOnSimulationFailure: true,
    messenger,
    transactions: allTransactions,
  });

  const gas = {
    gasLimits: result.gasLimits.map((gasLimit) => gasLimit.max),
    is7702: result.is7702,
    totalGasEstimate: result.totalGasEstimate,
    totalGasLimit: result.totalGasLimit,
  };

  return originalTransaction ? gas : addPrependedGas(gas, request, transaction);
}

/**
 * Re-quote a post-quote flow with the gas cost reserved from the source amount.
 *
 * Gas must come out of the source amount when the balance is fully committed
 * to the quote, either because gas is paid with the source token as a gas fee
 * token or because the source token is itself the native gas token.
 *
 * @param options - Options bag.
 * @param options.quote - Quote for the full source amount.
 * @param options.requote - Fetch a quote for an adjusted request.
 * @returns The re-quoted quote, or the original quote when no reservation is
 * needed or the re-quote is unusable.
 */
export async function reservePostQuoteGas<Original>({
  quote,
  requote,
}: {
  quote: TransactionPayQuote<Original>;
  requote: (request: QuoteRequest) => Promise<TransactionPayQuote<Original>>;
}): Promise<TransactionPayQuote<Original>> {
  const { request } = quote;

  if (!request.isPostQuote) {
    return quote;
  }

  if (!quote.fees.isSourceGasFeeToken && !isNativeSource(request)) {
    return quote;
  }

  const gasCostRaw = new BigNumber(quote.fees.sourceNetwork.max.raw)
    .multipliedBy(POST_QUOTE_GAS_BUFFER)
    .integerValue(BigNumber.ROUND_UP);

  const existingHeadroom = new BigNumber(request.sourceBalanceRaw).minus(
    request.sourceTokenAmount,
  );

  if (existingHeadroom.isGreaterThanOrEqualTo(gasCostRaw)) {
    log('Sufficient existing balance for gas, skipping subtraction', {
      existingHeadroom: existingHeadroom.toString(10),
      gasCostRaw: gasCostRaw.toString(10),
    });
    return quote;
  }

  const adjustedSourceAmount = new BigNumber(request.sourceTokenAmount)
    .minus(gasCostRaw)
    .integerValue(BigNumber.ROUND_DOWN);

  log('Subtracting gas from source for post-quote', {
    adjustedSourceAmount: adjustedSourceAmount.toString(10),
    gasCostRaw,
    originalSourceAmount: request.sourceTokenAmount,
  });

  if (!adjustedSourceAmount.isGreaterThan(0)) {
    log('Insufficient balance after gas subtraction, using original quote');
    return quote;
  }

  try {
    const adjustedQuote = await requote({
      ...request,
      sourceTokenAmount: adjustedSourceAmount.toFixed(0, BigNumber.ROUND_DOWN),
    });

    if (
      quote.fees.isSourceGasFeeToken &&
      !adjustedQuote.fees.isSourceGasFeeToken
    ) {
      log('Re-quote lost gas fee token eligibility, using original quote');
      return quote;
    }

    return adjustedQuote;
  } catch (error) {
    log('Re-quote failed, using original quote', { error });
    return quote;
  }
}

function getOriginalTransactionGas(
  request: QuoteRequest,
  transaction: TransactionMeta,
): QuoteGasTransaction | undefined {
  const { txParams } = transaction;
  const to = txParams.to as Hex | undefined;

  if (!request.isPostQuote || !to || hasAccountOverride(request, transaction)) {
    return undefined;
  }

  const gas = getOriginalGas(transaction);

  return {
    chainId: transaction.chainId,
    data: (txParams.data as Hex) ?? '0x',
    from: txParams.from as Hex,
    gas: gas ? String(gas) : undefined,
    to,
    value: txParams.value ?? '0',
  };
}

function addPrependedGas(
  gas: SourceGas,
  request: QuoteRequest,
  transaction: TransactionMeta,
): SourceGas {
  const originalGas = request.isPostQuote
    ? getOriginalGas(transaction)
    : undefined;

  const withOriginal = originalGas
    ? prependGas(gas, new BigNumber(originalGas).toNumber())
    : gas;

  return request.paymentOverride
    ? prependGas(withOriginal, PAYMENT_OVERRIDE_GAS)
    : withOriginal;
}

function prependGas(gas: SourceGas, prependedGas: number): SourceGas {
  // A combined 7702 limit stays a single limit, otherwise the prepended
  // transaction gets its own limit ahead of the quote transactions.
  const gasLimits = gas.is7702
    ? [gas.gasLimits[0] + prependedGas]
    : [prependedGas, ...gas.gasLimits];

  log('Added prepended transaction gas', { gasLimits, prependedGas });

  return {
    gasLimits,
    is7702: gas.is7702,
    totalGasEstimate: gas.totalGasEstimate + prependedGas,
    totalGasLimit: gas.totalGasLimit + prependedGas,
  };
}

// Prefer the caller-provided nested gas, since the transaction controller may
// re-estimate `txParams.gas` during batch creation.
function getOriginalGas(transaction: TransactionMeta): string | undefined {
  return (
    transaction.nestedTransactions?.find((nested) => nested.gas)?.gas ??
    transaction.txParams.gas
  );
}

function hasAccountOverride(
  request: QuoteRequest,
  transaction: TransactionMeta,
): boolean {
  return (
    request.from.toLowerCase() !==
    (transaction.txParams.from as Hex).toLowerCase()
  );
}

function isNativeSource(request: QuoteRequest): boolean {
  const sourceToken = request.sourceTokenAddress.toLowerCase();

  return (
    sourceToken === getNativeToken(request.sourceChainId).toLowerCase() ||
    sourceToken === NATIVE_TOKEN_ADDRESS.toLowerCase()
  );
}
