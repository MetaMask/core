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
import type { Messenger } from '@metamask/messenger';
import type { MoneyAccountBalanceServiceFetchBalanceWithFallbackAction } from '@metamask/money-account-balance-service';
import type { MoneyAccountUpgradeControllerForceUpgradeAccountAction } from '@metamask/money-account-upgrade-controller';
import {
  getMoneyAccountVaultConfig,
  MUSD_DECIMALS,
} from '@metamask/money-account-utils';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import { add0x, hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  SubscriptionControllerErrorMessage,
  SubscriptionDelegationServiceErrorMessage,
} from '../constants.js';
import type {
  SubscriptionControllerGetPricingAction,
  SubscriptionControllerGetSubscriptionsAction,
  SubscriptionControllerStartSubscriptionWithCryptoAction,
} from '../SubscriptionController-method-action-types.js';
import type { SubscriptionControllerGetStateAction } from '../SubscriptionController.js';
import { CRYPTO_AUTH_METHODS, PAYMENT_TYPES, PRODUCT_TYPES } from '../types.js';
import type {
  ProductPrice,
  ProductType,
  PricingCryptoPaymentMethod,
  RecurringInterval,
  Subscription,
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
  | ChompApiServiceVerifyDelegationAction
  | ChompApiServiceCreateIntentsAction
  | ChompApiServiceGetIntentsByAddressAction
  | DelegationControllerSignDelegationAction
  | MoneyAccountUpgradeControllerForceUpgradeAccountAction
  | MoneyAccountBalanceServiceFetchBalanceWithFallbackAction
  | RemoteFeatureFlagControllerGetStateAction
  | SubscriptionControllerGetStateAction
  | SubscriptionControllerGetPricingAction
  | SubscriptionControllerGetSubscriptionsAction
  | SubscriptionControllerStartSubscriptionWithCryptoAction;

/**
 * Events that {@link SubscriptionDelegationService} exposes to other consumers.
 */
export type SubscriptionDelegationServiceEvents = never;

type AllowedEvents = never;

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
 */
export class SubscriptionDelegationService {
  readonly name: typeof serviceName = serviceName;

  readonly #messenger: SubscriptionDelegationServiceMessenger;

  constructor(options: SubscriptionDelegationServiceOptions) {
    this.#messenger = options.messenger;

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
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
    const { trialedProducts } = this.#messenger.call(
      'SubscriptionController:getState',
    );
    const isTrialRequested =
      config.price.trialPeriodDays > 0 &&
      !trialedProducts.includes(request.product);

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
      isTrialDeferred: startDate > nowSeconds,
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
    const isTrialDeferred = startDate > nowSeconds;

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
          isTrialDeferred,
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
    isTrialDeferred,
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
    isTrialDeferred: boolean;
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
      isTrialDeferred,
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
