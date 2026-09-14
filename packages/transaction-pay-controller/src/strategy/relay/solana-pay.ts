import type {
  MetamaskPayExecution,
  MetamaskPayOutcome,
  MetamaskPayRelayStatus,
} from '@metamask/transaction-controller';
import { BigNumber } from 'bignumber.js';

import type {
  GetSolanaPayQuoteRequest,
  SolanaPayPreflight,
  SolanaPayPreflightData,
  TransactionPayIntent,
} from '../../types.js';
import {
  RELAY_SOLANA_CHAIN_ID,
  RELAY_SOLANA_NATIVE_CURRENCY,
} from './constants.js';
import type {
  RelaySolanaQuote,
  RelaySolanaQuoteRequest,
  RelaySolanaTransaction,
  RelayStatus,
} from './types.js';

const SOLANA_MAINNET_CAIP_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_NATIVE_ASSET_REFERENCE = 'slip44:501';
const SOLANA_TOKEN_ASSET_NAMESPACE = 'token:';
const HEX_BYTES_REGEX = /^(?:[\da-f]{2})*$/iu;

/**
 * Builds the Relay /quote/v2 request for a persisted Solana Pay intent.
 *
 * @param intent - Persisted chain-agnostic source identity.
 * @param request - Destination and amount selected by the client.
 * @returns A Relay Solana exact-input request.
 */
export function buildRelaySolanaQuoteRequest(
  intent: TransactionPayIntent,
  request: GetSolanaPayQuoteRequest,
): RelaySolanaQuoteRequest {
  if (intent.sourceChainId !== SOLANA_MAINNET_CAIP_CHAIN_ID) {
    throw new Error(`Unsupported Solana source chain: ${intent.sourceChainId}`);
  }

  const sourceAccount = getSourceAccount(intent);

  return {
    amount: request.amount,
    destinationChainId: Number(request.destinationChainId),
    destinationCurrency: request.destinationCurrency,
    originChainId: RELAY_SOLANA_CHAIN_ID,
    originCurrency: getOriginCurrency(intent),
    recipient: request.recipient,
    refundTo: sourceAccount,
    tradeType: 'EXACT_INPUT',
    user: sourceAccount,
  };
}

/**
 * Normalizes platform-provided Solana RPC observations into Core-owned policy.
 *
 * Native SOL must retain fees and rent in addition to the source amount. SPL
 * sources evaluate token affordability separately from the native reserve.
 *
 * @param intent - Persisted source identity.
 * @param sourceAmountRaw - Exact-input amount in atomic source units.
 * @param data - Platform RPC and prepared-transaction observations.
 * @returns Normalized client-consumable preflight.
 */
export function normalizeSolanaPayPreflight(
  intent: TransactionPayIntent,
  sourceAmountRaw: string,
  data: SolanaPayPreflightData,
): SolanaPayPreflight {
  if (!data.preparationId || !data.preparedTransaction) {
    throw new Error('Invalid Solana preflight preparation');
  }

  const sourceAmount = getAtomicValue('sourceAmountRaw', sourceAmountRaw);
  const sourceBalance = getAtomicValue(
    'sourceBalanceRaw',
    data.sourceBalanceRaw,
  );
  const nativeBalance = getAtomicValue(
    'nativeBalanceRaw',
    data.nativeBalanceRaw,
  );
  const networkFee = getAtomicValue('networkFeeRaw', data.networkFeeRaw);
  const priorityFee = getAtomicValue('priorityFeeRaw', data.priorityFeeRaw);
  const rentDebit = getAtomicValue('rentDebitRaw', data.rentDebitRaw);
  const rentExemptionRequirement = getAtomicValue(
    'rentExemptionRequirementRaw',
    data.rentExemptionRequirementRaw,
  );
  const totalFee = networkFee.plus(priorityFee);
  const retainedReserve = totalFee
    .plus(rentDebit)
    .plus(rentExemptionRequirement);
  const isNative = intent.sourceAssetId.endsWith(
    `/${SOLANA_NATIVE_ASSET_REFERENCE}`,
  );

  if (isNative && !sourceBalance.isEqualTo(nativeBalance)) {
    throw new Error('Invalid Solana preflight native balance mismatch');
  }

  const requiredSourceBalance = isNative
    ? sourceAmount.plus(retainedReserve)
    : sourceAmount;
  const requiredNativeBalance = isNative
    ? requiredSourceBalance
    : retainedReserve;
  const sourceShortfall = BigNumber.maximum(
    requiredSourceBalance.minus(sourceBalance),
    0,
  );
  const nativeShortfall = isNative
    ? new BigNumber(0)
    : BigNumber.maximum(requiredNativeBalance.minus(nativeBalance), 0);

  return {
    ...data,
    affordability: {
      isAffordable: sourceShortfall.isZero() && nativeShortfall.isZero(),
      nativeShortfallRaw: nativeShortfall.toFixed(0),
      sourceShortfallRaw: sourceShortfall.toFixed(0),
    },
    requiredNativeBalanceRaw: requiredNativeBalance.toFixed(0),
    requiredSourceBalanceRaw: requiredSourceBalance.toFixed(0),
    retainedReserveRaw: retainedReserve.toFixed(0),
    sourceAmountRaw: sourceAmount.toFixed(0),
    totalFeeRaw: totalFee.toFixed(0),
  };
}

