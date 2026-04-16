import type {
  BaseControllerInstance,
  StateMetadataConstraint,
} from '@metamask/base-controller';
import type { Json } from '@metamask/utils';
import type { Patch } from 'immer';

import type { KeyValueStore } from './KeyValueStore';
import type { DefaultInstances, RootMessenger } from '../initialization';

/**
 * Load persisted state from the key-value store and reconstruct it as
 * a record keyed by controller name.
 *
 * Keys in the store follow the format `ControllerName.propertyName`.
 * This function groups them into `{ [controllerName]: { [propertyName]: value } }`.
 *
 * @param store - The key-value store to read from.
 * @returns A record of controller states, suitable for passing to `initialize()`.
 */
export function loadState(store: KeyValueStore): Record<string, Json> {
  const allPairs = store.getAll();
  const state: Record<string, Record<string, Json>> = {};

  for (const [key, value] of Object.entries(allPairs)) {
    const dotIndex = key.indexOf('.');
    if (dotIndex === -1) {
      throw new Error(
        `Invalid key in store: '${key}'. Expected format 'ControllerName.propertyName'.`,
      );
    }
    const controllerName = key.slice(0, dotIndex);
    const propertyName = key.slice(dotIndex + 1);

    if (!state[controllerName]) {
      state[controllerName] = {};
    }
    state[controllerName][propertyName] = value;
  }

  return state;
}

/**
 * Subscribe to all controller `stateChanged` events and persist changes
 * to the key-value store.
 *
 * For each controller instance, this function reads the controller's metadata
 * to determine which state properties are persist-flagged. When a `stateChanged`
 * event fires, it uses the Immer patches to identify which top-level properties
 * changed, filters to only persist-flagged properties, and writes them to the
 * store.
 *
 * @param messenger - The root messenger to subscribe on.
 * @param instances - The controller instances returned by `initialize()`.
 * @param store - The key-value store to write to.
 * @returns A function that unsubscribes all persistence handlers.
 */
export function subscribeToChanges(
  messenger: RootMessenger,
  instances: DefaultInstances,
  store: KeyValueStore,
): () => void {
  const unsubscribers: (() => void)[] = [];

  for (const [controllerName, instance] of Object.entries(instances)) {
    const controller = instance as unknown as BaseControllerInstance;
    const { metadata } = controller;

    const persistedProperties = getPersistPropertyNames(metadata);
    if (persistedProperties.size === 0) {
      continue;
    }

    const eventType = `${controllerName}:stateChanged`;

    const handler = (state: Record<string, Json>, patches: Patch[]): void => {
      const changed = getChangedProperties(patches);

      for (const prop of changed) {
        if (!persistedProperties.has(prop)) {
          continue;
        }

        const key = `${controllerName}.${prop}`;
        const persistFlag = metadata[prop]?.persist;

        if (typeof persistFlag === 'function') {
          store.set(key, persistFlag(state[prop] as never));
        } else {
          store.set(key, state[prop]);
        }
      }
    };

    // @ts-expect-error Event type is dynamically constructed, but we know it's valid.
    messenger.subscribe(eventType, handler);

    unsubscribers.push(() => {
      // @ts-expect-error Event type is dynamically constructed, but we know it's valid.
      messenger.unsubscribe(eventType, handler);
    });
  }

  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  };
}

/**
 * Get the set of property names that have `persist: true` (or a persist deriver)
 * in the given state metadata.
 *
 * @param metadata - The controller's state metadata.
 * @returns A set of property names that should be persisted.
 */
function getPersistPropertyNames(
  metadata: StateMetadataConstraint,
): Set<string> {
  const names = new Set<string>();
  for (const [key, propertyMetadata] of Object.entries(metadata)) {
    if (propertyMetadata.persist) {
      names.add(key);
    }
  }
  return names;
}

/**
 * Extracts the set of top-level property names that changed from an
 * array of Immer patches.
 *
 * @param patches - Immer patches from a state update.
 * @returns A set of top-level property names that were modified.
 */
function getChangedProperties(patches: Patch[]): Set<string> {
  const changed = new Set<string>();
  for (const patch of patches) {
    if (patch.path.length > 0) {
      changed.add(String(patch.path[0]));
    }
  }
  return changed;
}
