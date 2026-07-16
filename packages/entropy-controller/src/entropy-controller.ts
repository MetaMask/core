import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';

import type { EntropyId, EntropyMetadata, EntropyType } from './types';

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
type AllowedActions = never;

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
type AllowedEvents = never;

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
  }
}
