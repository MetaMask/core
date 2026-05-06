import type { Messenger } from '@metamask/messenger';
import type {
  SnapControllerGetStateAction,
  SnapControllerStateChangeEvent,
} from '@metamask/snaps-controllers';
import { SnapId } from '@metamask/snaps-sdk';

import type { SnapAccountServiceEnsureReadyAction } from './SnapAccountService-method-action-types';
import {
  SnapPlatformWatcher,
  SnapPlatformWatcherOptions,
} from './SnapPlatformWatcher';

/**
 * The name of the {@link SnapAccountService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'SnapAccountService';

/**
 * All of the methods within {@link SnapAccountService} that are exposed via
 * the messenger.
 */
const MESSENGER_EXPOSED_METHODS = ['ensureReady'] as const;

/**
 * Actions that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceActions = SnapAccountServiceEnsureReadyAction;

/**
 * Actions from other messengers that {@link SnapAccountService} calls.
 */
type AllowedActions = SnapControllerGetStateAction;

/**
 * Events that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceEvents = never;

/**
 * Events from other messengers that {@link SnapAccountService} subscribes to.
 */
type AllowedEvents = SnapControllerStateChangeEvent;

/**
 * The messenger which is restricted to actions and events accessed by
 * {@link SnapAccountService}.
 */
export type SnapAccountServiceMessenger = Messenger<
  typeof serviceName,
  SnapAccountServiceActions | AllowedActions,
  SnapAccountServiceEvents | AllowedEvents
>;

/**
 * The options that {@link SnapAccountService} takes.
 */
export type SnapAccountServiceOptions = {
  messenger: SnapAccountServiceMessenger;
} & SnapPlatformWatcherOptions;

/**
 * Service responsible for managing account management snaps.
 */
export class SnapAccountService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  readonly #messenger: SnapAccountServiceMessenger;

  readonly #watcher: SnapPlatformWatcher;

  /**
   * Constructs a new {@link SnapAccountService}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   * @param args.ensureOnboardingComplete - Optional callback that resolves when onboarding is complete.
   */
  constructor({
    messenger,
    ensureOnboardingComplete,
  }: SnapAccountServiceOptions) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#watcher = new SnapPlatformWatcher(messenger, {
      ensureOnboardingComplete,
    });

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Initializes the snap account service.
   */
  async init(): Promise<void> {
    // TODO: Add initialization logic here.
  }

  /**
   * Ensures everything is ready to use Snap accounts for the given Snap.
   * 1. Waits for the Snap platform to be fully started.
   *
   * Safe to call concurrently — each step is idempotent or mutex-protected.
   *
   * @param _snapId - ID of the Snap to ensure readiness for.
   */
  async ensureReady(_snapId: SnapId): Promise<void> {
    // Lastly, before doing anything with our Snap, we need to make sure the
    // platform is ready to process requests.
    await this.#watcher.ensureCanUseSnapPlatform();
  }
}
