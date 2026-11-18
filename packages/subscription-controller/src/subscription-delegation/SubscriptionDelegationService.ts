import type {
  DelegationResponse,
  AuthenticatedUserStorageServiceCreateDelegationAction,
  AuthenticatedUserStorageServiceListDelegationsAction,
} from '@metamask/authenticated-user-storage';
import type {
  ChompApiServiceCreateIntentsAction,
  ChompApiServiceGetIntentsByAddressAction,
  ChompApiServiceVerifyDelegationAction,
} from '@metamask/chomp-api-service';
import type { DelegationControllerSignDelegationAction } from '@metamask/delegation-controller';
import { hashDelegation } from '@metamask/delegation-core';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { MoneyAccountBalanceServiceFetchBalanceWithFallbackAction } from '@metamask/money-account-balance-service';
import type { MoneyAccountUpgradeControllerForceUpgradeAccountAction } from '@metamask/money-account-upgrade-controller';
import {
  getMoneyAccountVaultConfig,
  MUSD_DECIMALS,
} from '@metamask/money-account-utils';
import type { AuthenticationController } from '@metamask/profile-sync-controller';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type {
  TransactionControllerTransactionConfirmedEvent,
  TransactionMeta,
} from '@metamask/transaction-controller';
import { add0x, Duration, hexToNumber, inMilliseconds } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  SubscriptionControllerErrorMessage,
  SubscriptionDelegationServiceErrorMessage,
} from '../constants.js';
import { createModuleLogger, projectLogger } from '../logger.js';
import type {
  SubscriptionControllerGetPricingAction,
  SubscriptionControllerGetSubscriptionsAction,
  SubscriptionControllerIsUserEligibleForTrialAction,
  SubscriptionControllerStartSubscriptionWithCryptoAction,
  SubscriptionControllerUpdatePaymentMethodAction,
} from '../SubscriptionController-method-action-types.js';
import type {
  SubscriptionControllerGetStateAction,
  SubscriptionControllerState,
  SubscriptionControllerStateChangeEvent,
} from '../SubscriptionController.js';
import {
  CRYPTO_AUTH_METHODS,
  CRYPTO_PAYMENT_ERRORS,
  INVOICE_PAYMENT_STATUSES,
  PAYMENT_TYPES,
  PRODUCT_TYPES,
  SUBSCRIPTION_STATUSES,
} from '../types.js';
import type {
  ProductPrice,
  ProductType,
  PricingCryptoPaymentMethod,
  RecurringInterval,
  Subscription,
  SubscriptionCryptoPaymentMethod,
  TokenPaymentInfo,
} from '../types.js';
import {
  assertPositiveInteger,
  calculatePeriodAmount,
  getDelegationStartDate,
  getPeriodDuration,
} from './amount.js';
import { buildUnsignedSubscriptionDelegation } from './caveats.js';
import {
  equalsIgnoreCase,
  makeMatchesSubscriptionDelegation,
  pickLatestMatchingSubscriptionDelegation,
} from './fingerprint.js';
import type { SubscriptionDelegationServiceMethodActions } from './SubscriptionDelegationService-method-action-types.js';
import {
  buildDelegationTypedData,
  decodeSubscriptionAuthority,
} from './typed-data.js';
import type {
  MoneyAccountBalanceCheckRequest,
  MoneyAccountBalanceCheckResult,
  PrepareSubscriptionDelegationRequest,
  PreparedSubscriptionPermission,
  PreparedSubscriptionDelegation,
  SignedSubscriptionDelegation,
  StartSubscriptionWithDelegationRequest,
  StartSubscriptionWithDelegationResult,
  SubscriptionDelegationEnforcers,
  UnsignedSubscriptionDelegation,
} from './types.js';
import { CASH_SUBSCRIPTION_DELEGATION_TYPE } from './types.js';

/**
 * The name of the {@link SubscriptionDelegationService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'SubscriptionDelegationService';

const MESSENGER_EXPOSED_METHODS = [
  'prepareDelegation',
  'checkMoneyAccountBalance',
  'startSubscriptionWithDelegation',
] as const;

const DELEGATION_FRAMEWORK_VERSION = '1.3.0';

/**
 * How long to wait before re-checking the Money Account balance of a stuck
 * subscription. Must stay above the `MoneyAccountBalanceService` RPC cache
 * stale time (1 minute by default) so each tick reads an uncached balance.
 */
const CHARGE_RETRY_INTERVAL = inMilliseconds(5, Duration.Minute);

const CHARGE_RETRY_TRANSACTION_TYPES: TransactionType[] = [
  TransactionType.moneyAccountDeposit,
  TransactionType.membershipSubscription,
];

