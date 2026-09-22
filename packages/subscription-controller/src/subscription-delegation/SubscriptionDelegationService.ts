import type {
  AddResult,
  ApprovalControllerAddRequestAction,
} from '@metamask/approval-controller';
import type {
  AuthenticatedUserStorageServiceCreateDelegationAction,
  AuthenticatedUserStorageServiceListDelegationsAction,
} from '@metamask/authenticated-user-storage';
import type {
  ChompApiServiceCreateIntentsAction,
  ChompApiServiceGetIntentsByAddressAction,
  ChompApiServiceVerifyDelegationAction,
} from '@metamask/chomp-api-service';
import { ORIGIN_METAMASK } from '@metamask/controller-utils';
import type { DelegationControllerSignDelegationAction } from '@metamask/delegation-controller';
import { hashDelegation } from '@metamask/delegation-core';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import type { Messenger } from '@metamask/messenger';
import type { MoneyAccountBalanceServiceFetchBalanceWithFallbackAction } from '@metamask/money-account-balance-service';
import {
  getMoneyAccountVaultConfig,
  MUSD_DECIMALS,
} from '@metamask/money-account-utils';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import { add0x, hexToNumber, isStrictHexString } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { SubscriptionDelegationServiceErrorMessage } from '../constants.js';
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
} from './fingerprint.js';
import type {
  MoneyAccountControllerEnsureDelegationsReadinessAction,
  MoneyAccountControllerGetDelegationsReadinessAction,
} from './money-account-contracts.js';
import type { SubscriptionDelegationServiceMethodActions } from './SubscriptionDelegationService-method-action-types.js';
import {
  buildDelegationTypedData,
  computeBundleFingerprint,
  decodeSubscriptionAuthority,
  hashTypedData,
} from './typed-data.js';
import type {
  MoneyAccountAuthorizationReason,
  MoneyAccountBalanceCheckRequest,
  MoneyAccountBalanceCheckResult,
  PrepareSubscriptionDelegationRequest,
  PreparedSubscriptionDelegationBundle,
  PreparedSubscriptionPermission,
  PreparedSubscriptionDelegation,
  SignedSubscriptionDelegation,
  StartSubscriptionWithDelegationRequest,
  StartSubscriptionWithDelegationResult,
  SubscriptionDelegationApprovalResult,
  SubscriptionDelegationEnforcers,
  SubscriptionPermissionId,
  UnsignedSubscriptionDelegation,
} from './types.js';
import {
  CASH_SUBSCRIPTION_DELEGATION_TYPE,
  SUBSCRIPTION_DELEGATION_APPROVAL_TYPE,
  SUBSCRIPTION_DELEGATION_POLICY_VERSION,
} from './types.js';

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
const MONEY_ACCOUNT_PERMISSION_ORDER: readonly SubscriptionPermissionId[] = [
  'cash-deposit',
  'cash-withdrawal',
  'cash-deposit-premium',
  'cash-withdrawal-premium',
];

function resolveEnforcers(chainId: Hex): SubscriptionDelegationEnforcers {
  const contracts =
    DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION]?.[hexToNumber(chainId)];

  if (!contracts?.ValueLteEnforcer || !contracts.ERC20PeriodTransferEnforcer) {
    throw new Error(
      `${SubscriptionDelegationServiceErrorMessage.DelegationContractsNotFound}: ${chainId}`,
    );
  }

  return {
    valueLte: contracts.ValueLteEnforcer,
    erc20TokenPeriodTransfer: contracts.ERC20PeriodTransferEnforcer,
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
  | ApprovalControllerAddRequestAction
  | MoneyAccountControllerGetDelegationsReadinessAction
  | MoneyAccountControllerEnsureDelegationsReadinessAction
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
  enforcers: SubscriptionDelegationEnforcers;
  musdAddress?: Hex;
  price: ProductPrice;
  token: TokenPaymentInfo;
};

export class MoneyAccountAuthorizationRequiredError extends Error {
  readonly reasons: MoneyAccountAuthorizationReason[];

  constructor(reasons: MoneyAccountAuthorizationReason[]) {
    super(
      SubscriptionDelegationServiceErrorMessage.MoneyAccountAuthorizationRequired,
    );
    this.name = 'MoneyAccountAuthorizationRequiredError';
    this.reasons = reasons;
  }
}

