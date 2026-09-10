import type {
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
import {
  getMoneyAccountVaultConfig,
  MUSD_DECIMALS,
} from '@metamask/money-account-utils';
import type { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import { add0x, hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { SubscriptionDelegationServiceErrorMessage } from '../constants.js';
import type { SubscriptionControllerGetPricingAction } from '../SubscriptionController-method-action-types.js';
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
import type { SubscriptionDelegationServiceMethodActions } from './SubscriptionDelegationService-method-action-types.js';
import type {
  MoneyAccountBalanceCheckRequest,
  MoneyAccountBalanceCheckResult,
  PrepareSubscriptionDelegationRequest,
  PreparedSubscriptionDelegation,
  SubscriptionDelegationEnforcers,
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
] as const;

const DELEGATION_FRAMEWORK_VERSION = '1.3.0';

function resolveEnforcers(chainId: Hex): SubscriptionDelegationEnforcers {
  const contracts =
    DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION]?.[hexToNumber(chainId)];

  if (
    !contracts?.ValueLteEnforcer ||
    !contracts.ERC20PeriodTransferEnforcer ||
    !contracts.RedeemerEnforcer
  ) {
    throw new Error(
      `${SubscriptionDelegationServiceErrorMessage.DelegationContractsNotFound}: ${chainId}`,
    );
  }

  return {
    valueLte: contracts.ValueLteEnforcer,
    erc20TokenPeriodTransfer: contracts.ERC20PeriodTransferEnforcer,
    redeemer: contracts.RedeemerEnforcer,
  };
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
  | MoneyAccountBalanceServiceFetchBalanceWithFallbackAction
  | RemoteFeatureFlagControllerGetStateAction
  | SubscriptionControllerGetPricingAction;

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
 * Alpha callers must pass `skipChompInteractions: true` until a follow-up
 * `@metamask/chomp-api-service` release accepts `'cash-subscription'` intent
 * metadata. The CHOMP-enabled path (`skipChompInteractions` unset/false)
 * remains dormant and is not production-ready without that package support.
 *
 * Each call resolves the Money Account chain from remote feature flags, then
 * resolves its price, payment token, and delegate from `SubscriptionController`
 * pricing. The pricing `delegateAddress` is used as both the delegation
 * `delegate` and the RedeemerEnforcer redeemer.
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
   * Prepares a cash-subscription delegation and returns its hash.
   *
   * Reuses a stored AUS delegation that matches the semantic fingerprint when
   * one exists (ensuring a CHOMP intent is active for its hash, unless
   * `skipChompInteractions` is true). Otherwise builds, signs, optionally
   * verifies with CHOMP, persists, and optionally registers a new delegation.
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

    const matches = makeMatchesSubscriptionDelegation({
      delegatorAddress: request.payerAddress,
      delegateAddress,
      chainId,
      tokenAddress: token.address,
      periodAmount,
      periodDuration,
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

    const startDate = getDelegationStartDate({
      nowSeconds: Math.floor(Date.now() / 1000),
      trialPeriodDays: request.isTrialRequested
        ? price.trialPeriodDays
        : undefined,
    });
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
      ?.prices.find((entry) => entry.interval === recurringInterval);
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
