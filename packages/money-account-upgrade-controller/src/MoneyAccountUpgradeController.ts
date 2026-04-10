import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { MoneyAccountUpgradeControllerMethodActions } from './MoneyAccountUpgradeController-method-action-types';

export const controllerName = 'MoneyAccountUpgradeController';

export type MoneyAccountUpgradeControllerState = Record<string, never>;

const moneyAccountUpgradeControllerMetadata =
  {} satisfies StateMetadata<MoneyAccountUpgradeControllerState>;

export function getDefaultMoneyAccountUpgradeControllerState(): MoneyAccountUpgradeControllerState {
  return {};
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

type AllowedActions = never;

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
 * Controller for managing money account upgrades.
 */
export class MoneyAccountUpgradeController extends BaseController<
  typeof controllerName,
  MoneyAccountUpgradeControllerState,
  MoneyAccountUpgradeControllerMessenger
> {
  /**
   * Constructor for the MoneyAccountUpgradeController.
   *
   * @param options - The options for constructing the controller.
   * @param options.messenger - The messenger to use for inter-controller communication.
   * @param options.state - The initial state of the controller. If not provided, the default state will be used.
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

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Upgrades a money account. This method iterates over a number of
   * steps to perform the upgrade.
   *
   * @returns A promise that resolves when the upgrade is complete.
   */
  async upgradeAccount(): Promise<void> {
    // TODO: Implement upgrade steps
  }
}
