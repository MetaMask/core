import type {
  ControllerGetStateAction,
  ControllerStateChangedEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ChompApiServiceAssociateAddressAction,
  ChompApiServiceCreateUpgradeAction,
  ChompApiServiceGetServiceDetailsAction,
} from '@metamask/chomp-api-service';
import type {
  KeyringControllerSignEip7702AuthorizationAction,
  KeyringControllerSignPersonalMessageAction,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type {
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
} from '@metamask/network-controller';
import type { Hex } from '@metamask/utils';

import type { MoneyAccountUpgradeControllerMethodActions } from './MoneyAccountUpgradeController-method-action-types';
import { associateAddressStep } from './steps/associate-address';
import { eip7702AuthorizationStep } from './steps/eip-7702-authorization';
import type { Step } from './steps/step';
import type { InitConfig } from './types';

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
  | ChompApiServiceAssociateAddressAction
  | ChompApiServiceCreateUpgradeAction
  | ChompApiServiceGetServiceDetailsAction
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
  #config?: { chainId: Hex; delegatorImplAddress: Hex };

  readonly #steps: Step[] = [associateAddressStep, eip7702AuthorizationStep];

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
   * given chain.
   *
   * @param chainId - The chain to initialize for.
   * @param initConfig - Contract addresses not available from the service details API.
   */
  async init(chainId: Hex, initConfig: InitConfig): Promise<void> {
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
      delegatorImplAddress: initConfig.delegatorImplAddress,
    };
  }

  /**
   * Runs each step in the upgrade sequence in order. A step that reports
   * `'already-done'` is skipped without performing any action; a step that
   * reports `'completed'` has performed its action. An error thrown by any
   * step propagates and halts the sequence.
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
      await step.run({
        messenger: this.messenger,
        address,
        ...this.#config,
      });
    }
  }
}
