import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { HdKeyring } from '@metamask/eth-hd-keyring/v2';
import type { SimpleKeyring } from '@metamask/eth-simple-keyring/v2';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerStateChangeEvent,
  KeyringControllerWithKeyringV2UnsafeAction,
} from '@metamask/keyring-controller';
import { KeyringTypes } from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import { hexToBytes } from '@metamask/utils';

import type { EntropyId, EntropyMetadata, EntropyType } from './types';
import { isKeyringOwningEntropy, toEntropyId } from './utils';

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
 * Actions that {@link EntropyControllerMessenger} exposes to other consumers.
 */
export type EntropyControllerActions = EntropyControllerGetStateAction;

/**
 * Actions from other messengers that {@link EntropyControllerMessenger} calls.
 */
type AllowedActions =
  | KeyringControllerGetStateAction
  | KeyringControllerWithKeyringV2UnsafeAction;

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
 * Events from other messengers that {@link EntropyControllerMessenger}
 * subscribes to.
 */
type AllowedEvents = KeyringControllerStateChangeEvent;

/**
 * The messenger restricted to actions and events accessed by
 * {@link EntropyController}.
 */
export type EntropyControllerMessenger = Messenger<
  typeof CONTROLLER_NAME,
  EntropyControllerActions | AllowedActions,
  EntropyControllerEvents | AllowedEvents
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

    // Syncing on `keyrings` state changes covers all cases, including vault
    // unlock: unlocking populates `state.keyrings`, which triggers this
    // selector and kicks off a sync automatically.
    this.messenger.subscribe(
      'KeyringController:stateChange',
      () => {
        this.#syncEntropies().catch(console.error);
      },
      (state) => state.keyrings,
    );
  }

  async #syncEntropies(): Promise<void> {
    const { isUnlocked, keyrings } = this.messenger.call(
      'KeyringController:getState',
    );
    if (!isUnlocked) {
      return;
    }

    const entropySources: EntropyControllerState['entropySources'] = {};
    for (const keyring of keyrings.filter(isKeyringOwningEntropy)) {
      const { id } = keyring.metadata;

      if (keyring.type === KeyringTypes.hd) {
        await this.#syncHdKeyring(id, entropySources);
      } else if (keyring.type === KeyringTypes.simple) {
        await this.#syncSimpleKeyring(id, entropySources);
      }
    }

    this.update((state) => {
      state.entropySources = entropySources;
    });
  }

  /**
   * Derives the entropy source entry for a single HD keyring and adds it to
   * the given map.
   *
   * Reads the mnemonic via `withKeyringV2Unsafe` and derives a stable
   * `EntropyId` with type `'bip44:srp'`. Skips the keyring silently if the
   * mnemonic is not yet initialised.
   *
   * @param id - The keyring metadata ID.
   * @param sources - The map to populate in-place.
   */
  async #syncHdKeyring(
    id: string,
    sources: EntropyControllerState['entropySources'],
  ): Promise<void> {
    await this.messenger.call(
      'KeyringController:withKeyringV2Unsafe',
      { id },
      ({ keyring }) => {
        const hdKeyring = keyring as HdKeyring;
        if (!hdKeyring.mnemonic) {
          return;
        }
        const entropyId = toEntropyId(hdKeyring.mnemonic, 'bip44:srp');
        sources[entropyId] = {
          type: 'bip44:srp',
          metadata: { legacyEntropySource: id },
        };
      },
    );
  }

  /**
   * Derives entropy source entries for a single Simple keyring and adds them
   * to the given map.
   *
   * Enumerates accounts via `withKeyringV2Unsafe`, exports each private key
   * via `exportAccount`, and derives a stable `EntropyId` with type
   * `'raw:private-key'` for each one.
   *
   * @param id - The keyring metadata ID.
   * @param sources - The map to populate in-place.
   */
  async #syncSimpleKeyring(
    id: string,
    sources: EntropyControllerState['entropySources'],
  ): Promise<void> {
    await this.messenger.call(
      'KeyringController:withKeyringV2Unsafe',
      { id },
      async ({ keyring }) => {
        const simpleKeyring = keyring as SimpleKeyring;
        const accounts = await simpleKeyring.getAccounts();
        for (const account of accounts) {
          const exported = await simpleKeyring.exportAccount(account.id, {
            type: 'private-key',
            encoding: 'hexadecimal',
          });
          const entropyId = toEntropyId(
            hexToBytes(exported.privateKey),
            'raw:private-key',
          );
          sources[entropyId] = {
            type: 'raw:private-key',
            metadata: { legacyEntropySource: id },
          };
        }
      },
    );
  }
}
