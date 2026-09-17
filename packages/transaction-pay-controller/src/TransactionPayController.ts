import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  MetamaskPaySolanaExecution,
  TransactionMeta,
} from '@metamask/transaction-controller';
import { parseCaipAccountId, parseCaipAssetType } from '@metamask/utils';
import type { Draft } from 'immer';
import { noop } from 'lodash-es';

import { updateFiatPayment } from './actions/update-fiat-payment.js';
import { updatePaymentToken } from './actions/update-payment-token.js';
import {
  CONTROLLER_NAME,
  isTransactionPayStrategy,
  PaymentOverride,
  TransactionPayStrategy,
} from './constants.js';
import { QuoteRefresher } from './helpers/QuoteRefresher.js';
import {
  getSolanaPaySupportDiagnostics,
  isSolanaPayLifecycleTransition,
  SolanaPayError,
  withSolanaPayErrorCode,
} from './solana-pay-diagnostics.js';
import { RELAY_SOLANA_CHAIN_ID } from './strategy/relay/constants.js';
import {
  fetchRelaySolanaQuote,
  getRelayStatus,
  notifyRelayTransaction,
} from './strategy/relay/relay-api.js';
import {
  buildRelaySolanaQuoteRequest,
  deriveSolanaPayOutcome,
  getInitialSolanaPayExecution,
  getRelaySolanaTransaction,
  isSolanaPayProductTransaction,
  mapRelayStatus,
  normalizeSolanaPayPreflight,
} from './strategy/relay/solana-pay.js';
import type {
  GetAmountDataCallback,
  GetBalanceCallback,
  GetDelegationTransactionCallback,
  GetPaymentOverrideDataCallback,
  GetSolanaPayQuoteRequest,
  PolymarketCallbacks,
  SetPaySourceRequest,
  SolanaPayCallbacks,
  SolanaPayErrorCode,
  SolanaPayLifecyclePayload,
  SolanaPayQuote,
  SolanaPayStatus,
  SolanaPaySubmissionResult,
  SolanaPaySupportDiagnostics,
  TransactionConfig,
  TransactionConfigCallback,
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayFiatOptions,
  TransactionPayControllerOptions,
  TransactionPayControllerState,
  TransactionPaySource,
  UpdateFiatPaymentRequest,
  UpdatePaymentTokenRequest,
} from './types.js';
import {
  getRelayPollingInterval,
  getRelayPollingTimeout,
  getStrategyOrder,
  isSolanaPayEnabled,
} from './utils/feature-flags.js';
import { updateQuotes } from './utils/quotes.js';
import { updateSourceAmounts } from './utils/source-amounts.js';
import {
  getTransaction,
  subscribeAssetChanges,
  subscribeTransactionChanges,
  updateTransaction,
} from './utils/transaction.js';

const MESSENGER_EXPOSED_METHODS = [
  'getAmountData',
  'getDelegationTransaction',
  'getFiatOptions',
  'getPaymentOverrideData',
  'getSolanaPayQuote',
  'getSolanaPaySupportDiagnostics',
  'getStrategy',
  'polymarketGetDepositWalletAddress',
  'reconcileSolanaPay',
  'recoverSolanaPayStatus',
  'notifyRelayOfSolanaTransaction',
  'polymarketSubmitDepositWalletBatch',
  'setPaySource',
  'setTransactionConfig',
  'submitSolanaPay',
  'updateFiatPayment',
  'updatePaymentToken',
] as const;

const stateMetadata: StateMetadata<TransactionPayControllerState> = {
  transactionData: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: false,
    usedInUi: true,
  },
};

const getDefaultState = (): TransactionPayControllerState => ({
  transactionData: {},
});

type PromiseResult<Value> =
  | { status: 'fulfilled'; value: Value }
  | { status: 'rejected' };

function observePromise<Value>(
  promise: Promise<Value>,
): Promise<PromiseResult<Value>> {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }),
    () => ({ status: 'rejected' }),
  );
}

function getExecutionSourceTransactionId(
  execution: MetamaskPaySolanaExecution,
): string | undefined {
  if (execution.phase !== 'submitted' && execution.phase !== 'unknown') {
    return undefined;
  }

  return execution.sourceTransactionId;
}

function isTerminalSolanaPayOutcome(status: SolanaPayStatus): boolean {
  return [
    'succeeded',
    'user-rejected',
    'source-failed',
    'relay-failed',
    'refunded',
    'follow-up-failed',
  ].includes(status.outcome);
}

