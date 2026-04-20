import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type {
  ChompApiServiceAssociateAddressAction,
  ChompApiServiceGetServiceDetailsAction,
} from '@metamask/chomp-api-service';
import type { KeyringControllerSignPersonalMessageAction } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import { associateAddressStep } from './associate-address';
import type { MoneyAccountUpgradeControllerMethodActions } from './MoneyAccountUpgradeController-method-action-types';
import type { Step } from './step';
import type { InitConfig } from './types';

export const controllerName = 'MoneyAccountUpgradeController';

export type MoneyAccountUpgradeControllerState = {
  upgrades: Record<string, { chainId: Hex }>;
};

const moneyAccountUpgradeControllerMetadata = {
  upgrades: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: true,
    usedInUi: false,
  },
} satisfies StateMetadata<MoneyAccountUpgradeControllerState>;

export function getDefaultMoneyAccountUpgradeControllerState(): MoneyAccountUpgradeControllerState {
  return {
    upgrades: {},
  };
}

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
  | ChompApiServiceGetServiceDetailsAction
  | KeyringControllerSignPersonalMessageAction;

export type MoneyAccountUpgradeControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    MoneyAccountUpgradeControllerState
  >;

export type MoneyAccountUpgradeControllerEvents =
  MoneyAccountUpgradeControllerStateChangeEvent;

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
  #initialized: boolean;

  readonly #steps: Step[] = [associateAddressStep];

  /**
   * Constructor for the MoneyAccountUpgradeController.
   *
   * @param options - The options for constructing the controller.
   * @param options.messenger - The messenger to use for inter-controller communication.
   * @param options.state - The initial state of the controller.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: MoneyAccountUpgradeControllerMessenger;
    state?: Partial<MoneyAccountUpgradeControllerState>;
  }) {
    super({
      messenger,
      metadata: moneyAccountUpgradeControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultMoneyAccountUpgradeControllerState(),
        ...state,
      },
    });

    this.#initialized = false;

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
   * @param _initConfig - Contract addresses not available from the service details API.
   */
  async init(chainId: Hex, _initConfig: InitConfig): Promise<void> {
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

    this.#initialized = true;
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
    if (!this.#initialized) {
      throw new Error(
        'MoneyAccountUpgradeController must be initialized via init() before upgradeAccount() can be called',
      );
    }

    for (const step of this.#steps) {
      await step.run({ messenger: this.messenger, address });
    }
  }
}
