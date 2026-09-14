import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { parseCaipAccountId, parseCaipAssetType } from '@metamask/utils';
import type { Draft } from 'immer';
import { noop } from 'lodash-es';

import { updateFiatPayment } from './actions/update-fiat-payment.js';
import { updatePaymentToken } from './actions/update-payment-token.js';
import {
  CONTROLLER_NAME,
  isTransactionPayStrategy,
  TransactionPayStrategy,
} from './constants.js';
import { QuoteRefresher } from './helpers/QuoteRefresher.js';
import { RELAY_SOLANA_CHAIN_ID } from './strategy/relay/constants.js';
import {
  fetchRelaySolanaQuote,
  getRelayStatus,
  notifyRelayTransaction,
} from './strategy/relay/relay-api.js';
import {
  buildRelaySolanaQuoteRequest,
  getInitialSolanaPayExecution,
  getRelaySolanaTransaction,
  mapRelayStatus,
} from './strategy/relay/solana-pay.js';
import type {
  GetAmountDataCallback,
  GetBalanceCallback,
  GetDelegationTransactionCallback,
  GetPaymentOverrideDataCallback,
  GetSolanaPayQuoteRequest,
  PolymarketCallbacks,
  SetPayIntentRequest,
  SolanaPayCallbacks,
  SolanaPayQuote,
  SolanaPayStatus,
  TransactionConfig,
  TransactionConfigCallback,
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayFiatOptions,
  TransactionPayControllerOptions,
  TransactionPayControllerState,
  TransactionPayIntent,
  UpdateFiatPaymentRequest,
  UpdatePaymentTokenRequest,
} from './types.js';
import { getStrategyOrder } from './utils/feature-flags.js';
import { updateQuotes } from './utils/quotes.js';
import { updateSourceAmounts } from './utils/source-amounts.js';
import {
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
  'getStrategy',
  'polymarketGetDepositWalletAddress',
  'reconcileSolanaPay',
  'recoverSolanaPay',
  'retrySolanaPayNotification',
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

function getSolanaPayExecution(
  intent: TransactionPayIntent,
): NonNullable<TransactionPayIntent['execution']> {
  return intent.execution ?? getInitialSolanaPayExecution();
}

function isTerminalRelayStatus(
  status: NonNullable<TransactionPayIntent['execution']>['relayStatus'],
): boolean {
  return ['success', 'failure', 'refund'].includes(status);
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
   * Persists chain-agnostic Pay source metadata on the target transaction.
   *
   * The CAIP-10 account and CAIP-19 asset must identify the same chain.
   * Legacy EVM-only Pay metadata is preserved unchanged.
   *
   * @param request - Pay source metadata and target transaction ID.
   * @param request.source - Chain-agnostic payment source metadata.
   * @param request.transactionId - ID of the target transaction.
   */
  setPayIntent({ transactionId, intent }: SetPayIntentRequest): void {
    this.#persistPayIntent(transactionId, intent, 'Set transaction pay intent');
  }

  /**
   * Fetches and stores an executable Relay /quote/v2 Solana quote.
   *
   * The provider request ID is persisted before the quote can be published;
   * the full instruction payload remains transient because recovery only
   * observes an existing attempt and never resubmits it.
   *
   * @param request - Source amount and EVM destination details.
   * @returns The Relay Solana quote for client display and confirmation.
   */
  async getSolanaPayQuote(
    request: GetSolanaPayQuoteRequest,
  ): Promise<SolanaPayQuote> {
    const intent = this.#requireSolanaPayIntent(request.transactionId);

    if (getSolanaPayExecution(intent).sourceStatus !== 'not-started') {
      throw new Error(
        'TransactionPayController: Solana source attempt already started',
      );
    }

    const quoteRequest = buildRelaySolanaQuoteRequest(intent, request);
    const quote = await fetchRelaySolanaQuote(this.messenger, quoteRequest);

    getRelaySolanaTransaction(quote);

    this.#persistPayIntent(
      request.transactionId,
      {
        ...intent,
        execution: getInitialSolanaPayExecution(),
        relayFailureReason: undefined,
        requestId: quote.requestId,
        sourceTransactionId: undefined,
        targetTransactionId: undefined,
      },
      'Set Solana pay quote checkpoint',
    );

    this.#updateTransactionData(request.transactionId, (transactionData) => {
      transactionData.solanaPayQuote = quote;
    });

    return quote;
  }

  /**
   * Performs at most one client-owned Solana sign-and-broadcast attempt.
   *
   * The `attempting` checkpoint is persisted before invoking the callback. Any
   * callback rejection is treated as ambiguous and becomes `unknown`; neither
   * this method nor recovery will invoke the callback again.
   *
   * @param transactionId - Target TransactionController transaction ID.
   * @returns The latest independent source, notification, and Relay statuses.
   */
  async submitSolanaPay(transactionId: string): Promise<SolanaPayStatus> {
    const intent = this.#requireSolanaPayIntent(transactionId);
    const execution = getSolanaPayExecution(intent);

    if (execution.sourceStatus !== 'not-started') {
      return await this.reconcileSolanaPay(transactionId);
    }

    const quote = this.state.transactionData[transactionId]?.solanaPayQuote;

    if (!quote || quote.requestId !== intent.requestId) {
      throw new Error('TransactionPayController: Missing Solana Pay quote');
    }

    const solana = this.#requireSolanaCallbacks();
    const transaction = getRelaySolanaTransaction(quote);

    this.#updatePayIntent(
      transactionId,
      (current) => ({
        ...current,
        execution: {
          ...getSolanaPayExecution(current),
          sourceStatus: 'attempting',
        },
      }),
      'Start Solana source attempt',
    );

    const submission = await observePromise(
      solana.signAndSendTransaction({
        accountId: intent.sourceAccountId,
        requestId: intent.requestId,
        scope: intent.sourceChainId,
        transaction,
      }),
    );

    if (submission.status === 'rejected') {
      this.#updatePayIntent(
        transactionId,
        (current) => ({
          ...current,
          execution: {
            ...getSolanaPayExecution(current),
            sourceStatus: 'unknown',
          },
        }),
        'Mark Solana source attempt ambiguous',
      );
      return this.#getSolanaPayStatus(transactionId);
    }

    this.#updatePayIntent(
      transactionId,
      (current) => ({
        ...current,
        execution: {
          ...getSolanaPayExecution(current),
          providerNotificationStatus: 'pending',
          sourceStatus: 'submitted',
        },
        sourceTransactionId: submission.value.transactionId,
      }),
      'Record Solana source transaction',
    );

    await this.retrySolanaPayNotification(transactionId);
    return await this.reconcileSolanaPay(transactionId);
  }

  /**
   * Retries only Relay's transaction-index notification.
   *
   * This method never invokes the signing callback and notification failure
   * does not alter source or settlement observations.
   *
   * @param transactionId - Target TransactionController transaction ID.
   * @returns The latest durable status.
   */
  async retrySolanaPayNotification(
    transactionId: string,
  ): Promise<SolanaPayStatus> {
    const intent = this.#requireSolanaPayIntent(transactionId);

    if (!intent.requestId || !intent.sourceTransactionId) {
      throw new Error(
        'TransactionPayController: Missing Solana notification correlation',
      );
    }

    this.#updatePayIntent(
      transactionId,
      (current) => ({
        ...current,
        execution: {
          ...getSolanaPayExecution(current),
          providerNotificationStatus: 'pending',
        },
      }),
      'Start Relay source notification',
    );

    const notification = await observePromise(
      notifyRelayTransaction({
        chainId: String(RELAY_SOLANA_CHAIN_ID),
        requestId: intent.requestId,
        txHash: intent.sourceTransactionId,
      }),
    );

    this.#updatePayIntent(
      transactionId,
      (current) => ({
        ...current,
        execution: {
          ...getSolanaPayExecution(current),
          providerNotificationStatus:
            notification.status === 'fulfilled' ? 'succeeded' : 'failed',
        },
      }),
      'Record Relay source notification result',
    );

    return this.#getSolanaPayStatus(transactionId);
  }

  /**
   * Reconciles source-chain and Relay status without signing, notifying, or
   * resubmitting. It can recover a source signature from Relay after callback
   * loss and persists each observation for the next restart.
   *
   * @param transactionId - Target TransactionController transaction ID.
   * @returns The latest durable status.
   */
  async reconcileSolanaPay(transactionId: string): Promise<SolanaPayStatus> {
    const initialIntent = this.#requireSolanaPayIntent(transactionId);

    if (!initialIntent.requestId) {
      throw new Error('TransactionPayController: Missing Relay request ID');
    }

    const relayResult = await observePromise(
      getRelayStatus(initialIntent.requestId),
    );

    this.#updatePayIntent(
      transactionId,
      (current) => {
        if (relayResult.status === 'rejected') {
          const execution = getSolanaPayExecution(current);
          return {
            ...current,
            execution: {
              ...execution,
              relayStatus: isTerminalRelayStatus(execution.relayStatus)
                ? execution.relayStatus
                : 'unknown',
            },
          };
        }

        const [observedSourceTransactionId] = relayResult.value.inTxHashes;
        const sourceTransactionId =
          current.sourceTransactionId ?? observedSourceTransactionId;
        const [targetTransactionId] = relayResult.value.txHashes.slice(-1);

        return {
          ...current,
          execution: {
            ...getSolanaPayExecution(current),
            relayStatus: mapRelayStatus(relayResult.value.status),
            ...(!sourceTransactionId &&
              getSolanaPayExecution(current).sourceStatus === 'attempting' && {
                sourceStatus: 'unknown' as const,
              }),
          },
          relayFailureReason:
            relayResult.value.failReason ?? relayResult.value.refundFailReason,
          sourceTransactionId,
          targetTransactionId,
        };
      },
      'Reconcile Relay Solana status',
    );

    const intent = this.#requireSolanaPayIntent(transactionId);
    const { sourceStatus } = getSolanaPayExecution(intent);

    if (
      intent.sourceTransactionId &&
      sourceStatus !== 'confirmed' &&
      sourceStatus !== 'failed'
    ) {
      const sourceResult = await observePromise(
        this.#requireSolanaCallbacks().getTransactionStatus({
          accountId: intent.sourceAccountId,
          scope: intent.sourceChainId,
          transactionId: intent.sourceTransactionId,
        }),
      );

      this.#updatePayIntent(
        transactionId,
        (current) => ({
          ...current,
          execution: {
            ...getSolanaPayExecution(current),
            sourceStatus:
              sourceResult.status === 'fulfilled'
                ? sourceResult.value
                : 'unknown',
          },
        }),
        'Reconcile Solana source status',
      );
    }

    const status = this.#getSolanaPayStatus(transactionId);

    if (
      status.sourceStatus === 'confirmed' &&
      status.relayStatus === 'success'
    ) {
      updateTransaction(
        {
          transactionId,
          messenger: this.messenger,
          note: 'Complete Solana pay intent',
        },
        (transaction) => {
          transaction.isIntentComplete = true;
        },
      );
    }

    return status;
  }

  /**
   * Resumes observation for all persisted, non-terminal Solana Pay intents.
   * Source submission and provider notification are intentionally excluded.
   *
   * @returns Latest statuses keyed by target transaction ID.
   */
  async recoverSolanaPay(): Promise<Record<string, SolanaPayStatus>> {
    const results: Record<string, SolanaPayStatus> = {};

    for (const [transactionId, intent] of Object.entries(
      this.state.payIntents,
    )) {
      const execution = getSolanaPayExecution(intent);

      if (
        !intent.sourceChainId.startsWith('solana:') ||
        !intent.requestId ||
        (['confirmed', 'failed'].includes(execution.sourceStatus) &&
          isTerminalRelayStatus(execution.relayStatus))
      ) {
        continue;
      }

      results[transactionId] = await this.reconcileSolanaPay(transactionId);
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

  #requireSolanaPayIntent(transactionId: string): TransactionPayIntent {
    const intent = this.state.payIntents[transactionId];

    if (!intent?.sourceChainId.startsWith('solana:')) {
      throw new Error('TransactionPayController: Solana Pay intent missing');
    }

    return intent;
  }

  #getSolanaPayStatus(transactionId: string): SolanaPayStatus {
    const intent = this.#requireSolanaPayIntent(transactionId);
    const execution = getSolanaPayExecution(intent);

    return {
      failureReason: intent.relayFailureReason,
      providerNotificationStatus: execution.providerNotificationStatus,
      relayStatus: execution.relayStatus,
      requestId: intent.requestId as string,
      sourceStatus: execution.sourceStatus,
      sourceTransactionId: intent.sourceTransactionId,
      targetTransactionId: intent.targetTransactionId,
    };
  }

  #updatePayIntent(
    transactionId: string,
    updateIntent: (intent: TransactionPayIntent) => TransactionPayIntent,
    note: string,
  ): void {
    const intent = this.#requireSolanaPayIntent(transactionId);
    this.#persistPayIntent(transactionId, updateIntent(intent), note);
  }

  #persistPayIntent(
    transactionId: string,
    intent: TransactionPayIntent,
    note: string,
  ): void {
    updateTransaction(
      {
        transactionId,
        messenger: this.messenger,
        note,
      },
      (transaction) => {
        transaction.metamaskPay ??= {};
        transaction.metamaskPay.intent = { ...intent };
      },
    );

    this.update((state) => {
      state.payIntents[transactionId] = { ...intent };
    });
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