/**
 * Extracts and validates the single Relay Solana transaction handoff.
 *
 * Relay leaves item data untyped in its public schema. Runtime validation here
 * prevents EVM transaction items or malformed instruction keys from reaching
 * the client callback.
 *
 * @param quote - Relay /quote/v2 response.
 * @returns Instructions and lookup-table addresses for client compilation.
 */
export function getRelaySolanaTransaction(
  quote: RelaySolanaQuote,
): RelaySolanaTransaction {
  const transactionItems = quote.steps.flatMap((step) => step.items);
  const hasInvalidStep = quote.steps.some(
    (step) => step.kind !== 'transaction' || step.requestId !== quote.requestId,
  );

  if (
    !quote.requestId ||
    hasInvalidStep ||
    transactionItems.length !== 1 ||
    !isRelaySolanaTransaction(transactionItems[0].data)
  ) {
    throw new Error('Invalid Relay Solana transaction payload');
  }

  return transactionItems[0].data;
}

/**
 * Returns the durable initial execution checkpoints for an executable quote.
 *
 * @param requiresNonAtomicFollowUp - Whether target completion requires a sponsored follow-up.
 * @returns Initial one-attempt status axes.
 */
export function getInitialSolanaPayExecution(
  requiresNonAtomicFollowUp = false,
): MetamaskPayExecution {
  return {
    followUpStatus: requiresNonAtomicFollowUp ? 'not-started' : 'not-required',
    providerNotificationStatus: 'not-started',
    relayStatus: 'not-started',
    sourceStatus: 'not-started',
  };
}

/**
 * Derives the durable business outcome from independent execution axes.
 *
 * @param intent - Persisted Pay intent and checkpoints.
 * @returns Client-consumable outcome used for parent lifecycle transitions.
 */