function getSolanaPayStatus(
  execution: MetamaskPaySolanaExecution,
): SolanaPayStatus {
  let submissionOutcome: SolanaPayStatus['submissionOutcome'];

  if (execution.phase === 'submitted') {
    submissionOutcome = 'submitted';
  } else if (
    execution.phase === 'user-rejected' ||
    execution.phase === 'not-submitted'
  ) {
    submissionOutcome = execution.phase;
  } else if (execution.phase === 'unknown') {
    submissionOutcome = 'ambiguous';
  }

  return {
    errorCode: execution.errorCode,
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
    submissionOutcome,
    targetTransactionId: execution.targetTransactionId,
  };
}

function getSolanaPaySubmissionErrorCode(
  submission: Exclude<SolanaPaySubmissionResult, { outcome: 'submitted' }>,
): SolanaPayErrorCode {
  if (submission.outcome === 'user-rejected') {
    return 'user_rejected';
  }

  if (submission.outcome === 'ambiguous') {
    return 'submission_unknown';
  }

  return submission.errorCode ?? 'preflight_failed';
}

function getFollowUpStatusFromSubmission(
  outcome: SolanaPaySubmissionResult['outcome'],
): MetamaskPaySolanaExecution['followUpStatus'] {
  if (outcome === 'submitted') {
    return 'submitted';
  }

  return outcome === 'ambiguous' ? 'unknown' : 'failed';
}

function getSolanaPayFailure(
  status: SolanaPayStatus,
): SolanaPayError | undefined {
  if (status.outcome === 'source-failed') {
    return new SolanaPayError(
      status.errorCode ?? 'source_transaction_failed',
      'Solana source transaction failed',
    );
  }

  if (status.outcome === 'relay-failed') {
    return new SolanaPayError('settlement_failed', 'Relay settlement failed');
  }

  if (status.outcome === 'refunded') {
    return new SolanaPayError(
      'settlement_refunded',
      'Relay settlement refunded',
    );
  }

  if (status.outcome === 'follow-up-failed') {
    return new SolanaPayError(
      'follow_up_failed',
      'Solana pay non-atomic follow-up failed',
    );
  }

  return undefined;
}

export class TransactionPayController extends BaseController<
  typeof CONTROLLER_NAME,
  TransactionPayControllerState,
  TransactionPayControllerMessenger
