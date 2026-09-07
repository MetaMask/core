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
import { add0x, hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { SubscriptionDelegationServiceErrorMessage } from '../constants.js';
import { PRODUCT_TYPES } from '../types.js';
import type { SubscriptionDelegationServiceMethodActions } from './SubscriptionDelegationService-method-action-types.js';
import { calculatePeriodAmount, getPeriodDuration } from './amount.js';
import { buildUnsignedSubscriptionDelegation } from './caveats.js';
import {
  equalsIgnoreCase,
  makeMatchesSubscriptionDelegation,
} from './fingerprint.js';
import type {
  PrepareSubscriptionDelegationRequest,
  PreparedSubscriptionDelegation,
  SubscriptionDelegationConfig,
  SubscriptionDelegationEnforcers,
} from './types.js';
import { SUBSCRIPTION_PAYMENT_DELEGATION_TYPE } from './types.js';

/**
 * The name of the {@link SubscriptionDelegationService}, used to namespace the
 * service's actions and events.
 */
export const serviceName = 'SubscriptionDelegationService';

const MESSENGER_EXPOSED_METHODS = ['prepareDelegation'] as const;

const DELEGATION_FRAMEWORK_VERSION = '1.3.0';

function resolveEnforcers(chainId: Hex): SubscriptionDelegationEnforcers {
  const contracts =
    DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION]?.[hexToNumber(chainId)];

  if (
    !contracts?.ValueLteEnforcer ||
    !contracts.ERC20PeriodTransferEnforcer
  ) {
    throw new Error(
      `${SubscriptionDelegationServiceErrorMessage.DelegationContractsNotFound}: ${chainId}`,
    );
  }

  return {
    valueLte: contracts.ValueLteEnforcer,
    erc20TokenPeriodTransfer: contracts.ERC20PeriodTransferEnforcer,
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
  | DelegationControllerSignDelegationAction;

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
  /**
   * Immutable, chain-scoped CHOMP delegate configuration for Money Account
   * Plus subscription-payment delegations.
   */
  config: SubscriptionDelegationConfig;
};

type SubscriptionIntentParams = {
  account: Hex;
  chainId: Hex;
  delegationHash: Hex;
  allowance: Hex;
  tokenSymbol: string;
  tokenAddress: Hex;
};

/**
 * Stateless orchestrator for subscription-payment delegation setup.
 *
 * Owns the workflow: size periodic caveats → sign → CHOMP verify → persist to
 * Authenticated User Storage → register CHOMP intent. Returns a verified
 * `delegationHash` for `SubscriptionController.startSubscriptionWithCrypto`.
 *
 * The CHOMP delegate comes from constructor
 * {@link SubscriptionDelegationConfig}; Delegation Framework enforcers are
 * resolved from `@metamask/delegation-deployments` for the configured chain.
 *
 * Does not own subscription state; `SubscriptionController` does not depend on
 * this service. Only Money Account Plus is supported.
 */
export class SubscriptionDelegationService {
  readonly name: typeof serviceName = serviceName;

  readonly #messenger: SubscriptionDelegationServiceMessenger;

  readonly #config: SubscriptionDelegationConfig;

  readonly #enforcers: SubscriptionDelegationEnforcers;

  constructor(options: SubscriptionDelegationServiceOptions) {
    this.#messenger = options.messenger;
    this.#config = options.config;
    this.#enforcers = resolveEnforcers(this.#config.chainId);

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Prepares a subscription-payment delegation and returns its verified hash.
   *
   * Reuses a stored AUS delegation that matches the semantic fingerprint when
   * one exists (ensuring a CHOMP intent is active for its hash). Otherwise
   * builds, signs, verifies, persists, and registers a new delegation.
   *
   * @param request - Authoritative pricing and payer details for the delegation.
   * @returns The verified delegation hash and whether it was created or reused.
   */
  async prepareDelegation(
    request: PrepareSubscriptionDelegationRequest,
  ): Promise<PreparedSubscriptionDelegation> {
    if (request.product !== PRODUCT_TYPES.MONEY_ACCOUNT_PLUS) {
      throw new Error(
        SubscriptionDelegationServiceErrorMessage.UnsupportedProduct,
      );
    }

    if (!equalsIgnoreCase(request.chainId, this.#config.chainId)) {
      throw new Error(SubscriptionDelegationServiceErrorMessage.ChainIdMismatch);
    }

    const periodAmount = calculatePeriodAmount({
      unitAmount: request.unitAmount,
      unitDecimals: request.unitDecimals,
      tokenDecimals: request.tokenDecimals,
    });
    const periodDuration = getPeriodDuration(request.recurringInterval);

    const matches = makeMatchesSubscriptionDelegation({
      delegatorAddress: request.payerAddress,
      delegateAddress: this.#config.delegateAddress,
      chainId: request.chainId,
      tokenAddress: request.tokenAddress,
      periodAmount,
      periodDuration,
      enforcers: this.#enforcers,
    });

    const existingDelegations = await this.#messenger.call(
      'AuthenticatedUserStorageService:listDelegations',
    );
    const reusable = existingDelegations.find(matches);
    if (reusable) {
      await this.#ensureIntent({
        account: request.payerAddress,
        chainId: request.chainId,
        delegationHash: reusable.metadata.delegationHash,
        allowance: reusable.metadata.allowance,
        tokenSymbol: reusable.metadata.tokenSymbol,
        tokenAddress: reusable.metadata.tokenAddress,
      });
      return {
        delegationHash: reusable.metadata.delegationHash,
        disposition: 'reused',
      };
    }

    const startDate = Math.floor(Date.now() / 1000);
    const unsigned = buildUnsignedSubscriptionDelegation({
      delegateAddress: this.#config.delegateAddress,
      delegatorAddress: request.payerAddress,
      enforcers: this.#enforcers,
      tokenAddress: request.tokenAddress,
      periodAmount,
      periodDuration,
      startDate,
    });

    const signature = (await this.#messenger.call(
      'DelegationController:signDelegation',
      { delegation: unsigned, chainId: request.chainId },
    )) as Hex;

    const signedDelegation = { ...unsigned, signature };

    const verifyResult = await this.#messenger.call(
      'ChompApiService:verifyDelegation',
      {
        signedDelegation,
        chainId: request.chainId,
      },
    );

    if (!verifyResult.valid) {
      throw new Error(
        `${SubscriptionDelegationServiceErrorMessage.ChompRejectedDelegation}: ${
          verifyResult.errors?.join(', ') ?? 'unknown error'
        }`,
      );
    }

    const delegationHash = hashDelegation({
      ...unsigned,
      salt: BigInt(unsigned.salt),
      signature,
    });

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

    const allowance: Hex = add0x(periodAmount.toString(16));

    await this.#messenger.call(
      'AuthenticatedUserStorageService:createDelegation',
      {
        signedDelegation,
        metadata: {
          delegationHash,
          chainIdHex: request.chainId,
          allowance,
          tokenSymbol: request.tokenSymbol,
          tokenAddress: request.tokenAddress,
          type: SUBSCRIPTION_PAYMENT_DELEGATION_TYPE,
        },
      },
    );

    await this.#createIntent({
      account: request.payerAddress,
      chainId: request.chainId,
      delegationHash,
      allowance,
      tokenSymbol: request.tokenSymbol,
      tokenAddress: request.tokenAddress,
    });

    return {
      delegationHash,
      disposition: 'created',
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
          type: SUBSCRIPTION_PAYMENT_DELEGATION_TYPE,
        },
      },
    ]);
  }
}
