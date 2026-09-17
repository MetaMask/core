import { Interface } from '@ethersproject/abi';
import {
  hasTransactionType,
  TransactionType,
} from '@metamask/transaction-controller';
import type {
  MetamaskPaySolanaExecution,
  TransactionMeta,
} from '@metamask/transaction-controller';
import { parseCaipAccountId, parseCaipAssetType } from '@metamask/utils';
import type { CaipChainId, Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import { PaymentOverride } from '../../constants.js';
import type {
  SolanaPayOutcome,
  SolanaPayPreflight,
  SolanaPayPreflightData,
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPaySource,
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
 * Builds the Relay /quote/v2 request from persisted Solana Pay source metadata.
 *
 * @param source - Persisted chain-agnostic source identity.
 * @param sourceAmountRaw - Immutable atomic source amount.
 * @param transaction - Parent product transaction.
 * @param transactionData - Core-owned Pay quote inputs.
 * @param messenger - Controller messenger used for destination delegation.
 * @returns A Relay Solana request derived entirely by Core.
 */
export async function buildRelaySolanaQuoteRequest(
  source: TransactionPaySource,
  sourceAmountRaw: string,
  transaction: TransactionMeta,
  transactionData: TransactionData,
  messenger: TransactionPayControllerMessenger,
): Promise<RelaySolanaQuoteRequest> {
  const sourceChainId = getSourceChainId(source);

  if (sourceChainId !== SOLANA_MAINNET_CAIP_CHAIN_ID) {
    throw new Error(`Unsupported Solana source chain: ${sourceChainId}`);
  }

  const sourceAccount = getSourceAccount(source, sourceChainId);
  const target = transactionData.tokens[0];

  if (!target) {
    throw new Error('Missing Solana Pay target token');
  }

  const recipient = transaction.txParams.from as Hex;
  const isMoneyAccount =
    transactionData.atomic === false &&
    transactionData.paymentOverride === PaymentOverride.MoneyAccount;
  const isAtomicProduct =
    isSolanaPayProductTransaction(transaction) && !isMoneyAccount;

  if (
    isSolanaPayProductTransaction(transaction) &&
    transactionData.atomic === false &&
    !isMoneyAccount
  ) {
    throw new Error('Unsupported non-atomic Solana Pay product route');
  }

  const atomicDestination = isAtomicProduct
    ? await buildAtomicProductTransactions(
        transaction,
        target.address,
        target.amountRaw,
        messenger,
      )
    : undefined;
  const txs = atomicDestination?.txs;
  const tradeType = txs ? 'EXACT_OUTPUT' : 'EXACT_INPUT';
  const amount = txs ? target.amountRaw : sourceAmountRaw;

  if (!amount) {
    throw new Error('Missing Solana Pay source amount');
  }

  return {
    amount,
    ...(atomicDestination?.authorizationList && {
      authorizationList: atomicDestination.authorizationList,
    }),
    destinationChainId: Number(target.chainId),
    destinationCurrency: target.address,
    originChainId: RELAY_SOLANA_CHAIN_ID,
    originCurrency: getOriginCurrency(source, sourceChainId),
    recipient,
    refundTo: sourceAccount,
    tradeType,
    ...(txs && { txs }),
    user: sourceAccount,
  };
}

/**
 * Normalizes platform-provided Solana RPC observations into Core-owned policy.
 *
 * Native SOL must retain fees and rent in addition to the source amount. SPL
 * sources evaluate token affordability separately from the native reserve.
 *
 * @param source - Persisted source identity.
 * @param sourceAmountRaw - Exact-input amount in atomic source units.
 * @param data - Platform RPC and prepared-transaction observations.
 * @returns Normalized client-consumable preflight.
 */
export function normalizeSolanaPayPreflight(
  source: TransactionPaySource,
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
  const isNative = source.sourceAssetId.endsWith(
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
 * Creates the ready checkpoint once an executable Relay request exists.
 *
 * @param request - Immutable source and route correlation.
 * @param request.sourceWalletAccountId - Wallet-local account ID.
 * @param request.sourceChainId - Source chain derived from CAIP metadata.
 * @param request.sourceAmountRaw - Immutable atomic source amount.
 * @param request.requestId - Relay request ID.
 * @param request.atomicProductActionRequired - Whether an atomic action is required.
 * @param request.atomicProductActionIncluded - Whether the quote includes that action.
 * @param request.requiresNonAtomicFollowUp - Whether Money Account follow-up is required.
 * @returns Ready durable execution checkpoint.
 */
export function getInitialSolanaPayExecution(request: {
  sourceWalletAccountId: MetamaskPaySolanaExecution['sourceWalletAccountId'];
  sourceChainId: CaipChainId;
  sourceAmountRaw: string;
  requestId: string;
  atomicProductActionRequired: boolean;
  atomicProductActionIncluded: boolean;
  requiresNonAtomicFollowUp: boolean;
}): MetamaskPaySolanaExecution {
  return {
    ...request,
    phase: 'ready',
    sourceStatus: 'not-observed',
    relayStatus: 'not-observed',
    notificationStatus: 'not-ready',
    followUpStatus: request.requiresNonAtomicFollowUp
      ? 'not-started'
      : 'not-required',
  };
}

/**
 * Derives the client and lifecycle outcome from the durable checkpoint.
 *
 * @param execution - Durable external Solana execution checkpoint.
 * @returns Derived lifecycle outcome.
 */
export function deriveSolanaPayOutcome(
  execution: MetamaskPaySolanaExecution,
): SolanaPayOutcome {
  if (execution.phase === 'user-rejected') {
    return 'user-rejected';
  }

  if (execution.phase === 'not-submitted') {
    return 'not-submitted';
  }

  if (execution.sourceStatus === 'failed') {
    return 'source-failed';
  }

  if (execution.relayStatus === 'failure') {
    return 'relay-failed';
  }

  if (execution.relayStatus === 'refund') {
    return 'refunded';
  }

  if (execution.followUpStatus === 'failed') {
    return 'follow-up-failed';
  }

  if (
    execution.phase === 'unknown' ||
    execution.sourceStatus === 'unknown' ||
    execution.relayStatus === 'unknown' ||
    execution.followUpStatus === 'unknown'
  ) {
    return 'unknown';
  }

  const isFollowUpComplete =
    execution.followUpStatus === 'not-required' ||
    execution.followUpStatus === 'confirmed';
  const isAtomicProductActionComplete =
    !execution.atomicProductActionRequired ||
    execution.atomicProductActionIncluded;

  if (
    execution.sourceStatus === 'confirmed' &&
    execution.relayStatus === 'success' &&
    isFollowUpComplete &&
    isAtomicProductActionComplete
  ) {
    return 'succeeded';
  }

  return execution.phase;
}

/**
 * Maps the provider lifecycle onto the independent durable Relay axis.
 *
 * @param status - Status returned by Relay.
 * @returns Durable Relay observation.
 */
export function mapRelayStatus(
  status: RelayStatus,
): MetamaskPaySolanaExecution['relayStatus'] {
  if (status === 'success') {
    return 'success';
  }

  if (status === 'failure') {
    return 'failure';
  }

  if (status === 'refund' || status === 'refunded') {
    return 'refund';
  }

  if (
    ['waiting', 'depositing', 'pending', 'submitted', 'delayed'].includes(
      status,
    )
  ) {
    return 'pending';
  }

  return 'unknown';
}

function getSourceChainId(source: TransactionPaySource): CaipChainId {
  const accountChainId = parseCaipAccountId(source.sourceAccountId).chainId;
  const assetChainId = parseCaipAssetType(source.sourceAssetId).chainId;

  if (accountChainId !== assetChainId) {
    throw new Error('Solana source account and asset must use the same chain');
  }

  return accountChainId;
}

function getSourceAccount(
  source: TransactionPaySource,
  sourceChainId: CaipChainId,
): string {
  return source.sourceAccountId.slice(`${sourceChainId}:`.length);
}

function getOriginCurrency(
  source: TransactionPaySource,
  sourceChainId: CaipChainId,
): string {
  const assetReference = source.sourceAssetId.slice(`${sourceChainId}/`.length);

  if (assetReference === SOLANA_NATIVE_ASSET_REFERENCE) {
    return RELAY_SOLANA_NATIVE_CURRENCY;
  }

  if (assetReference.startsWith(SOLANA_TOKEN_ASSET_NAMESPACE)) {
    return assetReference.slice(SOLANA_TOKEN_ASSET_NAMESPACE.length);
  }

  throw new Error(`Unsupported Solana source asset: ${source.sourceAssetId}`);
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

export function isSolanaPayProductTransaction(
  transaction: TransactionMeta,
): boolean {
  return hasTransactionType(transaction, [
    TransactionType.perpsDeposit,
    TransactionType.perpsDepositAndOrder,
    TransactionType.predictDeposit,
    TransactionType.predictDepositAndOrder,
  ]);
}

async function buildAtomicProductTransactions(
  transaction: TransactionMeta,
  targetTokenAddress: Hex,
  targetAmountMinimum: string,
  messenger: TransactionPayControllerMessenger,
): Promise<{
  authorizationList: RelaySolanaQuoteRequest['authorizationList'];
  txs: NonNullable<RelaySolanaQuoteRequest['txs']>;
}> {
  const delegation = await messenger.call(
    'TransactionPayController:getDelegationTransaction',
    { transaction },
  );
  const recipient = transaction.txParams.from as Hex;

  return {
    authorizationList: delegation.authorizationList?.map((authorization) => ({
      ...authorization,
      chainId: Number(authorization.chainId),
      nonce: Number(authorization.nonce),
      r: authorization.r as Hex,
      s: authorization.s as Hex,
      yParity: Number(authorization.yParity),
    })),
    txs: [
      {
        data: new Interface([
          'function transfer(address to, uint256 amount)',
        ]).encodeFunctionData('transfer', [
          recipient,
          targetAmountMinimum,
        ]) as Hex,
        to: targetTokenAddress,
        value: '0x0',
      },
      {
        data: delegation.data,
        to: delegation.to,
        value: delegation.value,
      },
    ],
  };
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
