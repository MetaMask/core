import { Interface } from '@ethersproject/abi';
import {
  hasTransactionType,
  TransactionType,
} from '@metamask/transaction-controller';
import type {
  MetamaskPaySolanaExecution,
  MetamaskPaySolanaRelayStatus,
  TransactionMeta,
} from '@metamask/transaction-controller';
import { parseCaipAccountId, parseCaipAssetType } from '@metamask/utils';
import type { CaipAssetType, CaipChainId, Hex } from '@metamask/utils';
import { BigNumber } from 'bignumber.js';

import {
  ARBITRUM_USDC_ADDRESS,
  CHAIN_ID_ARBITRUM,
  CHAIN_ID_HYPERCORE,
  HYPERCORE_USDC_ADDRESS,
  HYPERCORE_USDC_DECIMALS,
  PaymentOverride,
  PERPS_DEPOSIT_TYPES,
  USDC_DECIMALS,
} from '../../constants.js';
import type {
  NonEvmQuoteRequest,
  SolanaPayOutcome,
  SolanaPayStatus,
  TransactionPayControllerMessenger,
} from '../../types.js';
import { submitSecondLeg } from '../../utils/second-leg.js';
import { getTransaction, updateTransaction } from '../../utils/transaction.js';
import {
  FALLBACK_HASH,
  RELAY_SOLANA_CHAIN_ID,
  RELAY_SOLANA_NATIVE_CURRENCY,
} from './constants.js';
import { getSolanaSourceFailure } from './solana-transaction.js';
import type {
  RelayCompletionOutcome,
  RelaySolanaQuote,
  RelaySolanaQuoteRequest,
  RelaySolanaTransaction,
  RelayStatus,
  RelayStatusResponse,
  SolanaAffordability,
} from './types.js';

const SOLANA_MAINNET_CAIP_CHAIN_ID = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_NATIVE_ASSET_REFERENCE = 'slip44:501';
const SOLANA_TOKEN_ASSET_NAMESPACE = 'token';
const HEX_BYTES_REGEX = /^(?:[\da-f]{2})*$/iu;

const TERMINAL_RELAY_STATUSES: MetamaskPaySolanaRelayStatus[] = [
  'success',
  'failure',
  'refund',
];

const TERMINAL_OUTCOMES: SolanaPayOutcome[] = [
  'succeeded',
  'user-rejected',
  'not-submitted',
  'source-failed',
  'relay-failed',
  'refunded',
  'follow-up-failed',
];

/**
 * Builds the Relay quote request for a non-EVM quote request.
 *
 * @param request - Non-EVM quote request.
 * @param transaction - Parent product transaction.
 * @param messenger - Controller messenger used for destination delegation.
 * @returns A Relay Solana request derived entirely by Core.
 */
export async function buildRelaySolanaQuoteRequest(
  request: NonEvmQuoteRequest,
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): Promise<RelaySolanaQuoteRequest> {
  const { sourceChainId } = request;

  if (sourceChainId !== SOLANA_MAINNET_CAIP_CHAIN_ID) {
    throw new Error(`Unsupported Solana source chain: ${sourceChainId}`);
  }

  const sourceAccount = getSolanaSourceAddress(request);
  const recipient = transaction.txParams.from as Hex;
  const isMoneyAccount = isMoneyAccountRequest(request);
  const isProduct = isSolanaPayProductTransaction(transaction);

  if (isProduct && request.atomic === false && !isMoneyAccount) {
    throw new Error('Unsupported non-atomic Solana Pay product route');
  }

  // Like the EVM Relay path, a Perps deposit to Arbitrum USDC is quoted as a
  // direct HyperCore deposit. Relay credits the HyperCore account itself, so
  // there are no destination calls, and the legacy Arbitrum bridge (which
  // drops deposits below its minimum) is never used.
  if (isHyperliquidDepositRequest(request, transaction) && !isMoneyAccount) {
    return {
      amount: new BigNumber(request.targetAmountMinimum)
        .shiftedBy(HYPERCORE_USDC_DECIMALS - USDC_DECIMALS)
        .toFixed(0),
      destinationChainId: Number(CHAIN_ID_HYPERCORE),
      destinationCurrency: HYPERCORE_USDC_ADDRESS,
      originChainId: RELAY_SOLANA_CHAIN_ID,
      originCurrency: getOriginCurrency(request),
      recipient,
      refundTo: sourceAccount,
      tradeType: 'EXACT_OUTPUT',
      user: sourceAccount,
    };
  }

  const atomicDestination =
    isProduct && !isMoneyAccount
      ? await buildAtomicProductTransactions(
          transaction,
          request.targetTokenAddress,
          request.targetAmountMinimum,
          messenger,
        )
      : undefined;
  const txs = atomicDestination?.txs;
  const tradeType = txs ? 'EXACT_OUTPUT' : 'EXACT_INPUT';
  const amount = txs ? request.targetAmountMinimum : request.sourceTokenAmount;

  if (!amount || amount === '0') {
    throw new Error('Missing Solana Pay amount');
  }

  return {
    amount,
    ...(atomicDestination?.authorizationList && {
      authorizationList: atomicDestination.authorizationList,
    }),
    destinationChainId: Number(request.targetChainId),
    destinationCurrency: request.targetTokenAddress,
    originChainId: RELAY_SOLANA_CHAIN_ID,
    originCurrency: getOriginCurrency(request),
    recipient,
    refundTo: sourceAccount,
    tradeType,
    ...(txs && { txs }),
    user: sourceAccount,
  };
}

