import { createModuleLogger } from '@metamask/utils';

import { projectLogger } from '../logger.js';
import type {
  AllowedActions,
  TransactionPayControllerMessenger,
} from '../types.js';

const log = createModuleLogger(projectLogger, 'dependencies');

/** Namespaces in {@link AllowedActions} that have no `getState` action. */
type NamespacesWithoutState = 'SentinelApiService';

type DependencyNamespace = Exclude<
  AllowedActions['type'] extends `${infer Namespace}:${string}`
    ? Namespace
    : never,
  NamespacesWithoutState
>;

/**
 * The `getState` action of every controller in {@link AllowedActions}.
 *
 * Adding an action from a new controller to {@link AllowedActions} fails to
 * compile until that controller is added here and its `getState` action is
 * added to {@link AllowedActions}.
 */
const DEPENDENCY_ACTIONS: {
  [Namespace in DependencyNamespace]: `${Namespace}:getState` &
    AllowedActions['type'];
} = {
  AccountTreeController: 'AccountTreeController:getState',
  AccountsController: 'AccountsController:getState',
  AssetsController: 'AssetsController:getState',
  ConfigRegistryController: 'ConfigRegistryController:getState',
  GasFeeController: 'GasFeeController:getState',
  KeyringController: 'KeyringController:getState',
  NetworkController: 'NetworkController:getState',
  RampsController: 'RampsController:getState',
  RemoteFeatureFlagController: 'RemoteFeatureFlagController:getState',
  SnapController: 'SnapController:getState',
  TransactionController: 'TransactionController:getState',
};

/** The `getState` action of every controller this controller depends on. */
export const TRANSACTION_PAY_CONTROLLER_DEPENDENCIES =
  Object.values(DEPENDENCY_ACTIONS);

/** Delay between checks for unregistered dependencies. */
export const DEPENDENCY_RETRY_INTERVAL_MS = 3000;

/** Number of checks for dependencies before giving up. */
export const DEPENDENCY_MAX_ATTEMPTS = 3;

/**
 * Waits until every controller in
 * {@link TRANSACTION_PAY_CONTROLLER_DEPENDENCIES} has registered its
 * `getState` handler, checking every {@link DEPENDENCY_RETRY_INTERVAL_MS}.
 *
 * @param messenger - Controller messenger.
 * @returns True if all dependencies are registered, false if any are still
 * missing after {@link DEPENDENCY_MAX_ATTEMPTS} checks.
 */
export async function waitForDependencies(
  messenger: TransactionPayControllerMessenger,
): Promise<boolean> {
  for (let attempt = 1; attempt <= DEPENDENCY_MAX_ATTEMPTS; attempt++) {
    const missing = getMissingDependencies(messenger);

    if (!missing.length) {
      return true;
    }

    log('Dependencies not registered', { attempt, missing });

    if (attempt < DEPENDENCY_MAX_ATTEMPTS) {
      await new Promise((resolve) =>
        setTimeout(resolve, DEPENDENCY_RETRY_INTERVAL_MS),
      );
    }
  }

  return false;
}

/**
 * Returns the dependency actions whose handlers are not registered.
 *
 * A delegated action is listed by `getRegisteredActionTypes` before the target
 * controller registers its handler, so the action is called instead and the
 * result discarded.
 *
 * @param messenger - Controller messenger.
 * @returns The unregistered dependency actions.
 */
function getMissingDependencies(
  messenger: TransactionPayControllerMessenger,
): string[] {
  return TRANSACTION_PAY_CONTROLLER_DEPENDENCIES.filter((action) => {
    try {
      messenger.call(action);
      return false;
    } catch {
      return true;
    }
  });
}
