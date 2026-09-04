import type { AccountGroupId } from '@metamask/account-api';
import { AccountId } from '@metamask/keyring-utils';

/*
 * NOTE: The types below intentionally duplicate definitions from
 * `@metamask/account-tree-controller`. They are mirrored here to break a
 * package-level circular dependency:
 *
 *   account-tree-controller -> multichain-account-service -> snap-account-service
 *   -> account-tree-controller
 *
 * `multichain-account-service` legitimately depends on `snap-account-service`
 * (for `:ensureReady`), and `account-tree-controller` legitimately depends on
 * `multichain-account-service`. Importing `AccountTreeController` types here
 * would close the cycle and crash `ts-bridge` with a stack overflow during
 * project-reference builds.
 *
 * Keep these signatures in sync with `@metamask/account-tree-controller`.
 */

/**
 * Minimal shape of an account group object as consumed by
 * {@link SnapAccountService}. Only the `accounts` field is read at runtime;
 * the rest of the structure is intentionally omitted to keep this mirror
 * narrow. See the note above.
 */
export type AccountGroupObject = {
  id: AccountGroupId;
  accounts: AccountId[];
};

/**
 * Mirror of `AccountTreeControllerGetAccountGroupObjectAction`.
 */
export type AccountTreeControllerGetAccountGroupObjectAction = {
  type: `AccountTreeController:getAccountGroupObject`;
  handler: (groupId: AccountGroupId) => AccountGroupObject | undefined;
};

/**
 * Mirror of `AccountTreeControllerGetSelectedAccountGroupAction`.
 */
export type AccountTreeControllerGetSelectedAccountGroupAction = {
  type: `AccountTreeController:getSelectedAccountGroup`;
  handler: () => AccountGroupId | '';
};

/**
 * Mirror of `AccountTreeControllerSelectedAccountGroupChangeEvent`.
 */
export type AccountTreeControllerSelectedAccountGroupChangeEvent = {
  type: `AccountTreeController:selectedAccountGroupChange`;
  payload: [AccountGroupId | '', AccountGroupId | ''];
};

/**
 * Mirror of `AccountTreeControllerAccountGroupCreatedEvent`.
 */
export type AccountTreeControllerAccountGroupCreatedEvent = {
  type: `AccountTreeController:accountGroupCreated`;
  payload: [AccountGroupObject];
};

/**
 * Mirror of `AccountTreeControllerAccountGroupUpdatedEvent`.
 */
export type AccountTreeControllerAccountGroupUpdatedEvent = {
  type: `AccountTreeController:accountGroupUpdated`;
  payload: [AccountGroupObject];
};

/**
 * Mirror of `AccountTreeControllerAccountGroupRemovedEvent`.
 */
export type AccountTreeControllerAccountGroupRemovedEvent = {
  type: `AccountTreeController:accountGroupRemoved`;
  payload: [AccountGroupId];
};