/**
 * Stateless orchestrator for cash-subscription delegation setup.
 *
 * Owns the workflow: size periodic caveats → sign → CHOMP verify → persist to
 * Authenticated User Storage → register CHOMP intent. Returns a verified
 * `delegationHash` for `SubscriptionController.startSubscriptionWithCrypto`.
 *
 * Alpha callers must pass `skipChompInteractions: true` until a follow-up
 * `@metamask/chomp-api-service` release accepts `'cash-subscription'` intent
 * metadata. The CHOMP-enabled path (`skipChompInteractions` unset/false)
 * remains dormant and is not production-ready without that package support.
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
   * The custom approval is the sole consent and funding boundary. No
   * delegation signing, persistence, or intent mutation occurs before it
   * returns a matching bundle fingerprint and transaction hash.
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
    if (!config.musdAddress) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.MissingMusdTokenAddress,
      );
    }
    await this.#messenger.call('SubscriptionController:getSubscriptions');
    const { trialedProducts } = this.#messenger.call(
      'SubscriptionController:getState',
    );
    const isTrialRequested =
      config.price.trialPeriodDays > 0 &&
      !trialedProducts.includes(request.product);

    const readiness = await this.#messenger.call(
      'MoneyAccountController:getDelegationsReadiness',
    );
    if (readiness.status === 'money-account-authorization-required') {
      throw new MoneyAccountAuthorizationRequiredError(readiness.reasons);
    }

    const paymentPermission = await this.#preparePaymentPermission(
      request,
      config,
      isTrialRequested,
    );
    const permissions = [
      ...this.#sortPermissions(readiness.permissions),
      paymentPermission,
    ];
    const bundleWithoutFingerprint = {
      policyVersion: SUBSCRIPTION_DELEGATION_POLICY_VERSION,
      account: request.payerAddress,
      chainId: request.chainId,
      permissions,
    };
    const bundle: PreparedSubscriptionDelegationBundle = {
      ...bundleWithoutFingerprint,
      bundleFingerprint: computeBundleFingerprint(bundleWithoutFingerprint),
    };
    const targetAmount =
      calculatePeriodAmount({
        unitAmount: config.price.unitAmount,
        unitDecimals: config.price.unitDecimals,
        tokenDecimals: MUSD_DECIMALS,
      }) * BigInt(config.price.minBillingCyclesForBalance);

    const approval = (await this.#messenger.call(
      'ApprovalController:addRequest',
      {
        origin: ORIGIN_METAMASK,
        type: SUBSCRIPTION_DELEGATION_APPROVAL_TYPE,
        expectsResult: true,
        requestData: {
          bundle,
          funding: {
            useCase: 'subscription',
            destinationAccount: request.payerAddress,
            chainId: request.chainId,
            targetToken: {
              symbol: 'mUSD',
              address: config.musdAddress,
            },
            targetAmount: targetAmount.toString(),
          },
        },
      },
      true,
    )) as AddResult;

    try {
      this.#validateApprovalResult(approval, bundle);
      await this.#messenger.call(
        'MoneyAccountController:ensureDelegationsReadiness',
      );

      const paymentDelegation = await this.#signPaymentPermissionIfRequired(
        paymentPermission,
        config,
      );
      const paymentDelegationHash = await this.#commitPaymentPermission({
        request,
        approvedVaultPermissions: bundle.permissions.filter(
          ({ owner }) => owner === 'money-account',
        ),
        paymentPermission,
        paymentDelegation,
        config,
      });
      const result = await this.#messenger.call(
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
          // Reject if eligibility changed during approval, because the signed
          // delegation start date was derived from the original trial state.
          // This local guard is removed before the backend request.
          assertTrialEligibility: true,
        },
      );
      approval.resultCallbacks?.success();
      return result;
    } catch (error) {
      approval.resultCallbacks?.error(error as Error);
      throw error;
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
      tokenAddress: config.token.address,
      periodAmount,
      periodDuration,
      nowSeconds,
      isTrialDeferred: startDate > nowSeconds,
      enforcers: config.enforcers,
    });
    const reusable = (
      await this.#messenger.call(
        'AuthenticatedUserStorageService:listDelegations',
      )
    ).find(matches);
    const delegation = reusable
      ? removeDelegationSignature(reusable.signedDelegation)
      : buildUnsignedSubscriptionDelegation({
          delegateAddress: config.delegateAddress,
          delegatorAddress: request.payerAddress,
          enforcers: config.enforcers,
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
      typedDataHash: hashTypedData(typedData),
      decodedAuthority: decodeSubscriptionAuthority(
        delegation,
        config.enforcers,
      ),
      ...(reusable
        ? { existingDelegationHash: reusable.metadata.delegationHash }
        : {}),
    };
  }

  #sortPermissions(
    permissions: PreparedSubscriptionPermission[],
  ): PreparedSubscriptionPermission[] {
    return [...permissions].sort(
      (left, right) =>
        MONEY_ACCOUNT_PERMISSION_ORDER.indexOf(left.id) -
        MONEY_ACCOUNT_PERMISSION_ORDER.indexOf(right.id),
    );
  }

  #validateApprovalResult(
    approval: AddResult,
    bundle: PreparedSubscriptionDelegationBundle,
  ): SubscriptionDelegationApprovalResult {
    if (!approval?.value || typeof approval.value !== 'object') {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.ApprovalResultMissing,
      );
    }
    const value = approval.value as Record<string, unknown>;
    if (
      typeof value.bundleFingerprint !== 'string' ||
      !equalsIgnoreCase(value.bundleFingerprint, bundle.bundleFingerprint)
    ) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.ApprovalFingerprintMismatch,
      );
    }
    if (
      typeof value.fundingTransactionHash !== 'string' ||
      !isStrictHexString(value.fundingTransactionHash) ||
      value.fundingTransactionHash.length !== 66
    ) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.InvalidFundingTransactionHash,
      );
    }
    return {
      bundleFingerprint: value.bundleFingerprint as Hex,
      fundingTransactionHash: value.fundingTransactionHash,
    };
  }

  async #signPaymentPermissionIfRequired(
    permission: PreparedSubscriptionPermission,
    config: ResolvedSubscriptionDelegationConfig,
  ): Promise<SignedSubscriptionDelegation | undefined> {
    if (permission.disposition === 'reused') {
      return undefined;
    }
    const typedData = buildDelegationTypedData({
      delegation: permission.delegation,
      chainId: config.chainId,
      delegationManager: config.delegationManager,
    });
    if (!equalsIgnoreCase(hashTypedData(typedData), permission.typedDataHash)) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.TypedDataHashMismatch,
      );
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
    approvedVaultPermissions,
    paymentPermission,
    paymentDelegation,
    config,
  }: {
    request: StartSubscriptionWithDelegationRequest;
    approvedVaultPermissions: PreparedSubscriptionPermission[];
    paymentPermission: PreparedSubscriptionPermission;
    paymentDelegation?: SignedSubscriptionDelegation;
    config: ResolvedSubscriptionDelegationConfig;
  }): Promise<Hex> {
    const readiness = await this.#messenger.call(
      'MoneyAccountController:getDelegationsReadiness',
    );
    if (readiness.status !== 'ready') {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.MoneyAccountPermissionsNotActive,
      );
    }

    const currentVaultPermissions = readiness.permissions.filter(
      ({ owner }) => owner === 'money-account',
    );
    const vaultPermissionsMatch =
      currentVaultPermissions.length === approvedVaultPermissions.length &&
      approvedVaultPermissions.every((approved) =>
        currentVaultPermissions.some(
          (current) =>
            current.id === approved.id &&
            current.disposition === 'reused' &&
            equalsIgnoreCase(current.typedDataHash, approved.typedDataHash),
        ),
      );
    if (!vaultPermissionsMatch) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.MoneyAccountPermissionsNotActive,
      );
    }

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
   * If there is no match, builds, signs, optionally verifies with CHOMP,
   * persists, and optionally registers a new delegation.
   *
   * When `skipChompInteractions` is true (required for alpha), CHOMP verify
   * and intent calls are skipped; the returned hash is computed locally. The
   * default CHOMP-enabled path requires a follow-up chomp-api-service release
   * that accepts `'cash-subscription'` intent metadata.
   *
   * @param request - Authoritative pricing and payer details for the delegation.
   * @returns The delegation hash (CHOMP-verified unless skipped) and whether it
   * was created or reused.
   */
  async prepareDelegation(
    request: PrepareSubscriptionDelegationRequest,
  ): Promise<PreparedSubscriptionDelegation> {
    if (request.product !== PRODUCT_TYPES.MONEY_ACCOUNT_PLUS) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.UnsupportedProduct,
      );
    }

    const skipChomp = Boolean(request.skipChompInteractions);

    const { chainId, delegateAddress, enforcers, price, token } =
      await this.#resolveConfiguration(
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

    const matches = makeMatchesSubscriptionDelegation({
      delegatorAddress: request.payerAddress,
      delegateAddress,
      chainId,
      tokenAddress: token.address,
      periodAmount,
      periodDuration,
      nowSeconds,
      isTrialDeferred,
      enforcers,
    });

    const existingDelegations = await this.#messenger.call(
      'AuthenticatedUserStorageService:listDelegations',
    );
    const reusable = existingDelegations.find(matches);
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
      enforcers,
      musdAddress: vaultConfig.underlyingToken,
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
    // Published `@metamask/chomp-api-service` only types intent metadata as
    // `'cash-deposit' | 'cash-withdrawal'`. The dormant production path still
    // passes `'cash-subscription'`; a follow-up chomp-api-service release must
    // accept that discriminator before this path is production-ready. Alpha
    // callers must use `skipChompInteractions: true` so this method is not
    // reached.
    await this.#messenger.call('ChompApiService:createIntents', [
      {
        account: params.account,
        delegationHash: params.delegationHash,
        chainId: params.chainId,
        metadata: {
          allowance: params.allowance,
          tokenSymbol: params.tokenSymbol,
          tokenAddress: params.tokenAddress,
          type: CASH_SUBSCRIPTION_DELEGATION_TYPE as
            | 'cash-deposit'
            | 'cash-withdrawal',
        },
      },
    ]);
  }
}