/**
 * Applies Core-owned Solana affordability policy to a compiled quote.
 *
 * Native SOL must retain the network fee and the rent reserve in addition to
 * the source amount. SPL sources evaluate token affordability separately from
 * the native SOL reserve.
 *
 * @param request - Affordability inputs in atomic units.
 * @param request.isNative - Whether the source asset is native SOL.
 * @param request.sourceAmountRaw - Source amount required by the quote.
 * @param request.sourceBalanceRaw - Balance of the source asset.
 * @param request.nativeBalanceRaw - Balance of native SOL.
 * @param request.feeRaw - Network fee of the compiled transaction.
 * @param request.rentReserveRaw - Rent-exempt reserve kept in the account.
 * @returns Required balances and independent shortfalls.
 */
export function getSolanaAffordability({
  feeRaw,
  isNative,
  nativeBalanceRaw,
  rentReserveRaw,
  sourceAmountRaw,
  sourceBalanceRaw,
}: {
  feeRaw: string;
  isNative: boolean;
  nativeBalanceRaw: string;
  rentReserveRaw: string;
  sourceAmountRaw: string;
  sourceBalanceRaw: string;
}): SolanaAffordability {
  const retainedReserve = new BigNumber(feeRaw).plus(rentReserveRaw);
  const requiredSourceBalance = isNative
    ? retainedReserve.plus(sourceAmountRaw)
    : new BigNumber(sourceAmountRaw);
  const requiredNativeBalance = isNative
    ? requiredSourceBalance
    : retainedReserve;
  const sourceShortfall = BigNumber.maximum(
    requiredSourceBalance.minus(sourceBalanceRaw),
    0,
  );
  const nativeShortfall = isNative
    ? new BigNumber(0)
    : BigNumber.maximum(requiredNativeBalance.minus(nativeBalanceRaw), 0);

  return {
    isAffordable: sourceShortfall.isZero() && nativeShortfall.isZero(),
    nativeShortfallRaw: nativeShortfall.toFixed(0),
    requiredNativeBalanceRaw: requiredNativeBalance.toFixed(0),
    requiredSourceBalanceRaw: requiredSourceBalance.toFixed(0),
    sourceShortfallRaw: sourceShortfall.toFixed(0),
  };
}

/**
 * Get the CAIP-19 native asset of a Solana chain.
 *
 * @param chainId - CAIP-2 Solana chain ID.
 * @returns CAIP-19 asset type of native SOL.
 */
export function getSolanaNativeAssetId(chainId: CaipChainId): CaipAssetType {
  return `${chainId}/${SOLANA_NATIVE_ASSET_REFERENCE}`;
}

/**
 * Whether a non-EVM request pays with native SOL.
 *
 * @param request - Non-EVM quote request.
 * @returns True if the source asset is native SOL.
 */
export function isSolanaNativeRequest(request: NonEvmQuoteRequest): boolean {
  return (
    request.sourceAssetId === getSolanaNativeAssetId(request.sourceChainId)
  );
}

/**
 * Whether a non-EVM request bridges to a Money Account and needs a
 * non-atomic destination follow-up.
 *
 * @param request - Non-EVM quote request.
 * @returns True for non-atomic Money Account requests.
 */
