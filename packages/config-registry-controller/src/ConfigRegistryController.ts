import {
  BaseController,
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import type { Json } from '@metamask/utils';

const controllerName = 'ConfigRegistryController';

/**
 * Configuration entry in the registry.
 */
export type RegistryConfigEntry = {
  key: string;
  value: Json;
  metadata?: Json;
};

/**
 * The state of the {@link ConfigRegistryController}.
 *
 * @property configs - A map of configuration keys to their entries.
 */
export type ConfigRegistryState = {
  configs: Record<string, RegistryConfigEntry>;
};

const stateMetadata = {
  configs: {
    persist: true,
    anonymous: false,
    includeInStateLogs: false,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
};

export type ConfigRegistryControllerStateChangeEvent =
  ControllerStateChangeEvent<typeof controllerName, ConfigRegistryState>;

export type ConfigRegistryControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ConfigRegistryState
>;

export type ConfigRegistryControllerGetConfigAction = {
  type: `${typeof controllerName}:getConfig`;
  handler: ConfigRegistryController['getConfig'];
};

export type ConfigRegistryControllerSetConfigAction = {
  type: `${typeof controllerName}:setConfig`;
  handler: ConfigRegistryController['setConfig'];
};

export type ConfigRegistryControllerGetAllConfigsAction = {
  type: `${typeof controllerName}:getAllConfigs`;
  handler: ConfigRegistryController['getAllConfigs'];
};

export type ConfigRegistryControllerActions =
  | ConfigRegistryControllerGetStateAction
  | ConfigRegistryControllerGetConfigAction
  | ConfigRegistryControllerSetConfigAction
  | ConfigRegistryControllerGetAllConfigsAction;

export type ConfigRegistryControllerEvents =
  ConfigRegistryControllerStateChangeEvent;

export type ConfigRegistryMessenger = Messenger<
  typeof controllerName,
  ConfigRegistryControllerActions,
  ConfigRegistryControllerEvents
>;

/**
 * Options for constructing a ConfigRegistryController.
 */
export type ConfigRegistryControllerOptions = {
  messenger: ConfigRegistryMessenger;
  state?: Partial<ConfigRegistryState>;
};

/**
 * Controller for managing a configuration registry.
 */
export class ConfigRegistryController extends BaseController<
  typeof controllerName,
  ConfigRegistryState,
  ConfigRegistryMessenger
> {
  /**
   * Creates a ConfigRegistryController instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   */
  constructor({ messenger, state = {} }: ConfigRegistryControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: {
        configs: {},
        ...state,
      },
    });

    this.messenger.registerActionHandler(
      `${controllerName}:getConfig`,
      (key: string) => this.getConfig(key),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:setConfig`,
      (key: string, value: Json, metadata?: Json) =>
        this.setConfig(key, value, metadata),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:getAllConfigs`,
      () => this.getAllConfigs(),
    );
  }

  /**
   * Gets a specific configuration entry by key.
   *
   * @param key - The configuration key.
   * @returns The configuration entry, or undefined if not found.
   */
  getConfig(key: string): RegistryConfigEntry | undefined {
    return this.state.configs[key];
  }

  /**
   * Gets all configuration entries.
   *
   * @returns A copy of all configuration entries.
   */
  getAllConfigs(): Record<string, RegistryConfigEntry> {
    return { ...this.state.configs };
  }

  /**
   * Gets the value of a specific configuration entry by key.
   *
   * @param key - The configuration key.
   * @returns The configuration value, or undefined if not found.
   */
  getConfigValue<T = Json>(key: string): T | undefined {
    const entry = this.state.configs[key];
    return entry?.value as T | undefined;
  }

  /**
   * Sets a configuration entry in the registry.
   *
   * @param key - The configuration key.
   * @param value - The configuration value.
   * @param metadata - Optional metadata for the configuration entry.
   */
  setConfig(key: string, value: Json, metadata?: Json): void {
    this.update((state) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state.configs as any)[key] = {
        key,
        value,
        metadata,
      };
    });
  }

  /**
   * Removes a configuration entry from the registry.
   *
   * @param key - The configuration key.
   */
  removeConfig(key: string): void {
    this.update((state) => {
      delete state.configs[key];
    });
  }

  /**
   * Clears all configuration entries from the registry.
   */
  clearConfigs(): void {
    this.update((state) => {
      state.configs = {};
    });
  }
}
