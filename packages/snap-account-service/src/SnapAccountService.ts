import type { Messenger } from '@metamask/messenger';
import type { SnapControllerGetRunnableSnapsAction } from '@metamask/snaps-controllers';
import type { Snap, SnapId } from '@metamask/snaps-sdk';

import { projectLogger as log } from './logger';
import { SnapAccountServiceMethodActions } from './SnapAccountService-method-action-types';

/**
 * The name of the {@link SnapAccountService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'SnapAccountService';

/**
 * All of the methods within {@link SnapAccountService} that are exposed via
 * the messenger.
 */
const MESSENGER_EXPOSED_METHODS = ['getSnaps'] as const;

/**
 * Actions that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceActions = SnapAccountServiceMethodActions;

/**
 * Actions from other messengers that {@link SnapAccountService} calls.
 */
type AllowedActions = SnapControllerGetRunnableSnapsAction;

/**
 * Events that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceEvents = never;

/**
 * Events from other messengers that {@link SnapAccountService} subscribes to.
 */
type AllowedEvents = never;

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
 * Checks if a given Snap is an account management Snap.
 *
 * @param snap - The Snap to check.
 * @returns True if the Snap is an account management Snap, false otherwise.
 */
function isAccountManagementSnap(snap: Snap): boolean {
  return snap.initialPermissions['endowment:keyring'] !== undefined;
}

/**
 * Service responsible for managing account management snaps.
 */
export class SnapAccountService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  readonly #messenger: SnapAccountServiceMessenger;

  readonly #snaps: Set<SnapId> = new Set();

  /**
   * Constructs a new {@link SnapAccountService}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this service.
   */
  constructor({ messenger }: { messenger: SnapAccountServiceMessenger }) {
    this.name = serviceName;
    this.#messenger = messenger;

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Initializes the Snap account service.
   */
  async init(): Promise<void> {
    const snaps = this.#messenger.call('SnapController:getRunnableSnaps');
    for (const snap of snaps) {
      if (isAccountManagementSnap(snap)) {
        log(`Found account management Snap: ${snap.id}`);
        this.#snaps.add(snap.id);
      }
    }
  }

  /**
   * Returns the Snap IDs of all account management Snaps.
   *
   * @returns Set of Snap IDs of all account management Snaps.
   */
  getSnaps(): Set<SnapId> {
    return this.#snaps;
  }
}