export function isMoneyAccountRequest(request: NonEvmQuoteRequest): boolean {
  return (
    request.atomic === false &&
    request.paymentOverride === PaymentOverride.MoneyAccount
  );
}

/**
 * Get the base58 Solana address of the source account.
 *
 * @param request - Non-EVM quote request.
 * @returns The Solana address of the source account.
 */
export function getSolanaSourceAddress(request: NonEvmQuoteRequest): string {
  const { address, chainId } = parseCaipAccountId(request.sourceAccountId);

  if (chainId !== request.sourceChainId) {
    throw new Error('Solana source account and asset must use the same chain');
  }

  return address;
}

/**
 * Extracts and validates the single Relay Solana transaction handoff.
 *
 * Relay leaves item data untyped in its public schema. Runtime validation here
 * prevents EVM transaction items or malformed instruction keys from reaching
 * the Core transaction compiler.
 *
 * @param quote - Relay Solana quote response.
 * @returns Instructions and lookup-table addresses to compile.
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

  // The follow-up runs inside a single reconcile call, so an observed
  // `attempting` follow-up was interrupted and its outcome cannot be resolved.
  if (
    execution.phase === 'unknown' ||
    execution.sourceStatus === 'unknown' ||
    execution.relayStatus === 'unknown' ||
    execution.followUpStatus === 'unknown' ||
    execution.followUpStatus === 'attempting'
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

/**
 * Applies one Relay status observation to a durable Solana checkpoint.
 *
 * Relay is the source-observation authority: an indexed `inTxHashes` entry
 * or a settled status means the source transaction landed. A failed
 * observation never downgrades a terminal Relay status, and a source already
 * observed as failed on chain stays failed until Relay observes it.
 *
 * @param execution - Current durable checkpoint.
 * @param status - Relay status response, or undefined if the read failed.
 * @returns The updated checkpoint.
 */
export function applyRelayStatusObservation(
  execution: MetamaskPaySolanaExecution,
  status: RelayStatusResponse | undefined,
): MetamaskPaySolanaExecution {
  if (!status) {
    return {
      ...execution,
      relayStatus: TERMINAL_RELAY_STATUSES.includes(execution.relayStatus)
        ? execution.relayStatus
        : 'unknown',
    };
  }

  const relayStatus = mapRelayStatus(status.status);
  const [observedSourceTransactionId] = status.inTxHashes;
  const [targetTransactionId] = status.txHashes.slice(-1);
  const sourceTransactionId =
    getExecutionSourceTransactionId(execution) ?? observedSourceTransactionId;
  const isSourceObserved =
    Boolean(observedSourceTransactionId) ||
    relayStatus === 'success' ||
    relayStatus === 'refund';

  const updated = {
    ...execution,
    relayFailureReason: status.failReason ?? status.refundFailReason,
    relayStatus,
    targetTransactionId,
  };

  if (!sourceTransactionId) {
    return updated;
  }

  return {
    ...updated,
    notificationStatus:
      execution.notificationStatus === 'not-ready'
        ? 'not-attempted'
        : execution.notificationStatus,
    phase: 'submitted',
    sourceStatus: getUnobservedSourceStatus(execution, isSourceObserved),
    sourceTransactionId,
  };
}

/**
 * Applies the outcome of the publish hook's Relay polling to a durable Solana
 * checkpoint, so a failed follow-up Relay read cannot leave it unobserved.
 *
 * @param execution - Current durable checkpoint.
 * @param completion - Outcome of `waitForRelayCompletion`.
 * @returns The updated checkpoint.
 */
export function applyRelayCompletion(
  execution: MetamaskPaySolanaExecution,
  completion: RelayCompletionOutcome,
): MetamaskPaySolanaExecution {
  if (
    completion.status === 'timeout' ||
    completion.status === 'source-failed'
  ) {
    return execution;
  }

  const relayStatus = mapRelayStatus(completion.status);

  if (relayStatus !== 'success') {
    return { ...execution, relayStatus };
  }

  return {
    ...execution,
    relayStatus,
    sourceStatus: 'confirmed',
    targetTransactionId:
      completion.targetHash && completion.targetHash !== FALLBACK_HASH
        ? completion.targetHash
        : execution.targetTransactionId,
  };
}

/**
 * Reads the on-chain status of a submitted source transaction that Relay has
 * not observed yet.
 *
 * A failed RPC read keeps the source pending.
 *
 * @param messenger - Controller messenger.
 * @param execution - Current durable checkpoint.
 * @returns The failure reason if the source errored or expired.
 */
