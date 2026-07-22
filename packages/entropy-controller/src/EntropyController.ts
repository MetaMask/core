import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { Entropy, EntropyId, EntropyType } from './types';

/**
 * The name of the {@link EntropyController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
const CONTROLLER_NAME = 'EntropyController';

/**
 * Describes the shape of the state object for {@link EntropyController}.
 */
export type EntropyControllerState = {
  /**
   * The registry of entropy sources, keyed by their unique identifier.
   * Each entry records the type of the entropy source.
   */
  entropySources: {
    [entropyId: EntropyId]: {
      /**
       * The type of the entropy source, expressed as `category:implementation`
       * (e.g. `'bip44:mnemonic'`, `'bip44:ledger'`).
       */
      type: EntropyType;
    };
  };
};

/**
 * The metadata for each property in {@link EntropyControllerState}.
 */
const entropyControllerMetadata = {
  entropySources: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
} satisfies StateMetadata<EntropyControllerState>;

/**
 * Constructs the default {@link EntropyController} state.
 *
 * @returns The default {@link EntropyController} state.
 */
export function getDefaultEntropyControllerState(): EntropyControllerState {
  return {
    entropySources: {},
  };
}

/**
 * Retrieves the state of the {@link EntropyController}.
 */
export type EntropyControllerGetStateAction = ControllerGetStateAction<
  typeof CONTROLLER_NAME,
  EntropyControllerState
>;

/**
 * Registers an entropy source in the controller.
 *
 * The caller is responsible for pre-computing the entropy ID via `toEntropyId`
 * before calling this action.
 */
export type EntropyControllerAddEntropyAction = {
  type: `${typeof CONTROLLER_NAME}:addEntropy`;
  handler: (entropy: Entropy) => void;
};

/**
 * Removes an entropy source by its ID.
 */
export type EntropyControllerRemoveEntropyAction = {
  type: `${typeof CONTROLLER_NAME}:removeEntropy`;
  handler: (entropyId: EntropyId) => void;
};

/**
 * Actions that {@link EntropyControllerMessenger} exposes to other consumers.
 */
export type EntropyControllerActions =
  | EntropyControllerGetStateAction
  | EntropyControllerAddEntropyAction
  | EntropyControllerRemoveEntropyAction;

/**
 * Published when the state of {@link EntropyController} changes.
 */
export type EntropyControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof CONTROLLER_NAME,
  EntropyControllerState
>;

/**
 * Events that {@link EntropyControllerMessenger} exposes to other consumers.
 */
export type EntropyControllerEvents = EntropyControllerStateChangeEvent;

/**
 * The messenger restricted to actions and events accessed by
 * {@link EntropyController}.
 */
export type EntropyControllerMessenger = Messenger<
  typeof CONTROLLER_NAME,
  EntropyControllerActions,
  EntropyControllerEvents
>;

/**
 * `EntropyController` maintains a registry that maps entropy source identifiers
 * to their type.
 *
 * An entropy source is any provider of key material: a Secret Recovery Phrase
 * (SRP), a hardware wallet (Ledger, Trezor), or an imported private key. The
 * registry is the single source of truth for which entropy sources exist and
 * what kind they are.
 *
 * Rather than reacting to `KeyringController` state changes, this controller
 * exposes `addEntropy` and `removeEntropy` actions that `KeyringController`
 * calls directly after its own operations succeed. This ensures that entropy
 * sources are registered atomically from the caller's perspective.
 */
export class EntropyController extends BaseController<
  typeof CONTROLLER_NAME,
  EntropyControllerState,
  EntropyControllerMessenger
> {
  /**
   * Constructs a new {@link EntropyController}.
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
    messenger: EntropyControllerMessenger;
    state?: Partial<EntropyControllerState>;
  }) {
    super({
      messenger,
      metadata: entropyControllerMetadata,
      name: CONTROLLER_NAME,
      state: {
        ...getDefaultEntropyControllerState(),
        ...state,
      },
    });

    this.messenger.registerActionHandler(
      `${CONTROLLER_NAME}:addEntropy`,
      this.addEntropy.bind(this),
    );

    this.messenger.registerActionHandler(
      `${CONTROLLER_NAME}:removeEntropy`,
      this.removeEntropy.bind(this),
    );
  }

  /**
   * Registers an entropy source in the controller state.
   *
   * @param entropy - The entropy source to register, including its pre-computed
   * ID and type.
   */
  addEntropy(entropy: Entropy): void {
    this.update((state) => {
      state.entropySources[entropy.id] = { type: entropy.type };
    });
  }

  /**
   * Removes an entropy source from the controller state.
   *
   * @param entropyId - The ID of the entropy source to remove.
   */
  removeEntropy(entropyId: EntropyId): void {
    this.update((state) => {
      delete state.entropySources[entropyId];
    });
  }
}
