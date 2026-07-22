import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { EntropyId, EntropyMetadata, EntropyType } from './types';
import { toEntropyId } from './utils';

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
   * Each entry records the type and metadata of the entropy source.
   */
  entropySources: {
    [entropyId: EntropyId]: {
      /**
       * The type of the entropy source, expressed as `category:implementation`
       * (e.g. `'bip44:srp'`, `'bip44:ledger'`).
       */
      type: EntropyType;

      /**
       * Metadata associated with the entropy source.
       */
      metadata: EntropyMetadata;
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
 * Constructs the default {@link EntropyController} state. This allows
 * consumers to provide a partial state object when initializing the controller
 * and also helps in constructing complete state objects for this controller in
 * tests.
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
 * Derives and registers a single entropy source.
 *
 * Called by `KeyringController` after a keyring is successfully persisted,
 * so that the entropy ID is available atomically from the caller's perspective.
 */
export type EntropyControllerRegisterSourceAction = {
  type: `${typeof CONTROLLER_NAME}:registerSource`;
  handler: (
    source:
      | {
          type: 'bip44:srp';
          mnemonic: Uint8Array;
          metadata: EntropyMetadata;
        }
      | {
          type: 'raw:private-key';
          privateKey: Uint8Array;
          metadata: EntropyMetadata;
        },
  ) => Promise<void>;
};

/**
 * Removes all entropy sources associated with a given keyring ID.
 *
 * Called by `KeyringController` after a keyring is removed.
 */
export type EntropyControllerUnregisterSourceAction = {
  type: `${typeof CONTROLLER_NAME}:unregisterSource`;
  handler: (keyringId: string) => void;
};

/**
 * Actions that {@link EntropyControllerMessenger} exposes to other consumers.
 */
export type EntropyControllerActions =
  | EntropyControllerGetStateAction
  | EntropyControllerRegisterSourceAction
  | EntropyControllerUnregisterSourceAction;

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
 * to their type and metadata.
 *
 * An entropy source is any provider of key material: a Secret Recovery Phrase
 * (SRP), a hardware wallet (Ledger, Trezor), or an imported private key. The
 * registry is the single source of truth for which entropy sources exist and
 * what kind they are. Actual key material and signing operations are left to
 * entropy source implementations and chain-specific keyrings.
 *
 * Rather than reacting to `KeyringController` state changes, this controller
 * exposes `registerSource` and `unregisterSource` actions that `KeyringController`
 * calls directly after its own operations succeed. This ensures that entropy
 * sources are registered atomically from the caller's perspective — by the time
 * `addNewKeyring` or `submitPassword` resolves, the corresponding entropy IDs
 * are already present in state.
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
      `${CONTROLLER_NAME}:registerSource`,
      this.#registerSource.bind(this),
    );

    this.messenger.registerActionHandler(
      `${CONTROLLER_NAME}:unregisterSource`,
      this.#unregisterSource.bind(this),
    );
  }

  /**
   * Derives and merges a single entropy source into state.
   *
   * @param source - The entropy source to register, including raw bytes and
   * the metadata that links it back to its originating keyring.
   */
  async #registerSource(
    source:
      | {
          type: 'bip44:srp';
          mnemonic: Uint8Array;
          metadata: EntropyMetadata;
        }
      | {
          type: 'raw:private-key';
          privateKey: Uint8Array;
          metadata: EntropyMetadata;
        },
  ): Promise<void> {
    const bytes = source.type === 'bip44:srp' ? source.mnemonic : source.privateKey;
    const entropyId = await toEntropyId(bytes, source.type);
    this.update((state) => {
      state.entropySources[entropyId] = {
        type: source.type,
        metadata: source.metadata,
      };
    });
  }

  /**
   * Removes all entropy sources whose `legacyEntropySource` matches the given
   * keyring ID.
   *
   * @param keyringId - The ID of the keyring being removed.
   */
  #unregisterSource(keyringId: string): void {
    this.update((state) => {
      for (const [entropyId, entry] of Object.entries(state.entropySources)) {
        if (entry.metadata.legacyEntropySource === keyringId) {
          delete state.entropySources[entropyId];
        }
      }
    });
  }
}
