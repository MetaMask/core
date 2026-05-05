import type { Messenger } from '@metamask/messenger';

/**
 * The name of the {@link SnapAccountService}, used to namespace the service's
 * actions and events.
 */
export const serviceName = 'SnapAccountService';

/**
 * All of the methods within {@link SnapAccountService} that are exposed via
 * the messenger.
 */
const MESSENGER_EXPOSED_METHODS = [] as const;

/**
 * Actions that {@link SnapAccountService} exposes to other consumers.
 */
export type SnapAccountServiceActions = never;

/**
 * Actions from other messengers that {@link SnapAccountService} calls.
 */
type AllowedActions = never;

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
 * Service responsible for managing account management snaps.
 */
export class SnapAccountService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  readonly #messenger: SnapAccountServiceMessenger;

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
   * Initializes the snap account service.
   */
  async init(): Promise<void> {
    // TODO: Add initialization logic here.
  }
}