const log = createModuleLogger(projectLogger, serviceName);

function selectMoneyAccountPlusSubscription(
  state: SubscriptionControllerState,
): Subscription | undefined {
  return state.subscriptions.find((subscription) =>
    subscription.products.some(
      (product) => product.name === PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
    ),
  );
}

function resolveEnforcers(chainId: Hex): SubscriptionDelegationEnforcers {
  const contracts =
    DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION]?.[hexToNumber(chainId)];

  if (
    !contracts?.ERC20PeriodTransferEnforcer ||
    !contracts.AllowedCalldataEnforcer
  ) {
    throw new Error(
      `${SubscriptionDelegationServiceErrorMessage.DelegationContractsNotFound}: ${chainId}`,
    );
  }

  return {
    erc20TokenPeriodTransfer: contracts.ERC20PeriodTransferEnforcer,
    allowedCalldata: contracts.AllowedCalldataEnforcer,
  };
}

/**
 * Returns whether a crypto subscription is stuck on a charge that a funded
 * Money Account can unblock with a credential-less `updatePaymentMethod`.
 *
 * Mirrors the Subscription API retry rules. Failed invoices only qualify when
 * the failure was `insufficient_balance`; other failures cannot be fixed by a
 * deposit, and retrying them would re-queue the same failing collection.
 *
 * @param subscription - The subscription to check.
 * @returns Whether the charge can be retried.
 */
export function isSubscriptionChargeRetryable(
  subscription: Subscription,
): subscription is Subscription & {
  paymentMethod: SubscriptionCryptoPaymentMethod;
} {
  const { paymentMethod, lastInvoice, status } = subscription;
  if (
    paymentMethod.type !== PAYMENT_TYPES.byCrypto ||
    subscription.cancelAtPeriodEnd
  ) {
    return false;
  }
  if (status === SUBSCRIPTION_STATUSES.paused) {
    return true;
  }
  const isBalanceFailure =
    lastInvoice?.status === INVOICE_PAYMENT_STATUSES.FAILED &&
    lastInvoice.errorCode === CRYPTO_PAYMENT_ERRORS.INSUFFICIENT_BALANCE;
  return (
    isBalanceFailure &&
    (status === SUBSCRIPTION_STATUSES.pastDue ||
      (status === SUBSCRIPTION_STATUSES.active &&
        Boolean(paymentMethod.crypto.error)))
  );
}

function isChargeRetryTransaction(transactionMeta: TransactionMeta): boolean {
  return (
    transactionMeta.status === TransactionStatus.confirmed &&
    transactionMeta.type !== undefined &&
    CHARGE_RETRY_TRANSACTION_TYPES.includes(transactionMeta.type)
  );
}

function removeDelegationSignature(
  delegation: SignedSubscriptionDelegation,
): UnsignedSubscriptionDelegation {
  const { signature: _signature, ...unsignedDelegation } = delegation;
  return unsignedDelegation;
}

/**
 * Actions that {@link SubscriptionDelegationService} exposes to other consumers.
 */
export type SubscriptionDelegationServiceActions =
  SubscriptionDelegationServiceMethodActions;

/**
 * Actions from other messengers that {@link SubscriptionDelegationServiceMessenger} calls.
 */
type AllowedActions =
  | AuthenticatedUserStorageServiceListDelegationsAction
  | AuthenticatedUserStorageServiceCreateDelegationAction
  | AuthenticationController.AuthenticationControllerIsSignedInAction
  | ChompApiServiceVerifyDelegationAction
  | ChompApiServiceCreateIntentsAction
  | ChompApiServiceGetIntentsByAddressAction
  | DelegationControllerSignDelegationAction
  | KeyringControllerGetStateAction
  | MoneyAccountUpgradeControllerForceUpgradeAccountAction
  | MoneyAccountBalanceServiceFetchBalanceWithFallbackAction
  | RemoteFeatureFlagControllerGetStateAction
  | SubscriptionControllerGetStateAction
  | SubscriptionControllerGetPricingAction
  | SubscriptionControllerGetSubscriptionsAction
  | SubscriptionControllerIsUserEligibleForTrialAction
  | SubscriptionControllerStartSubscriptionWithCryptoAction
  | SubscriptionControllerUpdatePaymentMethodAction;

/**
 * Events that {@link SubscriptionDelegationService} exposes to other consumers.
 */
export type SubscriptionDelegationServiceEvents = never;

/**
 * Events from other messengers that {@link SubscriptionDelegationService}
 * subscribes to.
 */
type AllowedEvents =
  | KeyringControllerUnlockEvent
  | SubscriptionControllerStateChangeEvent
  | TransactionControllerTransactionConfirmedEvent;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link SubscriptionDelegationService}.
 */
