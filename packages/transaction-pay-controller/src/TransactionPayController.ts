import type { StateMetadata } from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { TransactionStatus } from '@metamask/transaction-controller';
import type {
  MetamaskPaySolanaExecution,
  TransactionMeta,
} from '@metamask/transaction-controller';
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
import { getRelayStatus } from './strategy/relay/relay-api.js';
import {
  getSolanaPaySupportDiagnostics,
  isSolanaPayLifecycleTransition,
} from './strategy/relay/solana-pay-diagnostics.js';
import {
  applyRelayStatusObservation,
  applySolanaSourceFailure,
  getSolanaPayFailure,
  getSolanaPayStatus,
  isTerminalSolanaPayOutcome,
  persistSolanaExecution,
  readSolanaSourceFailure,
  submitSolanaPayFollowUp,
} from './strategy/relay/solana-pay.js';
import type {
  GetAmountDataCallback,
  GetBalanceCallback,
  GetDelegationTransactionCallback,
  GetPaymentOverrideDataCallback,
  PolymarketCallbacks,
  SolanaPayStatus,
  SolanaPaySupportDiagnostics,
  TransactionConfig,
  TransactionConfigCallback,
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionPayFiatOptions,
  TransactionPayControllerOptions,
  TransactionPayControllerState,
  UpdateFiatPaymentRequest,
  UpdatePaymentTokenRequest,
} from './types.js';
import { getStrategyOrder } from './utils/feature-flags.js';
import { updateQuotes } from './utils/quotes.js';
import { updateSourceAmounts } from './utils/source-amounts.js';
import { isNonEvmPaymentToken, isSamePaymentToken } from './utils/token.js';
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
  'getInfuraProjectId',
  'getPaymentOverrideData',
  'getSolanaPaySupportDiagnostics',
  'getStrategy',
  'polymarketGetDepositWalletAddress',
  'polymarketSubmitDepositWalletBatch',
  'reconcileSolanaPay',
  'recoverSolanaPayStatus',
  'setTransactionConfig',
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

  readonly #infuraProjectId?: string;

  readonly #polymarket?: PolymarketCallbacks;

  readonly #recoveringSolanaPayTransactionIds = new Set<string>();

  constructor({
    fiatOptions,
    getAmountData,
    getBalance,
    getDelegationTransaction,
    getPaymentOverrideData,
    getStrategy,
    getStrategies,
    infuraProjectId,
    messenger,
    polymarket,
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
    this.#infuraProjectId = infuraProjectId;
    this.#polymarket = polymarket;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    subscribeTransactionChanges(
      messenger,
      this.#updateTransactionData.bind(this),
      this.#removeTransactionData.bind(this),
    );

    messenger.subscribe(
      'TransactionController:stateChange',
      this.#publishSolanaPayLifecycle.bind(this),
      (transactionControllerState) => transactionControllerState.transactions,
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

  /**
   * Returns the Infura project ID used to resolve `{infuraProjectId}`
   * placeholders in RPC URLs.
   *
   * @returns The Infura project ID, if configured.
   */
  getInfuraProjectId(): string | undefined {
    return this.#infuraProjectId;
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

  /**
   * Observes a Solana Pay execution through Relay status and finalizes the
   * externally published target transaction once the outcome is terminal.
   * While Relay has not observed the source transaction, its on-chain status
   * is read once from the Solana RPC to detect a failed or expired source.
   * Once Relay delivered the funds of a Money Account deposit, the non-atomic
   * second leg runs once, guarded by the follow-up checkpoint.
   *
   * This method never signs or broadcasts the Solana source transaction, and
   * never notifies Relay.
   *
   * @param transactionId - Target transaction ID.
   * @returns The latest observed status.
   */
  async reconcileSolanaPay(transactionId: string): Promise<SolanaPayStatus> {
    const { requestId } = this.#requireSolanaExecution(transactionId);

    const relayStatus = await getRelayStatus(requestId).then(
      (status) => status,
      () => undefined,
    );

    const sourceFailureReason = await readSolanaSourceFailure(
      this.messenger,
      applyRelayStatusObservation(
        this.#requireSolanaExecution(transactionId),
        relayStatus,
      ),
    );

    persistSolanaExecution(
      this.messenger,
      transactionId,
      applySolanaSourceFailure(
        applyRelayStatusObservation(
          this.#requireSolanaExecution(transactionId),
          relayStatus,
        ),
        sourceFailureReason,
      ),
      'Observe Relay Solana status',
    );

    await submitSolanaPayFollowUp(this.messenger, transactionId);

    const status = getSolanaPayStatus(
      this.#requireSolanaExecution(transactionId),
    );

    this.#finalizeSolanaPayTransaction(transactionId, status);
    return status;
  }

  /**
   * Observes every persisted Solana Pay execution that is not terminal once,
   * independently of each other. Clients call it again on foreground or
   * startup to keep observing.
   *
   * This method never signs, broadcasts, or notifies Relay.
   *
   * @returns Latest statuses keyed by target transaction ID, omitting
   * executions whose observation failed.
   */
  async recoverSolanaPayStatus(): Promise<Record<string, SolanaPayStatus>> {
    const { transactions } = this.messenger.call(
      'TransactionController:getState',
    );

    const pending = transactions.filter((transaction) => {
      const execution = transaction.metamaskPay?.solanaExecution;

      return (
        execution && !isTerminalSolanaPayOutcome(getSolanaPayStatus(execution))
      );
    });

    pending.forEach(({ id }) =>
      this.#recoveringSolanaPayTransactionIds.add(id),
    );

    const observations = await Promise.allSettled(
      pending.map((transaction) => this.reconcileSolanaPay(transaction.id)),
    );

    pending.forEach(({ id }) =>
      this.#recoveringSolanaPayTransactionIds.delete(id),
    );

    return observations.reduce<Record<string, SolanaPayStatus>>(
      (results, observation, index) => {
        if (observation.status === 'fulfilled') {
          results[pending[index].id] = observation.value;
        }

        return results;
      },
      {},
    );
  }

  /**
   * Returns the privacy-safe support diagnostics of a Solana Pay execution.
   *
   * The diagnostics only carry categorical values and identifier-presence
   * flags, never accounts, assets, amounts, identifiers or failure text.
   *
   * @param transactionId - Target transaction ID.
   * @returns Categorical diagnostics of the persisted execution checkpoint.
   */
  getSolanaPaySupportDiagnostics(
    transactionId: string,
  ): SolanaPaySupportDiagnostics {
    const execution = this.#requireSolanaExecution(transactionId);

    return getSolanaPaySupportDiagnostics(
      getSolanaPayStatus(execution),
      execution,
      getTransaction(transactionId, this.messenger)?.metamaskPay?.source,
    );
  }

  #publishSolanaPayLifecycle(
    transactions: TransactionMeta[],
    previousTransactions: TransactionMeta[] | undefined,
  ): void {
    for (const transaction of transactions) {
      const execution = transaction.metamaskPay?.solanaExecution;

      if (!execution) {
        continue;
      }

      const previousTransaction = previousTransactions?.find(
        (previous) => previous.id === transaction.id,
      );

      const previousExecution =
        previousTransaction?.metamaskPay?.solanaExecution;

      const diagnostics = getSolanaPaySupportDiagnostics(
        getSolanaPayStatus(execution),
        execution,
        transaction.metamaskPay?.source,
      );

      const previousDiagnostics =
        previousExecution &&
        getSolanaPaySupportDiagnostics(
          getSolanaPayStatus(previousExecution),
          previousExecution,
          previousTransaction?.metamaskPay?.source,
        );

      if (!isSolanaPayLifecycleTransition(previousDiagnostics, diagnostics)) {
        continue;
      }

      this.messenger.publish('TransactionPayController:solanaPayLifecycle', {
        ...diagnostics,
        isRecovery: this.#recoveringSolanaPayTransactionIds.has(transaction.id),
      });
    }
  }

  #finalizeSolanaPayTransaction(
    transactionId: string,
    status: SolanaPayStatus,
  ): void {
    const transaction = getTransaction(transactionId, this.messenger);

    if (
      transaction?.status !== TransactionStatus.submitted ||
      !transaction.isExternalPublish
    ) {
      return;
    }

    const failure = getSolanaPayFailure(status);

    if (failure) {
      this.messenger.call(
        'TransactionController:failTransaction',
        transactionId,
        new Error(failure),
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
        note: 'Intent complete after Relay Solana completion',
      },
      (draft) => {
        draft.isIntentComplete = true;
      },
    );

    this.messenger.call(
      'TransactionController:confirmTransaction',
      transactionId,
    );
  }

  #requireSolanaExecution(transactionId: string): MetamaskPaySolanaExecution {
    const execution = getTransaction(transactionId, this.messenger)?.metamaskPay
      ?.solanaExecution;

    if (!execution) {
      throw new Error('TransactionPayController: Solana execution missing');
    }

    return execution;
  }

  #requirePolymarket(): PolymarketCallbacks {
    if (!this.#polymarket) {
      throw new Error('TransactionPayController: Polymarket callbacks missing');
    }
    return this.#polymarket;
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

      const isPaymentTokenUpdated = !isSamePaymentToken(
        current.paymentToken,
        originalPaymentToken,
      );

      const isPaymentTokenBalanceUpdated =
        current.paymentToken?.balanceRaw !== originalPaymentToken?.balanceRaw;

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
          /* oxlint-disable typescript/no-unnecessary-type-assertion */
          current as never,
          /* oxlint-enable typescript/no-unnecessary-type-assertion */
          this.messenger,
          this.#getBalance,
        );

        shouldUpdateQuotes = true;
      } else if (
        isPaymentTokenBalanceUpdated &&
        current.isMaxAmount &&
        !current.isPostQuote
      ) {
        // On max the source amount is the payment token balance, so a
        // refreshed balance must re-derive it, otherwise the amount stays at
        // whatever the balance was when the token was selected. Quotes are not
        // requested again here: the balance is refreshed by `updateQuotes`
        // itself, which reads the re-derived amounts before building requests.
        updateSourceAmounts(
          transactionId,
          /* oxlint-disable typescript/no-unnecessary-type-assertion */
          current as never,
          /* oxlint-enable typescript/no-unnecessary-type-assertion */
          this.messenger,
          this.#getBalance,
        );
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
    const evmPaymentToken =
      paymentToken && !isNonEvmPaymentToken(paymentToken)
        ? paymentToken
        : undefined;

    return getStrategyOrder(
      this.messenger,
      evmPaymentToken?.chainId,
      evmPaymentToken?.address,
      transaction.type,
      transactionData?.fiatPayment?.selectedPaymentMethodId,
    );
  }
}