export function deriveSolanaPayOutcome(
  intent: TransactionPayIntent,
): MetamaskPayOutcome {
  const execution =
    intent.execution ??
    getInitialSolanaPayExecution(intent.requiresNonAtomicFollowUp);
  const followUpStatus = execution.followUpStatus ?? 'not-required';

  if (execution.submissionOutcome === 'user-rejected') {
    return { type: 'user-rejected' };
  }

  if (execution.submissionOutcome === 'not-submitted') {
    return {
      guaranteedNotSubmitted: true,
      reason: intent.sourceFailureReason,
      type: 'source-failed',
    };
  }

  if (execution.sourceStatus === 'failed') {
    return {
      guaranteedNotSubmitted: false,
      reason: intent.sourceFailureReason,
      type: 'source-failed',
    };
  }

  if (execution.relayStatus === 'failure') {
    return { reason: intent.relayFailureReason, type: 'relay-failed' };
  }

  if (execution.relayStatus === 'refund') {
    return { reason: intent.relayFailureReason, type: 'refunded' };
  }

  if (
    followUpStatus === 'failed' ||
    followUpStatus === 'not-submitted' ||
    followUpStatus === 'user-rejected'
  ) {
    return { type: 'follow-up-failed' };
  }

  if (
    execution.sourceStatus === 'unknown' ||
    execution.submissionOutcome === 'ambiguous'
  ) {
    return { phase: 'source', type: 'unknown' };
  }

  if (execution.relayStatus === 'unknown') {
    return { phase: 'relay', type: 'unknown' };
  }

  if (followUpStatus === 'unknown') {
    return { phase: 'follow-up', type: 'unknown' };
  }

  const isFollowUpComplete =
    followUpStatus === 'not-required' || followUpStatus === 'confirmed';

  if (
    execution.sourceStatus === 'confirmed' &&
    execution.relayStatus === 'success' &&
    isFollowUpComplete
  ) {
    return { type: 'succeeded' };
  }

  if (execution.sourceStatus === 'attempting') {
    return { type: 'attempting' };
  }

  if (
    execution.submissionOutcome === 'submitted' ||
    intent.sourceTransactionId !== undefined ||
    ['submitted', 'pending', 'confirmed'].includes(execution.sourceStatus) ||
    ['pending', 'success'].includes(execution.relayStatus)
  ) {
    return { type: 'submitted' };
  }

  return { type: 'not-started' };
}

/**
 * Maps the provider lifecycle onto the independent durable Relay axis.
 *
 * @param status - Status returned by Relay.
 * @returns Durable Relay observation.
 */
export function mapRelayStatus(status: RelayStatus): MetamaskPayRelayStatus {
  if (status === 'success') {
    return 'success';
  }

  if (status === 'failure') {
    return 'failure';
  }

  if (status === 'refund' || status === 'refunded') {
    return 'refund';
  }

  return 'pending';
}

function getSourceAccount(intent: TransactionPayIntent): string {
  const prefix = `${intent.sourceChainId}:`;

  if (!intent.sourceAccountId.startsWith(prefix)) {
    throw new Error('Solana source account does not match source chain');
  }

  return intent.sourceAccountId.slice(prefix.length);
}

function getOriginCurrency(intent: TransactionPayIntent): string {
  const prefix = `${intent.sourceChainId}/`;

  if (!intent.sourceAssetId.startsWith(prefix)) {
    throw new Error('Solana source asset does not match source chain');
  }

  const assetReference = intent.sourceAssetId.slice(prefix.length);

  if (assetReference === SOLANA_NATIVE_ASSET_REFERENCE) {
    return RELAY_SOLANA_NATIVE_CURRENCY;
  }

  if (assetReference.startsWith(SOLANA_TOKEN_ASSET_NAMESPACE)) {
    return assetReference.slice(SOLANA_TOKEN_ASSET_NAMESPACE.length);
  }

  throw new Error(`Unsupported Solana source asset: ${intent.sourceAssetId}`);
}

function isRelaySolanaTransaction(
  value: unknown,
): value is RelaySolanaTransaction {
  if (!isRecord(value)) {
    return false;
  }

  if (
    value.chainId !== RELAY_SOLANA_CHAIN_ID ||
    !Array.isArray(value.instructions) ||
    value.instructions.length === 0 ||
    !value.instructions.every(isRelaySolanaInstruction)
  ) {
    return false;
  }

  return (
    value.addressLookupTableAddresses === undefined ||
    (Array.isArray(value.addressLookupTableAddresses) &&
      value.addressLookupTableAddresses.every(isNonEmptyString))
  );
}

function isRelaySolanaInstruction(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.programId) &&
    typeof value.data === 'string' &&
    HEX_BYTES_REGEX.test(value.data) &&
    Array.isArray(value.keys) &&
    value.keys.every(isRelaySolanaInstructionKey)
  );
}

function isRelaySolanaInstructionKey(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.pubkey) &&
    typeof value.isSigner === 'boolean' &&
    typeof value.isWritable === 'boolean'
  );
}

function getAtomicValue(name: string, value: string): BigNumber {
  const amount = new BigNumber(value);

  if (!amount.isFinite() || !amount.isInteger() || amount.isNegative()) {
    throw new Error(`Invalid Solana preflight ${name}: ${value}`);
  }

  return amount;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