> {
  readonly #fiatOptions?: TransactionPayFiatOptions;

  readonly #getAmountData?: GetAmountDataCallback;

  readonly #getBalance?: GetBalanceCallback;

  readonly #getDelegationTransaction: GetDelegationTransactionCallback;

  readonly #getPaymentOverrideData?: GetPaymentOverrideDataCallback;

  readonly #getStrategy?: (
    transaction: TransactionMeta,
  ) => TransactionPayStrategy;

  readonly #getStrategies?: (
    transaction: TransactionMeta,
  ) => TransactionPayStrategy[];

  readonly #polymarket?: PolymarketCallbacks;

  readonly #solana?: SolanaPayCallbacks;

  constructor({
    fiatOptions,
    getAmountData,
    getBalance,
    getDelegationTransaction,
    getPaymentOverrideData,
    getStrategy,
    getStrategies,
    messenger,
    polymarket,
    solana,
    state,
  }: TransactionPayControllerOptions) {
    super({
      name: CONTROLLER_NAME,
      metadata: stateMetadata,
      messenger,
      state: { ...getDefaultState(), ...state },
    });

    this.#fiatOptions = fiatOptions;
    this.#getAmountData = getAmountData;
    this.#getBalance = getBalance;
    this.#getDelegationTransaction = getDelegationTransaction;
    this.#getPaymentOverrideData = getPaymentOverrideData;
    this.#getStrategy = getStrategy;
    this.#getStrategies = getStrategies;
    this.#polymarket = polymarket;
    this.#solana = solana;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    subscribeTransactionChanges(
      messenger,
      this.#updateTransactionData.bind(this),
      this.#removeTransactionData.bind(this),
    );

    subscribeAssetChanges(
      messenger,
      () => this.state,
      this.#updateTransactionData.bind(this),
    );

    // eslint-disable-next-line no-new
    new QuoteRefresher({
      getStrategies: this.#getStrategiesWithFallback.bind(this),
      messenger,
      updateTransactionData: this.#updateTransactionData.bind(this),
    });
  }

  /**
   * Persists validated chain-agnostic Pay source metadata on the transaction.
   *
   * @param request - Pay source and target transaction ID.
   * @param request.source - Validated CAIP source metadata.
   * @param request.transactionId - Target transaction ID.
   */
  setPaySource({ transactionId, source }: SetPaySourceRequest): void {
    const accountChainId = parseCaipAccountId(source.sourceAccountId).chainId;
    const assetChainId = parseCaipAssetType(source.sourceAssetId).chainId;

    if (accountChainId !== assetChainId) {
      throw new Error('Pay source account and asset must use the same chain');
    }

    updateTransaction(
      {
        transactionId,
        messenger: this.messenger,
        note: 'Set transaction pay source',
      },
      (transaction) => {
        transaction.metamaskPay ??= {};
        transaction.metamaskPay.source = { ...source };
      },
    );
  }

  /**
   * Builds an executable Solana quote and its initial durable checkpoint.
   *
   * @param request - Immutable source snapshot and target transaction ID.
   * @returns Prepared Solana quote.
   */
  async getSolanaPayQuote(
    request: GetSolanaPayQuoteRequest,
  ): Promise<SolanaPayQuote> {
    const transaction = this.#requireTransaction(request.transactionId);
    const source = this.#requireSolanaPaySource(transaction);
    const transactionData = this.state.transactionData[request.transactionId];

    if (!transactionData) {
      throw new Error('TransactionPayController: Transaction data missing');
    }

    if (transaction.metamaskPay?.solanaExecution) {
      throw new Error(
        'TransactionPayController: Solana execution already exists',
      );
    }

    if (!isSolanaPayEnabled(this.messenger)) {
      throw new Error('TransactionPayController: Solana Pay is disabled');
    }

    const quoteRequest = await buildRelaySolanaQuoteRequest(
      source,
      request.sourceAmountRaw,
      transaction,
      transactionData,
      this.messenger,
    );
    const providerQuote = await fetchRelaySolanaQuote(
      this.messenger,
      quoteRequest,
    );
    const sourceTransaction = getRelaySolanaTransaction(providerQuote);
    const sourceAmountRaw = providerQuote.details.currencyIn.amount;

    if (
      quoteRequest.tradeType === 'EXACT_INPUT' &&
      sourceAmountRaw !== quoteRequest.amount
    ) {
      throw new Error(
        'TransactionPayController: Relay Solana source amount mismatch',
      );
    }

    const sourceChainId = parseCaipAccountId(source.sourceAccountId).chainId;
    const preflightData = await this.#requireSolanaCallbacks().getPreflight({
      accountId: request.sourceWalletAccountId,
      caipAccountId: source.sourceAccountId,
      requestId: providerQuote.requestId,
      scope: sourceChainId,
      sourceAmountRaw,
      sourceAssetId: source.sourceAssetId,
      transaction: sourceTransaction,
    });
    const atomicProductActionIncluded = Boolean(quoteRequest.txs?.length);
    const requiresNonAtomicFollowUp =
      transactionData.atomic === false &&
      transactionData.paymentOverride === PaymentOverride.MoneyAccount;
    const execution = getInitialSolanaPayExecution({
      atomicProductActionIncluded,
      atomicProductActionRequired:
        isSolanaPayProductTransaction(transaction) &&
        !requiresNonAtomicFollowUp,
      requestId: providerQuote.requestId,
      requiresNonAtomicFollowUp,
      sourceAmountRaw,
      sourceChainId,
      sourceWalletAccountId: request.sourceWalletAccountId,
    });
    const quote: SolanaPayQuote = {
      preflight: normalizeSolanaPayPreflight(
        source,
        sourceAmountRaw,
        preflightData,
      ),
      providerQuote,
      route: {
        atomicProductActionIncluded,
        recipient: quoteRequest.recipient,
        targetAmountMinimum: transactionData.tokens[0].amountRaw,
        tradeType: quoteRequest.tradeType,
      },
    };

    this.#persistSolanaExecution(
      request.transactionId,
      execution,
      'Set executable Solana pay checkpoint',
    );
    this.#updateTransactionData(request.transactionId, (data) => {
      data.solanaPayQuote = quote;
    });

    return quote;
  }

  /**
   * Returns a privacy-safe support projection for a durable Solana execution.
   *
   * @param transactionId - Target TransactionController transaction ID.
   * @returns Stable categorical diagnostics without raw transaction details.
   */
  getSolanaPaySupportDiagnostics(
    transactionId: string,
  ): SolanaPaySupportDiagnostics {
    const { execution, source } = this.#requireSolanaExecution(transactionId);
    return getSolanaPaySupportDiagnostics(source, execution);
  }

  /**
   * Performs at most one client-owned Solana sign-and-broadcast attempt.
   *
   * The `attempting` checkpoint is persisted before invoking the callback.
   * The callback must resolve with a discriminated completion outcome; only an
   * explicit ambiguous outcome becomes `unknown`. The source signing callback is
   * never invoked again for this execution.
   *
   * @param transactionId - Target TransactionController transaction ID.
   * @returns The latest independent source, notification, and Relay statuses.
   */
  async submitSolanaPay(transactionId: string): Promise<SolanaPayStatus> {
    const { execution, source } = this.#requireSolanaExecution(transactionId);

    if (execution.phase !== 'ready') {
      return await this.reconcileSolanaPay(transactionId);
    }

    const quote = this.state.transactionData[transactionId]?.solanaPayQuote;

    if (quote?.providerQuote.requestId !== execution.requestId) {
      throw new Error('TransactionPayController: Missing Solana Pay quote');
    }

    if (!quote.preflight.affordability.isAffordable) {
      throw new Error(
        'TransactionPayController: Solana source is not affordable',
      );
    }

    this.#persistSolanaExecution(
      transactionId,
      { ...execution, phase: 'attempting' },
      'Start one Solana source attempt',
    );

    const submission =
      await this.#requireSolanaCallbacks().signAndSendTransaction({
        accountId: execution.sourceWalletAccountId,
        caipAccountId: source.sourceAccountId,
        preparedTransaction: quote.preflight.preparedTransaction,
        preparationId: quote.preflight.preparationId,
        requestId: execution.requestId,
        scope: execution.sourceChainId,
      });

    if (submission.outcome !== 'submitted') {
      const phase =
        submission.outcome === 'ambiguous' ? 'unknown' : submission.outcome;
      this.#persistSolanaExecution(
        transactionId,
        {
          ...execution,
          errorCode: getSolanaPaySubmissionErrorCode(submission),
          phase,
          sourceFailureReason:
            submission.outcome === 'user-rejected'
              ? undefined
              : submission.reason,
          sourceStatus:
            submission.outcome === 'ambiguous' ? 'unknown' : 'not-observed',
        },
        `Record Solana source outcome: ${submission.outcome}`,
      );

      return submission.outcome === 'ambiguous'
        ? await this.reconcileSolanaPay(transactionId)
        : this.#getSolanaPayStatus(transactionId);
    }

    this.#persistSolanaExecution(
      transactionId,
      {
        ...execution,
        notificationStatus: 'not-attempted',
        phase: 'submitted',
        sourceStatus: 'pending',
        sourceTransactionId: submission.transactionId,
      },
      'Record submitted Solana source transaction',
    );

    await this.notifyRelayOfSolanaTransaction(transactionId);
    return await this.reconcileSolanaPay(transactionId);
  }

  /**
   * Notifies Relay indexing about an existing Solana signature only.
   *
   * @param transactionId - Target transaction ID.
   * @returns Latest durable status.
   */
  async notifyRelayOfSolanaTransaction(
    transactionId: string,
  ): Promise<SolanaPayStatus> {
    const { execution } = this.#requireSolanaExecution(transactionId);
    const sourceTransactionId = getExecutionSourceTransactionId(execution);

    if (!sourceTransactionId) {
      throw new Error(
        'TransactionPayController: Missing Solana notification correlation',
      );
    }

    this.#persistSolanaExecution(
      transactionId,
      { ...execution, notificationStatus: 'pending' },
      'Start Relay indexing notification',
    );

    const notification = await observePromise(
      notifyRelayTransaction({
        chainId: String(RELAY_SOLANA_CHAIN_ID),
        requestId: execution.requestId,
        txHash: sourceTransactionId,
      }),
    );

    this.#updateSolanaExecution(
      transactionId,
      (current) => ({
        ...current,
        notificationStatus:
          notification.status === 'fulfilled' ? 'success' : 'failure',
      }),
      'Record Relay indexing notification result',
    );

    return this.#getSolanaPayStatus(transactionId);
  }

  /**
   * Observes source and Relay status without signing or source resubmission.
   *
   * @param transactionId - Target transaction ID.
   * @returns Latest durable status.
   */
  async reconcileSolanaPay(transactionId: string): Promise<SolanaPayStatus> {
    return await this.#reconcileSolanaPay(transactionId, false);
  }

  async #reconcileSolanaPay(
    transactionId: string,
    isRecovery: boolean,
  ): Promise<SolanaPayStatus> {
    const { execution: initialExecution, source } =
      this.#requireSolanaExecution(transactionId);
    const relayResult = await observePromise(
      getRelayStatus(initialExecution.requestId),
    );

    this.#updateSolanaExecution(
      transactionId,
      (current) => {
        if (relayResult.status === 'rejected') {
          return {
            ...current,
            relayStatus: ['success', 'failure', 'refund'].includes(
              current.relayStatus,
            )
              ? current.relayStatus
              : 'unknown',
          };
        }

        const [observedSourceTransactionId] = relayResult.value.inTxHashes;
        const sourceTransactionId =
          getExecutionSourceTransactionId(current) ??
          observedSourceTransactionId;
        const [targetTransactionId] = relayResult.value.txHashes.slice(-1);
        const updated = {
          ...current,
          relayFailureReason:
            relayResult.value.failReason ?? relayResult.value.refundFailReason,
          relayStatus: mapRelayStatus(relayResult.value.status),
          targetTransactionId,
        };

        return sourceTransactionId
          ? {
              ...updated,
              notificationStatus:
                current.notificationStatus === 'not-ready'
                  ? 'not-attempted'
                  : current.notificationStatus,
              phase: 'submitted',
              sourceStatus:
                current.sourceStatus === 'not-observed'
                  ? 'pending'
                  : current.sourceStatus,
              sourceTransactionId,
            }
          : updated;
      },
      'Observe Relay Solana status',
      isRecovery,
    );

    const { execution } = this.#requireSolanaExecution(transactionId);
    const sourceTransactionId = getExecutionSourceTransactionId(execution);

    if (
      sourceTransactionId &&
      execution.sourceStatus !== 'confirmed' &&
      execution.sourceStatus !== 'failed'
    ) {
      const sourceResult = await observePromise(
        this.#requireSolanaCallbacks().getTransactionStatus({
          accountId: execution.sourceWalletAccountId,
          caipAccountId: source.sourceAccountId,
          scope: execution.sourceChainId,
          transactionId: sourceTransactionId,
        }),
      );

      this.#updateSolanaExecution(
        transactionId,
        (current) => ({
          ...current,
          sourceStatus:
            sourceResult.status === 'fulfilled'
              ? sourceResult.value
              : 'unknown',
        }),
        'Observe Solana source status',
        isRecovery,
      );
    }

    await this.#advanceNonAtomicFollowUp(transactionId, isRecovery);

    const status = this.#getSolanaPayStatus(transactionId);
    this.#updateSolanaParentLifecycle(transactionId, status);
    return status;
  }

  /**
   * Scans persisted TransactionController records and observes non-terminal
   * Solana execution status. This method never signs, broadcasts, or notifies.
   *
   * @returns Latest statuses keyed by target transaction ID.
   */
  async recoverSolanaPayStatus(): Promise<Record<string, SolanaPayStatus>> {
    const results: Record<string, SolanaPayStatus> = {};
    const { transactions } = this.messenger.call(
      'TransactionController:getState',
    );

    for (const transaction of transactions) {
      const execution = transaction.metamaskPay?.solanaExecution;

      if (!execution) {
        continue;
      }

      const status = getSolanaPayStatus(execution);

      if (isTerminalSolanaPayOutcome(status)) {
        continue;
      }

      results[transaction.id] = await this.#recoverSolanaPayExecution(
        transaction.id,
      );
    }

    return results;
  }

  /**
   * Sets the transaction configuration.
   *
   * The callback receives the current configuration properties and can mutate
   * them in place. Updated values are written back to the transaction data.
   *
   * @param transactionId - The ID of the transaction to configure.
   * @param callback - A callback that receives a mutable {@link TransactionConfig} object.
   */
  setTransactionConfig(
    transactionId: string,
    callback: TransactionConfigCallback,
  ): void {
    this.#updateTransactionData(transactionId, (transactionData) => {
      const config: TransactionConfig = {
        accountOverride: transactionData.accountOverride,
        atomic: transactionData.atomic,
        isHyperliquidSource: transactionData.isHyperliquidSource,
        isMaxAmount: transactionData.isMaxAmount,
        isPolymarketDepositWallet: transactionData.isPolymarketDepositWallet,
        isPostQuote: transactionData.isPostQuote,
        isQuoteRequired: transactionData.isQuoteRequired,
        paymentOverride: transactionData.paymentOverride,
        refundTo: transactionData.refundTo,
      };

      const previousAccountOverride = config.accountOverride;

      callback(config);

      Object.assign(transactionData, config);

      if (
        !config.isPostQuote &&
        config.accountOverride !== previousAccountOverride
      ) {
        transactionData.paymentToken = undefined;
      }
    });
  }

  /**
   * Updates the payment token for a transaction.
   *
   * Resolves token metadata and balances, then stores the new payment token
   * in the transaction data. This triggers recalculation of source amounts
   * and quote retrieval.
   *
   * @param request - The payment token update request containing the
   * transaction ID, token address, and chain ID.
   */
  updatePaymentToken(request: UpdatePaymentTokenRequest): void {
    updatePaymentToken(request, {
      messenger: this.messenger,
      updateTransactionData: this.#updateTransactionData.bind(this),
    });
  }

  /**
   * Updates the fiat payment state for a transaction.
   *
   * The request callback receives the current fiat payment state and can
   * mutate it to update properties such as the selected payment method or
   * fiat amount.
   *
   * @param request - The fiat payment update request containing the
   * transaction ID and a callback to mutate fiat payment state.
   */
  updateFiatPayment(request: UpdateFiatPaymentRequest): void {
    updateFiatPayment(request, {
      messenger: this.messenger,
      updateTransactionData: this.#updateTransactionData.bind(this),
    });
  }

  /**
   * Gets the delegation transaction for a given transaction.
   *
   * Converts the provided transaction into a redeem delegation by delegating
   * to the configured callback. Returns the delegation transaction data
   * including the encoded call data, target address, value, and an optional
   * authorization list.
   *
   * @param args - The arguments forwarded to the {@link GetDelegationTransactionCallback},
   * containing the transaction metadata.
   * @returns A promise resolving to the delegation transaction data.
   */
  getDelegationTransaction(
    ...args: Parameters<GetDelegationTransactionCallback>
  ): ReturnType<GetDelegationTransactionCallback> {
    return this.#getDelegationTransaction(...args);
  }

  /**
   * Returns additional transactions for the paymentOverride flow.
   *
   * Delegates to the client-supplied {@link GetPaymentOverrideDataCallback}.
   * Called during quote execution when `paymentOverride` is defined on the transaction.
   * Returns an empty array when no callback is configured.
   *
   * @param args - The arguments forwarded to the {@link GetPaymentOverrideDataCallback}.
   * @returns A promise resolving to the additional transactions array.
   */
  getAmountData(
    ...args: Parameters<GetAmountDataCallback>
  ): ReturnType<GetAmountDataCallback> {
    return this.#getAmountData?.(...args) ?? Promise.resolve({ updates: [] });
  }

  /**
   * Returns optional fiat execution configuration.
   *
   * This is intentionally not stored in controller state.
   *
   * @returns Fiat execution options, if configured.
   */
  getFiatOptions(): TransactionPayFiatOptions | undefined {
    return this.#fiatOptions;
  }

  getPaymentOverrideData(
    ...args: Parameters<GetPaymentOverrideDataCallback>
  ): ReturnType<GetPaymentOverrideDataCallback> {
    return (
      this.#getPaymentOverrideData?.(...args) ?? Promise.resolve({ calls: [] })
    );
  }

  /**
   * Gets the preferred strategy for a transaction.
   *
   * Returns the first strategy from the ordered list of strategies applicable
   * to the given transaction. Falls back to the default strategy order derived
   * from feature flags when no custom strategy callback is configured.
   *
   * @param transaction - The transaction metadata to determine the strategy for.
   * @returns The preferred {@link TransactionPayStrategy} for the transaction.
   */
  getStrategy(transaction: TransactionMeta): TransactionPayStrategy {
    return this.#getStrategiesWithFallback(transaction)[0];
  }

  /**
   * Derives the Polymarket deposit-wallet address for an EOA via the
   * client-supplied callback.
   *
   * @param args - The arguments forwarded to {@link PolymarketCallbacks.getDepositWalletAddress}.
   * @returns A promise resolving to the deposit-wallet address.
   */
  polymarketGetDepositWalletAddress(
    ...args: Parameters<PolymarketCallbacks['getDepositWalletAddress']>
  ): ReturnType<PolymarketCallbacks['getDepositWalletAddress']> {
    return this.#requirePolymarket().getDepositWalletAddress(...args);
  }

  /**
   * Signs and broadcasts a Polymarket deposit-wallet batch via the
   * client-supplied callback.
   *
   * @param args - The arguments forwarded to {@link PolymarketCallbacks.submitDepositWalletBatch}.
   * @returns A promise resolving to the relayer-issued source hash.
   */
  polymarketSubmitDepositWalletBatch(
    ...args: Parameters<PolymarketCallbacks['submitDepositWalletBatch']>
  ): ReturnType<PolymarketCallbacks['submitDepositWalletBatch']> {
    return this.#requirePolymarket().submitDepositWalletBatch(...args);
  }

  async #recoverSolanaPayExecution(
    transactionId: string,
  ): Promise<SolanaPayStatus> {
    const startTime = Date.now();

    while (true) {
      const status = await this.#reconcileSolanaPay(transactionId, true);

      if (isTerminalSolanaPayOutcome(status)) {
        return status;
      }

      const timeout = getRelayPollingTimeout(this.messenger);

      if (timeout && Date.now() - startTime >= timeout) {
        return status;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, getRelayPollingInterval(this.messenger)),
      );
    }
  }

  async #advanceNonAtomicFollowUp(
    transactionId: string,
    isRecovery: boolean,
  ): Promise<void> {
    let { execution, transaction } =
      this.#requireSolanaExecution(transactionId);

    if (
      !execution.requiresNonAtomicFollowUp ||
      execution.relayStatus !== 'success' ||
      execution.sourceStatus !== 'confirmed'
    ) {
      return;
    }

    if (execution.followUpStatus === 'not-started') {
      const submitFollowUp =
        this.#requireSolanaCallbacks().submitNonAtomicFollowUp;

      if (!submitFollowUp) {
        throw new Error(
          'TransactionPayController: Non-atomic follow-up callback missing',
        );
      }

      this.#persistSolanaExecution(
        transactionId,
        { ...execution, followUpStatus: 'attempting' },
        'Start one sponsored Money Account destination follow-up',
        isRecovery,
      );

      const result = await submitFollowUp({
        requestId: execution.requestId,
        relayTransactionId: execution.targetTransactionId,
        transaction,
      });
      const followUpStatus = getFollowUpStatusFromSubmission(result.outcome);

      this.#updateSolanaExecution(
        transactionId,
        (current) => ({
          ...current,
          followUpStatus,
          followUpTransactionId:
            result.outcome === 'submitted' ? result.transactionId : undefined,
        }),
        `Record Money Account destination follow-up: ${result.outcome}`,
        isRecovery,
      );

      ({ execution, transaction } =
        this.#requireSolanaExecution(transactionId));
    }

    if (
      execution.followUpTransactionId &&
      ['submitted', 'pending', 'unknown'].includes(execution.followUpStatus)
    ) {
      const getFollowUpStatus =
        this.#requireSolanaCallbacks().getNonAtomicFollowUpStatus;

      if (!getFollowUpStatus) {
        throw new Error(
          'TransactionPayController: Non-atomic follow-up status callback missing',
        );
      }

      const result = await observePromise(
        getFollowUpStatus({
          transaction,
          transactionId: execution.followUpTransactionId,
        }),
      );

      this.#updateSolanaExecution(
        transactionId,
        (current) => ({
          ...current,
          followUpStatus:
            result.status === 'fulfilled' ? result.value : 'unknown',
        }),
        'Observe Money Account destination follow-up',
        isRecovery,
      );
    }
  }

  #updateSolanaParentLifecycle(
    transactionId: string,
    status: SolanaPayStatus,
  ): void {
    const transaction = getTransaction(transactionId, this.messenger);

    if (transaction?.status !== 'submitted' || !transaction.isExternalPublish) {
      return;
    }

    const failure = getSolanaPayFailure(status);

    if (failure) {
      this.messenger.call(
        'TransactionController:failTransaction',
        transactionId,
        failure,
      );
      return;
    }

    if (status.outcome !== 'succeeded') {
      return;
    }

    updateTransaction(
      {
        transactionId,
        messenger: this.messenger,
        note: 'Complete external Solana pay execution',
      },
      (current) => {
        current.isIntentComplete = true;
      },
    );
    this.messenger.call(
      'TransactionController:confirmTransaction',
      transactionId,
    );
  }

  #requirePolymarket(): PolymarketCallbacks {
    if (!this.#polymarket) {
      throw new Error('TransactionPayController: Polymarket callbacks missing');
    }
    return this.#polymarket;
  }

  #requireSolanaCallbacks(): SolanaPayCallbacks {
    if (!this.#solana) {
      throw new Error('TransactionPayController: Solana callbacks missing');
    }
    return this.#solana;
  }

  #requireTransaction(transactionId: string): TransactionMeta {
    const transaction = getTransaction(transactionId, this.messenger);

    if (!transaction) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    return transaction;
  }

  #requireSolanaPaySource(transaction: TransactionMeta): TransactionPaySource {
    const source = transaction.metamaskPay?.source;

    if (!source) {
      throw new Error('TransactionPayController: Solana Pay source missing');
    }

    const accountChainId = parseCaipAccountId(source.sourceAccountId).chainId;
    const assetChainId = parseCaipAssetType(source.sourceAssetId).chainId;

    if (
      accountChainId !== assetChainId ||
      !accountChainId.startsWith('solana:')
    ) {
      throw new Error('TransactionPayController: Invalid Solana Pay source');
    }

    return source;
  }

  #requireSolanaExecution(transactionId: string): {
    execution: MetamaskPaySolanaExecution;
    source: TransactionPaySource;
    transaction: TransactionMeta;
  } {
    const transaction = this.#requireTransaction(transactionId);
    const source = this.#requireSolanaPaySource(transaction);
    const execution = transaction.metamaskPay?.solanaExecution;

    if (!execution) {
      throw new Error('TransactionPayController: Solana execution missing');
    }

    const sourceChainId = parseCaipAccountId(source.sourceAccountId).chainId;

    if (execution.sourceChainId !== sourceChainId) {
      throw new Error(
        'TransactionPayController: Solana execution chain mismatch',
      );
    }

    return { execution, source, transaction };
  }

  #getSolanaPayStatus(transactionId: string): SolanaPayStatus {
    const { execution, source } = this.#requireSolanaExecution(transactionId);
    const status = getSolanaPayStatus(execution);
    const diagnostics = getSolanaPaySupportDiagnostics(source, execution);

    return { ...status, errorCode: diagnostics.errorCode };
  }

  #updateSolanaExecution(
    transactionId: string,
    updateExecution: (
      execution: MetamaskPaySolanaExecution,
    ) => MetamaskPaySolanaExecution,
    note: string,
    isRecovery = false,
  ): void {
    const { execution } = this.#requireSolanaExecution(transactionId);
    this.#persistSolanaExecution(
      transactionId,
      updateExecution(execution),
      note,
      isRecovery,
    );
  }

  #persistSolanaExecution(
    transactionId: string,
    execution: MetamaskPaySolanaExecution,
    note: string,
    isRecovery = false,
  ): void {
    const transaction = this.#requireTransaction(transactionId);
    const source = this.#requireSolanaPaySource(transaction);
    const previousExecution = transaction.metamaskPay?.solanaExecution;
    const previousDiagnostics = previousExecution
      ? getSolanaPaySupportDiagnostics(source, previousExecution)
      : undefined;
    const persistedExecution = withSolanaPayErrorCode(execution);
    const nextDiagnostics = getSolanaPaySupportDiagnostics(
      source,
      persistedExecution,
    );

    updateTransaction(
      { transactionId, messenger: this.messenger, note },
      (current) => {
        current.metamaskPay ??= {};
        current.metamaskPay.solanaExecution = { ...persistedExecution };
      },
    );

    if (isSolanaPayLifecycleTransition(previousDiagnostics, nextDiagnostics)) {
      const payload: SolanaPayLifecyclePayload = {
        ...nextDiagnostics,
        isRecovery,
      };
      this.messenger.publish(
        'TransactionPayController:solanaPayLifecycle',
        payload,
      );
    }
  }

  #removeTransactionData(transactionId: string): void {
    this.update((state) => {
      delete state.transactionData[transactionId];
    });
  }

  #updateTransactionData(
    transactionId: string,
    fn: (transactionData: Draft<TransactionData>) => void,
  ): void {
    let shouldUpdateQuotes = false;

    this.update((state) => {
      const { transactionData } = state;
      let current = transactionData[transactionId];
      const originalPaymentToken = current?.paymentToken;
      const originalTokens = current?.tokens;
      const originalIsMaxAmount = current?.isMaxAmount;
      const originalIsPostQuote = current?.isPostQuote;
      const originalAccountOverride = current?.accountOverride;
      const originalFiatPaymentAmount = current?.fiatPayment?.amountFiat;
      const originalFiatPaymentMethodId =
        current?.fiatPayment?.selectedPaymentMethodId;

      if (!current) {
        transactionData[transactionId] = {
          fiatPayment: {},
          isLoading: false,
          tokens: [],
        };

        current = transactionData[transactionId];
      }

      fn(current);

      const isPaymentTokenUpdated =
        current.paymentToken?.address?.toLowerCase() !==
          originalPaymentToken?.address?.toLowerCase() ||
        current.paymentToken?.chainId !== originalPaymentToken?.chainId;

      const isTokensUpdated = current.tokens !== originalTokens;
      const isIsMaxUpdated = current.isMaxAmount !== originalIsMaxAmount;
      const isPostQuoteUpdated = current.isPostQuote !== originalIsPostQuote;
      const isAccountOverrideUpdated =
        current.accountOverride !== originalAccountOverride;
      const isFiatAmountUpdated =
        current.fiatPayment?.amountFiat !== originalFiatPaymentAmount;
      const isFiatPaymentMethodUpdated =
        current.fiatPayment?.selectedPaymentMethodId !==
        originalFiatPaymentMethodId;

      if (
        isPaymentTokenUpdated ||
        isIsMaxUpdated ||
        isTokensUpdated ||
        isPostQuoteUpdated ||
        isAccountOverrideUpdated
      ) {
        updateSourceAmounts(
          transactionId,
          current as never,
          this.messenger,
          this.#getBalance,
        );

        shouldUpdateQuotes = true;
      }

      if (isFiatAmountUpdated || isFiatPaymentMethodUpdated) {
        shouldUpdateQuotes = true;
      }
    });

    if (shouldUpdateQuotes) {
      updateQuotes({
        getStrategies: this.#getStrategiesWithFallback.bind(this),
        messenger: this.messenger,
        transactionData: this.state.transactionData[transactionId],
        transactionId,
        updateTransactionData: this.#updateTransactionData.bind(this),
      }).catch(noop);
    }
  }

  #getStrategiesWithFallback(
    transaction: TransactionMeta,
  ): TransactionPayStrategy[] {
    const transactionData = this.state.transactionData[transaction.id];

    const strategyCandidates: unknown[] =
      this.#getStrategies?.(transaction) ??
      (this.#getStrategy ? [this.#getStrategy(transaction)] : []);

    const validStrategies = strategyCandidates.filter(
      (strategy): strategy is TransactionPayStrategy =>
        isTransactionPayStrategy(strategy),
    );

    if (validStrategies.length) {
      return validStrategies;
    }

    const paymentToken = transactionData?.paymentToken;

    return getStrategyOrder(
      this.messenger,
      paymentToken?.chainId,
      paymentToken?.address,
      transaction.type,
      transactionData?.fiatPayment?.selectedPaymentMethodId,
    );
  }
}
