import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { isSafeDynamicKey } from '@metamask/controller-utils';
import type { Messenger } from '@metamask/messenger';
import type { Hex } from '@metamask/utils';

import type { SamplePetnamesControllerMethodActions } from './sample-petnames-controller-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link SamplePetnamesController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'SamplePetnamesController';

// === STATE ===

/**
 * Describes the shape of the state object for {@link SamplePetnamesController}.
 */
export type SamplePetnamesControllerState = {
  /**
   * The registry of pet names, categorized by chain ID first and address
   * second.
   */
  namesByChainIdAndAddress: {
    [chainId: Hex]: {
      [address: Hex]: string;
    };
  };
};

/**
 * The metadata for each property in {@link SamplePetnamesControllerState}.
 */
const samplePetnamesControllerMetadata = {
  namesByChainIdAndAddress: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
} satisfies StateMetadata<SamplePetnamesControllerState>;

/**
 * Constructs the default {@link SamplePetnamesController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
 *
 * @returns The default {@link SamplePetnamesController} state.
 */
export function getDefaultPetnamesControllerState(): SamplePetnamesControllerState {
  return {
    namesByChainIdAndAddress: {},
  };
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['assignPetname'] as const;

/**
 * Retrieves the state of the {@link SamplePetnamesController}.
 */
export type SamplePetnamesControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  SamplePetnamesControllerState
>;

/**
 * Actions that {@link SampleGasPricesMessenger} exposes to other consumers.
 */
export type SamplePetnamesControllerActions =
  | SamplePetnamesControllerGetStateAction
  | SamplePetnamesControllerMethodActions;

/**
 * Actions from other messengers that {@link SampleGasPricesMessenger} calls.
 */
type AllowedActions = never;

/**
 * Published when the state of {@link SamplePetnamesController} changes.
 */
export type SamplePetnamesControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    SamplePetnamesControllerState
  >;

/**
 * Events that {@link SampleGasPricesMessenger} exposes to other consumers.
 */
export type SamplePetnamesControllerEvents =
  SamplePetnamesControllerStateChangeEvent;

/**
 * Events from other messengers that {@link SampleGasPricesMessenger} subscribes
 * to.
 */
type AllowedEvents = never;

/**
 * The messenger restricted to actions and events accessed by
 * {@link SamplePetnamesController}.
 */
export type SamplePetnamesControllerMessenger = Messenger<
  typeof controllerName,
  SamplePetnamesControllerActions | AllowedActions,
  SamplePetnamesControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

/**
 * `SamplePetnamesController` records user-provided nicknames for various
 * addresses on various chains.
 *
 * @example
 *
 * ``` ts
 * import { Messenger } from '@metamask/messenger';
 * import type {
 *   SamplePetnamesControllerActions,
 *   SamplePetnamesControllerEvents,
 * } from '@metamask/sample-controllers';
 *
 * const rootMessenger = new Messenger<
 *  'Root',
 *  SamplePetnamesControllerActions,
 *  SamplePetnamesControllerEvents
 * >({ namespace: 'Root' });
 * const samplePetnamesMessenger = new Messenger<
 *  'SamplePetnamesController',
 *  SamplePetnamesControllerActions,
 *  SamplePetnamesControllerEvents,
 *  typeof rootMessenger,
 * >({
 *  namespace: 'SamplePetnamesController',
 *  parent: rootMessenger,
 * });
 * // Instantiate the controller to register its actions on the messenger
 * new SamplePetnamesController({
 *   messenger: samplePetnamesMessenger,
 * });
 *
 * rootMessenger.call(
 *   'SamplePetnamesController:assignPetname',
 *   [
 *     '0x1',
 *     '0xF57F855e17483B1f09bFec62783C9d3b6c8b3A99',
 *     'Primary Account',
 *   ],
 * );
 * const samplePetnamesControllerState = await rootMessenger.call(
 *   'SamplePetnamesController:getState',
 * );
 * samplePetnamesControllerState.namesByChainIdAndAddress
 * // => { '0x1': { '0xF57F855e17483B1f09bFec62783C9d3b6c8b3A99': 'Primary Account' } }
 * ```
 */
export class SamplePetnamesController extends BaseController<
  typeof controllerName,
  SamplePetnamesControllerState,
  SamplePetnamesControllerMessenger
> {
  /**
   * Constructs a new {@link SamplePetnamesController}.
   *
   * @param args - The arguments to this controller.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - The desired state with which to initialize this
   * controller. Missing properties will be filled in with defaults.
   */
  constructor({
    messenger,
    state,
  }: {
    messenger: SamplePetnamesControllerMessenger;
    state?: Partial<SamplePetnamesControllerState>;
  }) {
    super({
      messenger,
      metadata: samplePetnamesControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultPetnamesControllerState(),
        ...state,
      },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Registers the given name with the given address (relative to the given
   * chain).
   *
   * @param chainId - The chain ID that the address belongs to.
   * @param address - The account address to name.
   * @param name - The name to assign to the address.
   */
  assignPetname(chainId: Hex, address: Hex, name: string): void {
    if (!isSafeDynamicKey(chainId)) {
      throw new Error('Invalid chain ID');
    }

    const normalizedAddress = address.toLowerCase() as Hex;

    this.update((state) => {
      state.namesByChainIdAndAddress[chainId] ??= {};
      state.namesByChainIdAndAddress[chainId][normalizedAddress] = name;
    });
  }
}