export type SubscriptionDelegationServiceMessenger = Messenger<
  typeof serviceName,
  SubscriptionDelegationServiceActions | AllowedActions,
  SubscriptionDelegationServiceEvents | AllowedEvents
>;

/**
 * Options for constructing {@link SubscriptionDelegationService}.
 */
export type SubscriptionDelegationServiceOptions = {
  messenger: SubscriptionDelegationServiceMessenger;
};

type SubscriptionIntentParams = {
  account: Hex;
  chainId: Hex;
  delegationHash: Hex;
  allowance: Hex;
  tokenSymbol: string;
  tokenAddress: Hex;
};

type ResolvedSubscriptionDelegationConfig = {
  chainId: Hex;
  delegateAddress: Hex;
  delegationManager: Hex;
  paymentAddress: Hex;
  enforcers: SubscriptionDelegationEnforcers;
  price: ProductPrice;
  token: TokenPaymentInfo;
};

/**
 * Stateless orchestrator for cash-subscription delegation setup.
 *
 * Owns the workflow: size periodic caveats → sign → CHOMP verify → persist to
 * Authenticated User Storage → register CHOMP intent. Returns a verified
 * `delegationHash` for `SubscriptionController.startSubscriptionWithCrypto`.
 *
 * Pass `skipChompInteractions: true` to skip CHOMP verify and intent
 * registration and return a locally computed delegation hash.
 *
 * Each call resolves the Money Account chain from remote feature flags, then
 * resolves its price, payment token, and delegate from `SubscriptionController`
 * pricing. The pricing `delegateAddress` is used as the delegation `delegate`.
 *
 * Does not own subscription state; `SubscriptionController` does not depend on
 * this service. Only Money Account Plus is supported.
 *
 * Also retries a stuck Money Account Plus charge (see
 * {@link isSubscriptionChargeRetryable}) once the Money Account covers it. It
 * re-checks after a confirmed Money deposit, on unlock, when the cached Plus
 * subscription changes, and periodically while the balance stays short.
 */
export class SubscriptionDelegationService {
  readonly name: typeof serviceName = serviceName;

  readonly #messenger: SubscriptionDelegationServiceMessenger;

  #chargeRetryInFlight: Promise<void> | undefined;

  #isChargeRetryPending = false;

  #chargeRetryTimer: ReturnType<typeof setTimeout> | undefined;

  #isDestroyed = false;

