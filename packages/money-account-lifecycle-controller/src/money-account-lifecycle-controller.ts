import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { ChompApiServiceGetDerivedIdentitiesAction } from './chomp-api-service-derived-identities.js';
import type { MoneyAccountLifecycleControllerMethodActions } from './money-account-lifecycle-controller-method-action-types.js';

const CONTROLLER_NAME = 'MoneyAccountLifecycleController';

export type MoneyAccountLifecycleControllerState = Record<never, never>;

const moneyAccountLifecycleControllerMetadata =
  {} satisfies StateMetadata<MoneyAccountLifecycleControllerState>;

export function getDefaultMoneyAccountLifecycleControllerState(): MoneyAccountLifecycleControllerState {
  return {};
}

const MESSENGER_EXPOSED_METHODS = ['init'] as const;

export type MoneyAccountLifecycleControllerGetStateAction =
  ControllerGetStateAction<
    typeof CONTROLLER_NAME,
    MoneyAccountLifecycleControllerState
  >;

export type MoneyAccountLifecycleControllerActions =
  | MoneyAccountLifecycleControllerGetStateAction
  | MoneyAccountLifecycleControllerMethodActions;

type AllowedActions = ChompApiServiceGetDerivedIdentitiesAction;

export type MoneyAccountLifecycleControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof CONTROLLER_NAME,
    MoneyAccountLifecycleControllerState
  >;

export type MoneyAccountLifecycleControllerEvents =
  MoneyAccountLifecycleControllerStateChangeEvent;

type AllowedEvents = never;

export type MoneyAccountLifecycleControllerMessenger = Messenger<
  typeof CONTROLLER_NAME,
  MoneyAccountLifecycleControllerActions | AllowedActions,
  MoneyAccountLifecycleControllerEvents | AllowedEvents
>;

export class MoneyAccountLifecycleController extends BaseController<
  typeof CONTROLLER_NAME,
  MoneyAccountLifecycleControllerState,
  MoneyAccountLifecycleControllerMessenger
> {
  constructor({
    messenger,
    state,
  }: {
    messenger: MoneyAccountLifecycleControllerMessenger;
    state?: Partial<MoneyAccountLifecycleControllerState>;
  }) {
    super({
      messenger,
      metadata: moneyAccountLifecycleControllerMetadata,
      name: CONTROLLER_NAME,
      state: {
        ...getDefaultMoneyAccountLifecycleControllerState(),
        ...state,
      },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Initializes the controller.
   */
  init(): void {
    // Intentionally empty until the lifecycle behaviour is implemented.
  }
}
