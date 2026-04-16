import type { StateMetadataConstraint } from '@metamask/base-controller';
import { hasProperty } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import type { Patch } from 'immer';

import type { DefaultInstances, RootMessenger } from '../initialization';
import type { KeyValueStore } from './KeyValueStore';

/**
 * A controller instance that has a `metadata` property describing which
 * state properties should be persisted.
 */
type PersistableController = {
  metadata: StateMetadataConstraint;
};

/**
 * Construct a store key from a controller name and property name.
 *
 * @param controllerName - The controller name.
 * @param propertyName - The property name.
 * @returns The store key in the format `ControllerName.propertyName`.
 */
function storeKey(controllerName: string, propertyName: string): string {
  return `${controllerName}.${propertyName}`;
}

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
export function loadState(
  store: KeyValueStore,
): Record<string, Record<string, Json>> {
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

    if (!controllerName || !propertyName) {
      throw new Error(
        `Invalid key in store: '${key}'. Both controller name and property name must be non-empty.`,
      );
    }

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
    const controller = instance as unknown as PersistableController;
    const { metadata } = controller;

    const persistedProperties = getPersistPropertyNames(metadata);
    if (persistedProperties.size === 0) {
      continue;
    }

    const eventType = `${controllerName}:stateChanged`;

    const handler = (state: Record<string, Json>, patches: Patch[]): void => {
      const changed = getChangedProperties(patches, persistedProperties);

      for (const prop of changed) {
        const key = storeKey(controllerName, prop);

        try {
          if (!hasProperty(state, prop)) {
            store.delete(key);
            continue;
          }

          const persistFlag = metadata[prop]?.persist;

          if (typeof persistFlag === 'function') {
            store.set(key, persistFlag(state[prop] as never));
          } else {
            store.set(key, state[prop]);
          }
        } catch (error) {
          // TODO: Handle persistence failure to protect the user from data loss.
          console.error(`Failed to persist state for ${key}`, error);
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
 * Get the set of property names whose `persist` metadata is truthy
 * (either `true` or a `StateDeriver` function).
 *
 * @param metadata - The controller's state metadata.
 * @returns A set of property names that should be persisted.
 */
function getPersistPropertyNames(
  metadata: StateMetadataConstraint,
): Set<string> {
  const names = new Set<string>();
  for (const key of Object.keys(metadata)) {
    if (metadata[key].persist) {
      names.add(key);
    }
  }
  return names;
}

/**
 * Extracts the set of persist-flagged top-level property names that changed
 * from an array of Immer patches.
 *
 * If any patch has an empty path (indicating a root state replacement),
 * all persist-flagged properties are returned.
 *
 * @param patches - Immer patches from a state update.
 * @param persistedProperties - The set of persist-flagged property names.
 * @returns A set of top-level property names that were modified.
 */
function getChangedProperties(
  patches: Patch[],
  persistedProperties: Set<string>,
): Set<string> {
  const changed = new Set<string>();
  for (const patch of patches) {
    if (patch.path.length === 0) {
      return persistedProperties;
    }

    const prop = String(patch.path[0]);
    if (persistedProperties.has(prop)) {
      changed.add(prop);
    }
  }
  return changed;
}
