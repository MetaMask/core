// packages/app-metadata/src/types.ts
import { ControllerGetStateAction, ControllerStateChangeEvent, RestrictedMessenger } from '@metamask/base-controller';

// Unique name for the controller
export const controllerName = 'AppMetadataController';

/**
 * The state of the AppMetadataController
 */
export type AppMetadataControllerState = {
  currentAppVersion: string;
  previousAppVersion: string;
  previousMigrationVersion: number;
  currentMigrationVersion: number;
};

/**
 * Function to get default state of the {@link AppMetadataController}.
 */
export const getDefaultAppMetadataControllerState = (): AppMetadataControllerState => ({
  currentAppVersion: '',
  previousAppVersion: '',
  previousMigrationVersion: 0,
  currentMigrationVersion: 0,
});

/**
 * Returns the state of the {@link AppMetadataController}.
 */
export type AppMetadataControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  AppMetadataControllerState
>;

/**
 * Event emitted when the state of the {@link AppMetadataController} changes.
 */
export type AppMetadataControllerStateChangeEvent = ControllerStateChangeEvent<
  typeof controllerName,
  AppMetadataControllerState
>;

/**
 * Actions exposed by the {@link AppMetadataController}.
 */
export type AppMetadataControllerActions = AppMetadataControllerGetStateAction;

/**
 * Events emitted by the {@link AppMetadataController}.
 */
export type AppMetadataControllerEvents = AppMetadataControllerStateChangeEvent;

/**
 * Messenger type for the {@link AppMetadataController}.
 */
export type AppMetadataControllerMessenger = RestrictedMessenger<
  typeof controllerName,
  AppMetadataControllerActions,
  AppMetadataControllerEvents,
  never,
  never
>;

/**
 * Metadata configuration for state persistence and anonymity.
 */
export const controllerMetadata = {
  currentAppVersion: { persist: true, anonymous: true },
  previousAppVersion: { persist: true, anonymous: true },
  previousMigrationVersion: { persist: true, anonymous: true },
  currentMigrationVersion: { persist: true, anonymous: true },
};

// packages/app-metadata/src/AppMetadataController.ts
import { BaseController } from '@metamask/base-controller';
import {
  AppMetadataControllerState,
  getDefaultAppMetadataControllerState,
  AppMetadataControllerMessenger,
  controllerMetadata,
  controllerName,
} from './types';

/**
 * The AppMetadata controller stores metadata about the current application,
 * including versioning and migration history.
 */
export default class AppMetadataController extends BaseController<
  typeof controllerName,
  AppMetadataControllerState,
  AppMetadataControllerMessenger
> {
  /**
   * Constructs an AppMetadataController.
   *
   * @param options - Controller options.
   */
  constructor({
    state = {},
    messenger,
    currentAppVersion = '',
    currentMigrationVersion = 0,
  }: {
    state?: Partial<AppMetadataControllerState>;
    messenger: AppMetadataControllerMessenger;
    currentAppVersion?: string;
    currentMigrationVersion?: number;
  }) {
    super({
      name: controllerName,
      metadata: controllerMetadata,
      state: { ...getDefaultAppMetadataControllerState(), ...state },
      messenger,
    });

    this.#maybeUpdateAppVersion(currentAppVersion);
    this.#maybeUpdateMigrationVersion(currentMigrationVersion);
  }

  /**
   * Updates the app version in state, tracking previous versions.
   */
  #maybeUpdateAppVersion(maybeNewAppVersion: string): void {
    const oldVersion = this.state.currentAppVersion;
    if (maybeNewAppVersion !== oldVersion) {
      this.update((state) => {
        state.currentAppVersion = maybeNewAppVersion;
        state.previousAppVersion = oldVersion;
      });
    }
  }

  /**
   * Updates the migration version in state.
   */
  #maybeUpdateMigrationVersion(maybeNewMigrationVersion: number): void {
    const oldMigrationVersion = this.state.currentMigrationVersion;
    if (maybeNewMigrationVersion !== oldMigrationVersion) {
      this.update((state) => {
        state.previousMigrationVersion = oldMigrationVersion;
        state.currentMigrationVersion = maybeNewMigrationVersion;
      });
    }
  }
}

// packages/app-metadata/src/index.ts
export { default as AppMetadataController } from './AppMetadataController';
export * from './types';