export async function readSolanaSourceFailure(
  messenger: TransactionPayControllerMessenger,
  execution: MetamaskPaySolanaExecution,
): Promise<string | undefined> {
  if (execution.phase !== 'submitted' || execution.sourceStatus !== 'pending') {
    return undefined;
  }

  return await getSolanaSourceFailure({
    lastValidBlockHeight: execution.lastValidBlockHeight,
    messenger,
    scope: execution.sourceChainId,
    signature: execution.sourceTransactionId,
  }).then(
    (reason) => reason,
    () => undefined,
  );
}

/**
 * Records a source failure read by {@link readSolanaSourceFailure}.
 *
 * @param execution - Current durable checkpoint.
 * @param sourceFailureReason - Failure reason, if the source failed.
 * @returns The updated checkpoint.
 */
export function applySolanaSourceFailure(
  execution: MetamaskPaySolanaExecution,
  sourceFailureReason: string | undefined,
): MetamaskPaySolanaExecution {
  if (!sourceFailureReason) {
    return execution;
  }

  return { ...execution, sourceFailureReason, sourceStatus: 'failed' };
}

/**
 * Runs the non-atomic Money Account second leg once, after Relay delivered
 * the funds to the target transaction account.
 *
 * The `attempting` follow-up checkpoint is persisted before the second leg so
 * it never runs twice. This never signs or broadcasts the Solana source.
 *
 * @param messenger - Controller messenger.
 * @param transactionId - Target transaction ID.
 */
export async function submitSolanaPayFollowUp(
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
): Promise<void> {
  const transaction = getTransaction(transactionId, messenger);
  const execution = transaction?.metamaskPay?.solanaExecution;

  if (
    !transaction ||
    execution?.followUpStatus !== 'not-started' ||
    execution.relayStatus !== 'success' ||
    execution.sourceStatus !== 'confirmed'
  ) {
    return;
  }

  const attempting: MetamaskPaySolanaExecution = {
    ...execution,
    followUpStatus: 'attempting',
  };

  persistSolanaExecution(
    messenger,
    transactionId,
    attempting,
    'Start one Money Account destination follow-up',
  );

  const followUp = await submitSecondLeg({
    chainId: execution.targetChainId,
    // Relay delivers the funds to the target transaction account, not to an
    // overridden quote `from`, so the second leg spends from the same account.
    from: transaction.txParams.from as Hex,
    messenger,
    settlementHash: execution.targetTransactionId as Hex | undefined,
    tokenAddress: execution.targetTokenAddress,
    transaction,
  }).then(
    ({ transactionHash }) => ({
      followUpStatus: 'confirmed' as const,
      followUpTransactionId: transactionHash,
    }),
    (error: unknown) => ({
      followUpFailureReason:
        error instanceof Error ? error.message : String(error),
      followUpStatus: 'failed' as const,
    }),
  );

  persistSolanaExecution(
    messenger,
    transactionId,
    { ...attempting, ...followUp },
    `Record Money Account destination follow-up: ${followUp.followUpStatus}`,
  );
}

/**
 * Derives the observable status of a durable Solana checkpoint.
 *
 * @param execution - Durable checkpoint.
 * @returns Observable status.
 */
export function getSolanaPayStatus(
  execution: MetamaskPaySolanaExecution,
): SolanaPayStatus {
  return {
    followUpFailureReason: execution.followUpFailureReason,
    followUpStatus: execution.followUpStatus,
    followUpTransactionId: execution.followUpTransactionId,
    notificationStatus: execution.notificationStatus,
    outcome: deriveSolanaPayOutcome(execution),
    phase: execution.phase,
    relayFailureReason: execution.relayFailureReason,
    relayStatus: execution.relayStatus,
    requestId: execution.requestId,
    sourceFailureReason: execution.sourceFailureReason,
    sourceStatus: execution.sourceStatus,
    sourceTransactionId: getExecutionSourceTransactionId(execution),
    submissionOutcome: getSubmissionOutcome(execution),
    targetTransactionId: execution.targetTransactionId,
  };
}

/**
 * Whether an observed status will not change again.
 *
 * @param status - Observable status.
 * @returns True for terminal outcomes.
 */
export function isTerminalSolanaPayOutcome(status: SolanaPayStatus): boolean {
  return TERMINAL_OUTCOMES.includes(status.outcome);
}