  constructor(options: SubscriptionDelegationServiceOptions) {
    this.#messenger = options.messenger;

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    this.#messenger.subscribe(
      'TransactionController:transactionConfirmed',
      (transactionMeta) => {
        if (isChargeRetryTransaction(transactionMeta)) {
          this.#requestChargeRetry();
        }
      },
    );
    this.#messenger.subscribe('KeyringController:unlock', () =>
      this.#requestChargeRetry(),
    );
    this.#messenger.subscribe(
      'SubscriptionController:stateChange',
      () => this.#requestChargeRetry(),
      selectMoneyAccountPlusSubscription,
    );
  }

  /**
   * Stops the periodic charge retry. A retry still in flight finishes but
   * does not schedule another one.
   */
  destroy(): void {
    this.#isDestroyed = true;
    clearTimeout(this.#chargeRetryTimer);
  }

  /**
   * Runs the charge reconcile, or queues one more run if a retry is already in
   * flight. Never throws.
   */
  #requestChargeRetry(): void {
    if (this.#chargeRetryInFlight) {
      this.#isChargeRetryPending = true;
      return;
    }
    this.#chargeRetryInFlight = this.#reconcileSubscriptionCharge()
      .catch((error: unknown) => log('Subscription charge retry failed', error))
      .finally(() => {
        this.#chargeRetryInFlight = undefined;
        if (this.#isChargeRetryPending) {
          this.#isChargeRetryPending = false;
          this.#requestChargeRetry();
        }
      });
  }

  /**
   * Sends a credential-less `updatePaymentMethod` for a stuck Money Account
   * Plus subscription once the Money Account covers the charge. Re-checks on a
   * timer while the balance is short; never after a charge was sent.
   */
  async #reconcileSubscriptionCharge(): Promise<void> {
    clearTimeout(this.#chargeRetryTimer);
    this.#chargeRetryTimer = undefined;

    if (
      this.#isDestroyed ||
      !this.#messenger.call('KeyringController:getState').isUnlocked ||
      !this.#messenger.call('AuthenticationController:isSignedIn')
    ) {
      return;
    }
    const subscription = selectMoneyAccountPlusSubscription(
      this.#messenger.call('SubscriptionController:getState'),
    );
    if (
      !subscription ||
      !isSubscriptionChargeRetryable(subscription) ||
      subscription.billingCycles === undefined
    ) {
      return;
    }

    const { payerAddress, chainId, tokenSymbol } =
      subscription.paymentMethod.crypto;
    let hasSufficientBalance = false;
    try {
      const { price } = await this.#resolveConfiguration(
        PRODUCT_TYPES.MONEY_ACCOUNT_PLUS,
        subscription.interval,
      );
      ({ hasSufficientBalance } = await this.#compareMoneyAccountBalance(
        payerAddress,
        price,
      ));
    } catch (error) {
      log('Failed to check Money Account balance for charge retry', error);
    }
    if (!hasSufficientBalance) {
      if (!this.#isDestroyed) {
        this.#chargeRetryTimer = setTimeout(
          () => this.#requestChargeRetry(),
          CHARGE_RETRY_INTERVAL,
        );
      }
      return;
    }

    try {
      await this.#messenger.call('SubscriptionController:updatePaymentMethod', {
        paymentType: PAYMENT_TYPES.byCrypto,
        subscriptionId: subscription.id,
        chainId,
        payerAddress,
        tokenSymbol,
        recurringInterval: subscription.interval,
        billingCycles: subscription.billingCycles,
      });
    } catch (error) {
      log('Failed to retry subscription charge', error);
      await this.#messenger
        .call('SubscriptionController:getSubscriptions')
        .catch((refreshError: unknown) =>
          log(
            'Failed to refresh subscriptions after charge retry',
            refreshError,
          ),
        );
    }
  }

  /**
   * Checks whether the Money Account holds enough convertible mUSD value to
   * cover pricing `unitAmount × minBillingCyclesForBalance`.
   *
   * @param request - Payer address and pricing amount fields.
   * @returns Balance comparison in mUSD base units (6 decimals).
   */
  async checkMoneyAccountBalance(
    request: MoneyAccountBalanceCheckRequest,
  ): Promise<MoneyAccountBalanceCheckResult> {
    const { price } = await this.#resolveConfiguration(
      request.product,
      request.recurringInterval,
    );
    return this.#compareMoneyAccountBalance(request.payerAddress, price);
  }

  async #compareMoneyAccountBalance(
    payerAddress: Hex,
    price: ProductPrice,
  ): Promise<MoneyAccountBalanceCheckResult> {
    assertPositiveInteger(
      price.minBillingCyclesForBalance,
      SubscriptionDelegationServiceErrorMessage.InvalidMinimumFundingCycles,
    );

    const periodAmount = calculatePeriodAmount({
      unitAmount: price.unitAmount,
      unitDecimals: price.unitDecimals,
      tokenDecimals: MUSD_DECIMALS,
    });
    const requiredBalance =
      periodAmount * BigInt(price.minBillingCyclesForBalance);

    const { totalBalance } = await this.#messenger.call(
      'MoneyAccountBalanceService:fetchBalanceWithFallback',
      payerAddress,
    );

    return {
      hasSufficientBalance: BigInt(totalBalance) >= requiredBalance,
      balance: totalBalance,
      requiredBalance: requiredBalance.toString(),
    };
  }

  /**
   * Runs the complete Money Account subscription checkout authorization flow.
   *
   * Subscriptions are refreshed first. An active subscription for the product
   * is rejected before Money Account upgrade, delegation signing, persistence,
   * or CHOMP registration.
   *
   * The caller must obtain user consent and initiate funding before calling.
   * `MoneyAccountUpgradeController` ensures the Money Account vault
   * delegations and CHOMP intents exist. The Subscription API validates those
   * delegations and the Money Account balance server-side. No payment
   * delegation signing, persistence, or intent mutation occurs before the
   * account is upgraded.
   *
   * @param request - Product selection and Money Account identity.
   * @returns The result from `SubscriptionController:startSubscriptionWithCrypto`.
   */
  async startSubscriptionWithDelegation(
    request: StartSubscriptionWithDelegationRequest,
  ): Promise<StartSubscriptionWithDelegationResult> {
    if (request.product !== PRODUCT_TYPES.MONEY_ACCOUNT_PLUS) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.UnsupportedProduct,
      );
    }

    const config = await this.#resolveConfiguration(
      request.product,
      request.recurringInterval,
    );
    if (!equalsIgnoreCase(request.chainId, config.chainId)) {
      throw new Error(SubscriptionDelegationServiceErrorMessage.ChainMismatch);
    }
    const subscriptions = await this.#messenger.call(
      'SubscriptionController:getSubscriptions',
    );
    this.#assertUserNotSubscribed(subscriptions, request.product);
    const isEligibleForTrial = await this.#messenger.call(
      'SubscriptionController:isUserEligibleForTrial',
      request.product,
    );
    const isTrialRequested =
      config.price.trialPeriodDays > 0 && isEligibleForTrial;

    await this.#messenger.call(
      'MoneyAccountUpgradeController:forceUpgradeAccount',
      request.payerAddress,
    );

    const paymentPermission = await this.#preparePaymentPermission(
      request,
      config,
      isTrialRequested,
    );
    const paymentDelegation = await this.#signPaymentPermissionIfRequired(
      paymentPermission,
      config,
    );
    const paymentDelegationHash = await this.#commitPaymentPermission({
      request,
      paymentPermission,
      paymentDelegation,
      config,
    });
    return await this.#messenger.call(
      'SubscriptionController:startSubscriptionWithCrypto',
      {
        products: [request.product],
        isTrialRequested,
        recurringInterval: request.recurringInterval,
        billingCycles: config.price.minBillingCycles,
        chainId: request.chainId,
        payerAddress: request.payerAddress,
        tokenSymbol: config.token.symbol,
        cryptoAuthMethod: CRYPTO_AUTH_METHODS.DELEGATION,
        delegationHash: paymentDelegationHash,
        // Reject if eligibility changed during checkout, because the signed
        // delegation start date was derived from the original trial state.
        // This local guard is removed before the backend request.
        assertTrialEligibility: true,
      },
    );
  }

  /**
   * Rejects when the refreshed list already contains an active subscription
   * for the product. Active includes `active`, `trialing`, and `provisional`.
   *
   * @param subscriptions - Subscriptions returned by the latest refresh.
   * @param product - Product the caller is trying to start.
   */
  #assertUserNotSubscribed(
    subscriptions: Subscription[],
    product: ProductType,
  ): void {
    const alreadySubscribed = subscriptions.some(
      (subscription) =>
        ACTIVE_SUBSCRIPTION_STATUSES.includes(subscription.status) &&
        subscription.products.some((entry) => entry.name === product),
    );
    if (alreadySubscribed) {
      throw new Error(SubscriptionControllerErrorMessage.UserAlreadySubscribed);
    }
  }

  async #preparePaymentPermission(
    request: StartSubscriptionWithDelegationRequest,
    config: ResolvedSubscriptionDelegationConfig,
    isTrialRequested: boolean,
  ): Promise<PreparedSubscriptionPermission> {
    const periodAmount = calculatePeriodAmount({
      unitAmount: config.price.unitAmount,
      unitDecimals: config.price.unitDecimals,
      tokenDecimals: config.token.decimals,
    });
    const periodDuration = getPeriodDuration(request.recurringInterval);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const startDate = getDelegationStartDate({
      nowSeconds,
      trialPeriodDays: isTrialRequested
        ? config.price.trialPeriodDays
        : undefined,
    });
    const matches = makeMatchesSubscriptionDelegation({
      delegatorAddress: request.payerAddress,
      delegateAddress: config.delegateAddress,
      chainId: request.chainId,
      recipientAddress: config.paymentAddress,
      tokenAddress: config.token.address,
      periodAmount,
      periodDuration,
      nowSeconds,
      expectedStartDate: startDate,
      enforcers: config.enforcers,
    });
    const reusable = pickLatestMatchingSubscriptionDelegation(
      (
        await this.#messenger.call(
          'AuthenticatedUserStorageService:listDelegations',
        )
      ).filter(matches),
      config.enforcers,
    );
    const delegation = reusable
      ? removeDelegationSignature(reusable.signedDelegation)
      : buildUnsignedSubscriptionDelegation({
          delegateAddress: config.delegateAddress,
          delegatorAddress: request.payerAddress,
          enforcers: config.enforcers,
          recipientAddress: config.paymentAddress,
          tokenAddress: config.token.address,
          periodAmount,
          periodDuration,
          startDate,
        });
    const typedData = buildDelegationTypedData({
      delegation,
      chainId: request.chainId,
      delegationManager: config.delegationManager,
    });

    return {
      id: CASH_SUBSCRIPTION_DELEGATION_TYPE,
      owner: 'subscription',
      disposition: reusable ? 'reused' : 'new',
      delegation,
      typedData,
      decodedAuthority: decodeSubscriptionAuthority(
        delegation,
        config.enforcers,
      ),
      ...(reusable
        ? { existingDelegationHash: reusable.metadata.delegationHash }
        : {}),
    };
  }

  async #signPaymentPermissionIfRequired(
    permission: PreparedSubscriptionPermission,
    config: ResolvedSubscriptionDelegationConfig,
  ): Promise<SignedSubscriptionDelegation | undefined> {
    if (permission.disposition === 'reused') {
      return undefined;
    }
    const signature = (await this.#messenger.call(
      'DelegationController:signDelegation',
      {
        delegation: permission.delegation,
        chainId: config.chainId,
      },
    )) as Hex;
    return { ...permission.delegation, signature };
  }

  async #commitPaymentPermission({
    request,
    paymentPermission,
    paymentDelegation,
    config,
  }: {
    request: StartSubscriptionWithDelegationRequest;
    paymentPermission: PreparedSubscriptionPermission;
    paymentDelegation?: SignedSubscriptionDelegation;
    config: ResolvedSubscriptionDelegationConfig;
  }): Promise<Hex> {
    if (paymentPermission.disposition === 'reused') {
      const delegationHash = paymentPermission.existingDelegationHash as Hex;
      const storedDelegation = (
        await this.#messenger.call(
          'AuthenticatedUserStorageService:listDelegations',
        )
      ).find(({ metadata }) =>
        equalsIgnoreCase(metadata.delegationHash, delegationHash),
      );
      if (!storedDelegation) {
        throw new Error(
          SubscriptionDelegationServiceErrorMessage.ReusableDelegationInvalid,
        );
      }
      await this.#verifySignedPaymentDelegation(
        storedDelegation.signedDelegation,
        delegationHash,
        request.chainId,
      );
      await this.#ensureIntent({
        account: request.payerAddress,
        chainId: request.chainId,
        delegationHash,
        allowance: add0x(
          BigInt(paymentPermission.decodedAuthority.periodAmount).toString(16),
        ),
        tokenSymbol: config.token.symbol,
        tokenAddress: config.token.address,
      });
      await this.#assertIntentActive(request.payerAddress, delegationHash);
      return delegationHash;
    }

    const signedDelegation = paymentDelegation as SignedSubscriptionDelegation;
    const delegationHash = hashDelegation({
      ...signedDelegation,
      salt: BigInt(signedDelegation.salt),
    });
    await this.#verifySignedPaymentDelegation(
      signedDelegation,
      delegationHash,
      request.chainId,
    );

    const allowance = add0x(
      BigInt(paymentPermission.decodedAuthority.periodAmount).toString(16),
    );
    await this.#messenger.call(
      'AuthenticatedUserStorageService:createDelegation',
      {
        signedDelegation,
        metadata: {
          delegationHash,
          chainIdHex: request.chainId,
          allowance,
          tokenSymbol: config.token.symbol,
          tokenAddress: config.token.address,
          type: CASH_SUBSCRIPTION_DELEGATION_TYPE,
        },
      },
    );
    await this.#createIntent({
      account: request.payerAddress,
      chainId: request.chainId,
      delegationHash,
      allowance,
      tokenSymbol: config.token.symbol,
      tokenAddress: config.token.address,
    });
    await this.#assertIntentActive(request.payerAddress, delegationHash);
    return delegationHash;
  }

  async #assertIntentActive(account: Hex, delegationHash: Hex): Promise<void> {
    const intents = await this.#messenger.call(
      'ChompApiService:getIntentsByAddress',
      account,
    );
    const intent = intents.find((candidate) =>
      equalsIgnoreCase(candidate.delegationHash, delegationHash),
    );
    if (intent?.status !== 'active') {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.ChompIntentNotActive,
      );
    }
  }

  async #verifySignedPaymentDelegation(
    signedDelegation: SignedSubscriptionDelegation,
    expectedDelegationHash: Hex,
    chainId: Hex,
  ): Promise<void> {
    const localHash = hashDelegation({
      ...signedDelegation,
      salt: BigInt(signedDelegation.salt),
    });
    if (!equalsIgnoreCase(localHash, expectedDelegationHash)) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.ReusableDelegationInvalid,
      );
    }

    const verifyResult = await this.#messenger.call(
      'ChompApiService:verifyDelegation',
      { signedDelegation, chainId },
    );
    if (!verifyResult.valid) {
      throw new Error(
        `${SubscriptionDelegationServiceErrorMessage.ChompRejectedDelegation}: ${
          verifyResult.errors?.join(', ') ?? 'unknown error'
        }`,
      );
    }
    if (!verifyResult.delegationHash) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.ChompMissingDelegationHash,
      );
    }
    if (
      !equalsIgnoreCase(verifyResult.delegationHash, expectedDelegationHash)
    ) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.ChompDelegationHashMismatch,
      );
    }
  }

  /**
   * Prepares a cash-subscription delegation and returns its hash.
   *
   * Reuses a stored AUS delegation that matches the semantic fingerprint when
   * one exists (ensuring a CHOMP intent is active for its hash, unless
   * `skipChompInteractions` is true). Reuse classifies period `startDate` as
   * trial-deferred (`> now`) vs immediately redeemable, matching creation.
   * When several records match, the latest period `startDate` is reused
   * so a `forceNew` replacement is preferred over an older equivalent
   * permission.
   * If there is no match, builds, signs, optionally verifies with CHOMP,
   * persists, and optionally registers a new delegation.
   *
   * When `skipChompInteractions` is true, CHOMP verify and intent calls are
   * skipped; the returned hash is computed locally.
   *
   * @param request - Authoritative pricing and payer details for the delegation.
   * @param forceNew - Whether to create a replacement instead of reusing a
   * matching stored delegation.
   * @returns The delegation hash (CHOMP-verified unless skipped) and whether it
   * was created or reused.
   */
  async prepareDelegation(
    request: PrepareSubscriptionDelegationRequest,
    forceNew = false,
  ): Promise<PreparedSubscriptionDelegation> {
    if (request.product !== PRODUCT_TYPES.MONEY_ACCOUNT_PLUS) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.UnsupportedProduct,
      );
    }

    const skipChomp = Boolean(request.skipChompInteractions);

    const {
      chainId,
      delegateAddress,
      paymentAddress,
      enforcers,
      price,
      token,
    } = await this.#resolveConfiguration(
      request.product,
      request.recurringInterval,
    );

    if (request.checkBalance) {
      const { hasSufficientBalance } = await this.#compareMoneyAccountBalance(
        request.payerAddress,
        price,
      );
      if (!hasSufficientBalance) {
        throw new Error(
          SubscriptionDelegationServiceErrorMessage.InsufficientBalance,
        );
      }
    }

    const periodAmount = calculatePeriodAmount({
      unitAmount: price.unitAmount,
      unitDecimals: price.unitDecimals,
      tokenDecimals: token.decimals,
    });
    const periodDuration = getPeriodDuration(request.recurringInterval);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const startDate = getDelegationStartDate({
      nowSeconds,
      trialPeriodDays: request.isTrialRequested
        ? price.trialPeriodDays
        : undefined,
    });

    const reusable = forceNew
      ? undefined
      : await this.#findReusableDelegation({
          request,
          chainId,
          delegateAddress,
          paymentAddress,
          tokenAddress: token.address,
          periodAmount,
          periodDuration,
          nowSeconds,
          expectedStartDate: startDate,
          enforcers,
        });
    if (reusable) {
      if (!skipChomp) {
        await this.#ensureIntent({
          account: request.payerAddress,
          chainId,
          delegationHash: reusable.metadata.delegationHash,
          allowance: reusable.metadata.allowance,
          tokenSymbol: reusable.metadata.tokenSymbol,
          tokenAddress: reusable.metadata.tokenAddress,
        });
      }
      return {
        delegationHash: reusable.metadata.delegationHash,
        disposition: 'reused',
      };
    }

    const unsigned = buildUnsignedSubscriptionDelegation({
      delegateAddress,
      delegatorAddress: request.payerAddress,
      recipientAddress: paymentAddress,
      enforcers,
      tokenAddress: token.address,
      periodAmount,
      periodDuration,
      startDate,
    });

    const signature = (await this.#messenger.call(
      'DelegationController:signDelegation',
      { delegation: unsigned, chainId },
    )) as Hex;

    const signedDelegation = { ...unsigned, signature };

    const delegationHash = hashDelegation({
      ...unsigned,
      salt: BigInt(unsigned.salt),
      signature,
    });

    if (!skipChomp) {
      const verifyResult = await this.#messenger.call(
        'ChompApiService:verifyDelegation',
        {
          signedDelegation,
          chainId,
        },
      );

      if (!verifyResult.valid) {
        throw new Error(
          `${SubscriptionDelegationServiceErrorMessage.ChompRejectedDelegation}: ${
            verifyResult.errors?.join(', ') ?? 'unknown error'
          }`,
        );
      }

      if (!verifyResult.delegationHash) {
        throw new Error(
          SubscriptionDelegationServiceErrorMessage.ChompMissingDelegationHash,
        );
      }
      if (!equalsIgnoreCase(verifyResult.delegationHash, delegationHash)) {
        throw new Error(
          SubscriptionDelegationServiceErrorMessage.ChompDelegationHashMismatch,
        );
      }
    }

    const allowance: Hex = add0x(periodAmount.toString(16));

    await this.#messenger.call(
      'AuthenticatedUserStorageService:createDelegation',
      {
        signedDelegation,
        metadata: {
          delegationHash,
          chainIdHex: chainId,
          allowance,
          tokenSymbol: token.symbol,
          tokenAddress: token.address,
          type: CASH_SUBSCRIPTION_DELEGATION_TYPE,
        },
      },
    );

    if (!skipChomp) {
      await this.#createIntent({
        account: request.payerAddress,
        chainId,
        delegationHash,
        allowance,
        tokenSymbol: token.symbol,
        tokenAddress: token.address,
      });
    }

    return {
      delegationHash,
      disposition: 'created',
    };
  }

  async #findReusableDelegation({
    request,
    chainId,
    delegateAddress,
    paymentAddress,
    tokenAddress,
    periodAmount,
    periodDuration,
    nowSeconds,
    expectedStartDate,
    enforcers,
  }: {
    request: PrepareSubscriptionDelegationRequest;
    chainId: Hex;
    delegateAddress: Hex;
    paymentAddress: Hex;
    tokenAddress: Hex;
    periodAmount: bigint;
    periodDuration: number;
    nowSeconds: number;
    expectedStartDate: number;
    enforcers: SubscriptionDelegationEnforcers;
  }): Promise<DelegationResponse | undefined> {
    const matches = makeMatchesSubscriptionDelegation({
      delegatorAddress: request.payerAddress,
      delegateAddress,
      recipientAddress: paymentAddress,
      chainId,
      tokenAddress,
      periodAmount,
      periodDuration,
      nowSeconds,
      expectedStartDate,
      enforcers,
    });

    const existingDelegations = await this.#messenger.call(
      'AuthenticatedUserStorageService:listDelegations',
    );

    return pickLatestMatchingSubscriptionDelegation(
      existingDelegations.filter(matches),
      enforcers,
    );
  }

  async #resolveConfiguration(
    product: ProductType,
    recurringInterval: RecurringInterval,
  ): Promise<ResolvedSubscriptionDelegationConfig> {
    const { remoteFeatureFlags } = this.#messenger.call(
      'RemoteFeatureFlagController:getState',
    );
    const vaultConfig = getMoneyAccountVaultConfig(remoteFeatureFlags);
    if (!vaultConfig) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.MissingMoneyAccountVaultConfig,
      );
    }

    const { chainId } = vaultConfig;
    const enforcers = resolveEnforcers(chainId);
    const pricing = await this.#messenger.call(
      'SubscriptionController:getPricing',
    );
    const price = pricing.products
      .find((entry) => entry.name === product)
      ?.prices?.find((entry) => entry.interval === recurringInterval);
    const paymentMethod = pricing.paymentMethods.find(
      (entry): entry is PricingCryptoPaymentMethod =>
        entry.type === PAYMENT_TYPES.byCrypto &&
        entry.cryptoAuthMethod === CRYPTO_AUTH_METHODS.DELEGATION &&
        entry.products?.includes(product) === true,
    );
    const chain = paymentMethod?.chains?.find(
      (entry) => entry.chainId === chainId,
    );
    const token = chain?.tokens[0];
    if (!price || !chain?.delegateAddress || !token) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.PricingConfigurationNotFound,
      );
    }

    return {
      chainId,
      delegateAddress: chain.delegateAddress,
      delegationManager:
        DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION][hexToNumber(chainId)]
          .DelegationManager,
      paymentAddress: chain.paymentAddress,
      enforcers,
      price,
      token,
    };
  }

  /**
   * Ensures an active CHOMP intent exists for the given delegation hash,
   * registering one when missing or revoked.
   *
   * @param params - Intent identity and metadata.
   * @param params.account - Delegator / payer address.
   * @param params.chainId - Chain ID of the delegation.
   * @param params.delegationHash - Hash of the stored delegation.
   * @param params.allowance - Period allowance stored with the delegation.
   * @param params.tokenSymbol - Payment token symbol.
   * @param params.tokenAddress - Payment token address.
   */
  async #ensureIntent(params: SubscriptionIntentParams): Promise<void> {
    const existingIntents = await this.#messenger.call(
      'ChompApiService:getIntentsByAddress',
      params.account,
    );

    const hasActiveIntent = existingIntents.some(
      (intent) =>
        equalsIgnoreCase(intent.delegationHash, params.delegationHash) &&
        intent.status === 'active',
    );

    if (hasActiveIntent) {
      return;
    }

    await this.#createIntent(params);
  }

  async #createIntent(params: SubscriptionIntentParams): Promise<void> {
    await this.#messenger.call('ChompApiService:createIntents', [
      {
        account: params.account,
        delegationHash: params.delegationHash,
        chainId: params.chainId,
        metadata: {
          allowance: params.allowance,
          tokenSymbol: params.tokenSymbol,
          tokenAddress: params.tokenAddress,
          type: CASH_SUBSCRIPTION_DELEGATION_TYPE,
        },
      },
    ]);
  }
}
