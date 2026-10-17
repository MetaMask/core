import { AccountCreationType } from '@metamask/keyring-api';
import type { KeyringAccount } from '@metamask/keyring-api';
import { KeyringType } from '@metamask/keyring-api/v2';
import type { Keyring as KeyringV2 } from '@metamask/keyring-api/v2';
import type {
  KeyringControllerWithControllerAction,
  KeyringControllerWithKeyringV2Action,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';

import { WatchOnlyAccountDisabledError } from './errors.js';
import type {
  WatchOnlyAccountServiceCreateAccountAction,
  WatchOnlyAccountServiceIsEnabledAction,
} from './WatchOnlyAccountService-method-action-types.js';

/**
 * The name of the {@link WatchOnlyAccountService}, used to namespace the
 * service's actions.
 */
export const serviceName = 'WatchOnlyAccountService';

/**
 * All of the methods within {@link WatchOnlyAccountService} that are exposed
 * via the messenger.
 */
const MESSENGER_EXPOSED_METHODS = ['createAccount', 'isEnabled'] as const;

/**
 * Actions that {@link WatchOnlyAccountService} exposes to other consumers.
 */
export type WatchOnlyAccountServiceActions =
  | WatchOnlyAccountServiceCreateAccountAction
  | WatchOnlyAccountServiceIsEnabledAction;

/**
 * Actions from other messengers that {@link WatchOnlyAccountService} calls.
 */
type AllowedActions =
  | KeyringControllerWithControllerAction
  | KeyringControllerWithKeyringV2Action;

/**
 * The messenger which is restricted to actions accessed by
 * {@link WatchOnlyAccountService}.
 */
export type WatchOnlyAccountServiceMessenger = Messenger<
  typeof serviceName,
  WatchOnlyAccountServiceActions | AllowedActions,
  never
>;

/**
 * The options that {@link WatchOnlyAccountService} takes.
 */
export type WatchOnlyAccountServiceOptions = {
  /**
   * The messenger suited for this service.
   */
  messenger: WatchOnlyAccountServiceMessenger;

  /**
   * Whether the watch-only support is enabled. When disabled, the service
   * refuses to create watch-only accounts. Callers are expected to pass the
   * feature gate (e.g. a compile-time dev-mode flag) so that the gating
   * decision is made once, at construction time.
   */
  enabled?: boolean;
};

/**
 * Service responsible for managing watch-only accounts.
 *
 * Watch-only accounts are EVM accounts imported by address, held by the
 * `"watch-only"` keyring. They cannot sign anything. This service hides the
 * keyring plumbing (notably the atomic creation of the watch-only keyring if
 * it does not exist yet) behind a single, simple action.
 */
export class WatchOnlyAccountService {
  /**
   * The name of the service.
   */
  readonly name: typeof serviceName;

  readonly #messenger: WatchOnlyAccountServiceMessenger;

  readonly #enabled: boolean;

  /**
   * Constructs a new {@link WatchOnlyAccountService}.
   *
   * @param options - The constructor arguments.
   * @param options.messenger - The messenger suited for this service.
   * @param options.enabled - Whether the watch-only support is enabled.
   */
  constructor({ messenger, enabled = false }: WatchOnlyAccountServiceOptions) {
    this.name = serviceName;
    this.#messenger = messenger;
    this.#enabled = enabled;

    this.#messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Returns whether the watch-only support is enabled.
   *
   * @returns `true` if the watch-only support is enabled.
   */
  isEnabled(): boolean {
    return this.#enabled;
  }

  /**
   * Creates (or retrieves, if it already exists) a watch-only account for the
   * given address.
   *
   * The watch-only keyring is created atomically if it does not exist yet.
   * The account itself is imported by address: no secret material is ever
   * involved, and the resulting account cannot sign.
   *
   * @param address - The EVM address to import.
   * @returns The keyring account for the imported address.
   * @throws {WatchOnlyAccountDisabledError} If the watch-only support is
   * disabled.
   * @throws If the address is not a valid EVM address.
   */
  async createAccount(address: string): Promise<KeyringAccount> {
    this.#ensureWatchOnlyEnabled();

    await this.#ensureWatchOnlyKeyringExists();

    const accounts = await this.#withWatchOnlyKeyring(async (keyring) =>
      keyring.createAccounts({
        type: AccountCreationType.AddressImport,
        address,
      }),
    );

    const [account] = accounts;
    if (!account) {
      // NOTE: The address is deliberately not included in the error message
      // to avoid leaking it.
      throw new Error('No watch-only account was created.');
    }

    return account;
  }

  /**
   * Ensures that the watch-only support is enabled.
   *
   * @throws {WatchOnlyAccountDisabledError} If the watch-only support is
   * disabled.
   */
  #ensureWatchOnlyEnabled(): void {
    if (!this.#enabled) {
      throw new WatchOnlyAccountDisabledError();
    }
  }

  /**
   * Runs an operation with the watch-only keyring (v2), selected by type.
   *
   * @param operation - The operation to run with the keyring.
   * @returns The result of the operation.
   * @template Result - The type of the value resolved by the operation.
   */
  async #withWatchOnlyKeyring<Result>(
    operation: (keyring: KeyringV2) => Promise<Result>,
  ): Promise<Result> {
    // The result is cast because the callback's return type does not flow
    // through the messenger's action generics.
    return this.#messenger.call(
      'KeyringController:withKeyringV2',
      { type: KeyringType.WatchOnly },
      async ({ keyring }) => await operation(keyring),
    ) as Result;
  }

  /**
   * Ensures that the watch-only keyring exists, creating it if needed.
   *
   * The check and the creation are performed within the same
   * `KeyringController:withController` transaction, so concurrent callers
   * cannot race each other into creating duplicate keyrings.
   */
  async #ensureWatchOnlyKeyringExists(): Promise<void> {
    await this.#messenger.call(
      'KeyringController:withController',
      async (controller) => {
        const hasKeyring = controller.keyrings.some(
          ({ keyring }) => keyring.type === KeyringType.WatchOnly,
        );

        if (!hasKeyring) {
          await controller.addNewKeyring(KeyringType.WatchOnly);
        }
      },
    );
  }
}
