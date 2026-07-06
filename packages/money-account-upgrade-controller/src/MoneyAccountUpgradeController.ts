import type {
  AuthenticatedUserStorageServiceCreateDelegationAction,
  AuthenticatedUserStorageServiceListDelegationsAction,
} from '@metamask/authenticated-user-storage';
import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ChompApiServiceAssociateAddressAction,
  ChompApiServiceCreateIntentsAction,
  ChompApiServiceCreateUpgradeAction,
  ChompApiServiceGetIntentsByAddressAction,
  ChompApiServiceGetServiceDetailsAction,
  ChompApiServiceVerifyDelegationAction,
} from '@metamask/chomp-api-service';
import type { DelegationControllerSignDelegationAction } from '@metamask/delegation-controller';
import { DELEGATOR_CONTRACTS } from '@metamask/delegation-deployments';
import type {
  KeyringControllerSignEip7702AuthorizationAction,
  KeyringControllerSignPersonalMessageAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import { hexToNumber } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { MoneyAccountUpgradeStepError } from './errors';
import type { MoneyAccountUpgradeControllerMethodActions } from './MoneyAccountUpgradeController-method-action-types';
import { associateAddressStep } from './steps/associate-address';
import { buildDelegationStep } from './steps/build-delegations';
import { eip7702AuthorizationStep } from './steps/eip-7702-authorization';
import { registerIntentsStep } from './steps/register-intents';
import type { Step } from './steps/step';
import type { UpgradeConfig } from './types';

/**
 * The Delegation Framework deployment version we resolve contract addresses
 * against in `@metamask/delegation-deployments`.
 */
const DELEGATION_FRAMEWORK_VERSION = '1.3.0';

export const controllerName = 'MoneyAccountUpgradeController';

export type MoneyAccountUpgradeControllerState = Record<string, never>;

const moneyAccountUpgradeControllerMetadata =
  {} satisfies StateMetadata<MoneyAccountUpgradeControllerState>;

const MESSENGER_EXPOSED_METHODS = ['upgradeAccount'] as const;

export type MoneyAccountUpgradeControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    MoneyAccountUpgradeControllerState
  >;

export type MoneyAccountUpgradeControllerActions =
  | MoneyAccountUpgradeControllerGetStateAction
  | MoneyAccountUpgradeControllerMethodActions;

type AllowedActions =
  | AuthenticatedUserStorageServiceCreateDelegationAction
  | AuthenticatedUserStorageServiceListDelegationsAction
  | ChompApiServiceAssociateAddressAction
  | ChompApiServiceCreateIntentsAction
  | ChompApiServiceCreateUpgradeAction
  | ChompApiServiceGetIntentsByAddressAction
  | ChompApiServiceGetServiceDetailsAction
  | ChompApiServiceVerifyDelegationAction
  | DelegationControllerSignDelegationAction
  | KeyringControllerSignEip7702AuthorizationAction
  | KeyringControllerSignPersonalMessageAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | NetworkControllerGetNetworkClientByIdAction;

export type MoneyAccountUpgradeControllerStateChangedEvent =
  ControllerStateChangedEvent<
    typeof controllerName,
    MoneyAccountUpgradeControllerState
  >;

export type MoneyAccountUpgradeControllerEvents =
  MoneyAccountUpgradeControllerStateChangedEvent;

type AllowedEvents = never;

export type MoneyAccountUpgradeControllerMessenger = Messenger<
  typeof controllerName,
  MoneyAccountUpgradeControllerActions | AllowedActions,
  MoneyAccountUpgradeControllerEvents | AllowedEvents
>;

/**
 * Controller that orchestrates the Money Account upgrade sequence.
 */
export class MoneyAccountUpgradeController extends BaseController<
  typeof controllerName,
  MoneyAccountUpgradeControllerState,
  MoneyAccountUpgradeControllerMessenger
> {
  #config?: UpgradeConfig & { chainId: Hex };

  readonly #steps: Step[] = [
    associateAddressStep,
    eip7702AuthorizationStep,
    buildDelegationStep,
    registerIntentsStep,
  ];

  /**
   * Constructor for the MoneyAccountUpgradeController.
   *
   * @param options - The options for constructing the controller.
   * @param options.messenger - The messenger to use for inter-controller communication.
   */
  constructor({
    messenger,
  }: {
    messenger: MoneyAccountUpgradeControllerMessenger;
  }) {
    super({
      messenger,
      metadata: moneyAccountUpgradeControllerMetadata,
      name: controllerName,
      state: {},
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Fetches service details and validates the controller can operate on the
   * given chain. Resolves the Delegation Framework contract addresses for the
   * chain from `@metamask/delegation-deployments`.
   *
   * @param params - The parameters for initialization.
   * @param params.chainId - The chain to initialize for.
   * @param params.boringVaultAddress - The Veda boring vault contract
   * (vmUSD) for the given chain. Used as the withdrawal-side delegation
   * token. Supplied by the consumer until the CHOMP service-details API
   * exposes it.
   */
  async init({
    chainId,
    boringVaultAddress,
  }: {
    chainId: Hex;
    boringVaultAddress: Hex;
  }): Promise<void> {
    const contracts =
      DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION][hexToNumber(chainId)];
    if (!contracts) {
      throw new Error(
        `Delegation Framework ${DELEGATION_FRAMEWORK_VERSION} is not deployed on chain ${chainId}`,
      );
    }

    const response = await this.messenger.call(
      'ChompApiService:getServiceDetails',
      [chainId],
    );

    const chain = response.chains[chainId];
    if (!chain) {
      throw new Error(`Chain ${chainId} not found in service details response`);
    }

    const { vedaProtocol } = chain.protocol;
    if (!vedaProtocol) {
      throw new Error(
        `vedaProtocol not found for chain ${chainId} in service details response`,
      );
    }

    if (vedaProtocol.supportedTokens.length === 0) {
      throw new Error(
        `No supported tokens found for vedaProtocol on chain ${chainId}`,
      );
    }

    this.#config = {
      chainId,
      delegateAddress: chain.autoDepositDelegate,
      musdTokenAddress: vedaProtocol.supportedTokens[0].tokenAddress,
      boringVaultAddress,
      vedaVaultAdapterAddress: vedaProtocol.adapterAddress,
      delegatorImplAddress: contracts.EIP7702StatelessDeleGatorImpl,
      erc20TransferAmountEnforcer: contracts.ERC20TransferAmountEnforcer,
      redeemerEnforcer: contracts.RedeemerEnforcer,
      valueLteEnforcer: contracts.ValueLteEnforcer,
    };
  }

  /**
   * Runs each step in the upgrade sequence in order. A step that reports
   * `'already-done'` is skipped without performing any action; a step that
   * reports `'completed'` has performed its action. An error thrown by any
   * step halts the sequence and is re-thrown wrapped in a
   * {@link MoneyAccountUpgradeStepError} that records which step failed (the
   * original error is preserved as `cause`).
   *
   * @param address - The Money Account address to upgrade.
   */
  async upgradeAccount(address: Hex): Promise<void> {
    if (!this.#config) {
      throw new Error(
        'MoneyAccountUpgradeController must be initialized via init() before upgradeAccount() can be called',
      );
    }

    for (const step of this.#steps) {
      try {
        await step.run({
          messenger: this.messenger,
          address,
          ...this.#config,
        });
      } catch (error) {
        throw new MoneyAccountUpgradeStepError(step.name, error);
      }
    }
  }
}