/**
 * Get the failure reason of a terminal failed status.
 *
 * @param status - Observable status.
 * @returns Failure reason, or undefined if the status is not a failure.
 */
export function getSolanaPayFailure(
  status: SolanaPayStatus,
): string | undefined {
  switch (status.outcome) {
    case 'source-failed':
      return status.sourceFailureReason ?? 'Solana source transaction failed';
    case 'relay-failed':
      return status.relayFailureReason ?? 'Relay settlement failed';
    case 'refunded':
      return status.relayFailureReason ?? 'Relay settlement refunded';
    case 'follow-up-failed':
      return (
        status.followUpFailureReason ?? 'Solana pay non-atomic follow-up failed'
      );
    default:
      return undefined;
  }
}

/**
 * Persists a durable Solana checkpoint on the target transaction.
 *
 * @param messenger - Controller messenger.
 * @param transactionId - Target transaction ID.
 * @param execution - Checkpoint to persist.
 * @param note - Transaction update note.
 */
export function persistSolanaExecution(
  messenger: TransactionPayControllerMessenger,
  transactionId: string,
  execution: MetamaskPaySolanaExecution,
  note: string,
): void {
  updateTransaction({ transactionId, messenger, note }, (transaction) => {
    transaction.metamaskPay ??= {};
    transaction.metamaskPay.solanaExecution = { ...execution };
  });
}

function getUnobservedSourceStatus(
  execution: MetamaskPaySolanaExecution,
  isSourceObserved: boolean,
): MetamaskPaySolanaExecution['sourceStatus'] {
  if (isSourceObserved) {
    return 'confirmed';
  }

  return execution.sourceStatus === 'failed' ? 'failed' : 'pending';
}

function getExecutionSourceTransactionId(
  execution: MetamaskPaySolanaExecution,
): string | undefined {
  if (execution.phase !== 'submitted' && execution.phase !== 'unknown') {
    return undefined;
  }

  return execution.sourceTransactionId;
}

function getSubmissionOutcome(
  execution: MetamaskPaySolanaExecution,
): SolanaPayStatus['submissionOutcome'] {
  switch (execution.phase) {
    case 'submitted':
    case 'user-rejected':
    case 'not-submitted':
      return execution.phase;
    case 'unknown':
      return 'ambiguous';
    default:
      return undefined;
  }
}

function getOriginCurrency(request: NonEvmQuoteRequest): string {
  const { assetNamespace, assetReference } = parseCaipAssetType(
    request.sourceAssetId,
  );

  if (`${assetNamespace}:${assetReference}` === SOLANA_NATIVE_ASSET_REFERENCE) {
    return RELAY_SOLANA_NATIVE_CURRENCY;
  }

  if (assetNamespace === SOLANA_TOKEN_ASSET_NAMESPACE) {
    return assetReference;
  }

  throw new Error(`Unsupported Solana source asset: ${request.sourceAssetId}`);
}

function isRelaySolanaTransaction(
  value: unknown,
): value is RelaySolanaTransaction {
  if (!isRecord(value)) {
    return false;
  }

  if (
    (value.chainId !== undefined && value.chainId !== RELAY_SOLANA_CHAIN_ID) ||
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

/**
 * Whether a Solana Pay request is a Perps deposit that Relay should credit
 * directly on HyperCore, mirroring the EVM Relay request normalization.
 *
 * @param request - Non-EVM quote request.
 * @param transaction - Parent product transaction.
 * @returns True for Perps deposits targeting Arbitrum USDC.
 */
function isHyperliquidDepositRequest(
  request: NonEvmQuoteRequest,
  transaction: TransactionMeta,
): boolean {
  return (
    hasTransactionType(transaction, PERPS_DEPOSIT_TYPES) &&
    request.targetChainId === CHAIN_ID_ARBITRUM &&
    request.targetTokenAddress.toLowerCase() ===
      ARBITRUM_USDC_ADDRESS.toLowerCase()
  );
}

/**
 * Whether a Relay Solana request deposits directly to HyperCore, in which case
 * Relay itself performs the product action.
 *
 * @param request - Relay Solana quote request.
 * @returns True when the destination is HyperCore.
 */
export function isHypercoreDepositQuoteRequest(
  request: Pick<RelaySolanaQuoteRequest, 'destinationChainId'>,
): boolean {
  return request.destinationChainId === Number(CHAIN_ID_HYPERCORE);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
