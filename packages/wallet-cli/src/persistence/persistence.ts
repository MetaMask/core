import type { StateMetadataConstraint } from '@metamask/base-controller';
import { hasProperty } from '@metamask/utils';
import type { Json } from '@metamask/utils';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '@metamask/wallet';
import type { Patch } from 'immer';

import type { KeyValueStore } from './KeyValueStore';

/**
 * Handler for a controller's `stateChanged` event: the new controller state and
 * the Immer patches describing what changed.
 */
type StateChangedHandler = (
  state: Record<string, Json>,
  patches: Patch[],
) => void;

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
 * Only properties that are currently persist-flagged in `controllerMetadata`
 * are rehydrated. Rows for controllers or properties that no longer exist — or
 * whose `persist` flag has since been disabled — are ignored. This keeps
 * loading symmetric with {@link subscribeToChanges}, which only ever writes
 * persist-flagged properties: without the filter, a migration that stops
 * persisting a property would leave its stale row on disk to be resurrected
 * into the `Wallet` constructor state on the next restart.
 *
 * @param store - The key-value store to read from.
 * @param controllerMetadata - A map from controller name to its state metadata,
 * used to filter out keys that are no longer persist-flagged.
 * @returns A record of controller states, keyed by controller name, suitable
 * for the `state` option of the `Wallet` constructor.
 */
export function loadState(
  store: KeyValueStore,
  controllerMetadata: Readonly<
    Record<string, Readonly<StateMetadataConstraint>>
  >,
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

    if (!isPersisted(controllerMetadata[controllerName], propertyName)) {
      continue;
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
 * For each controller's metadata, this function determines which state
 * properties are persist-flagged. When a `stateChanged` event fires, it uses
 * the Immer patches to identify which top-level properties changed, filters
 * to only persist-flagged properties, and writes them to the store.
 *
 * @param messenger - The root messenger to subscribe on.
 * @param controllerMetadata - A map from controller name to its state metadata.
 * @param store - The key-value store to write to.
 * @param log - Optional logger for persistence-write failures. Defaults to
 * `console.error` when omitted. A daemon host should supply its own logger,
 * since a backgrounded daemon's stdio may be discarded.
 * @returns A function that unsubscribes all persistence handlers.
 */
export function subscribeToChanges(
  messenger: Readonly<RootMessenger<DefaultActions, DefaultEvents>>,
  controllerMetadata: Readonly<
    Record<string, Readonly<StateMetadataConstraint>>
  >,
  store: KeyValueStore,
  log?: (message: string) => void,
): () => void {
  const unsubscribers: (() => void)[] = [];
  const logFn =
    log ??
    ((message: string): void => {
      console.error(message);
    });

  for (const [controllerName, metadata] of Object.entries(controllerMetadata)) {
    const persistedProperties = getPersistPropertyNames(metadata);
    if (persistedProperties.size === 0) {
      continue;
    }

    const eventType = `${controllerName}:stateChanged`;

    const handler: StateChangedHandler = (state, patches) => {
      const changed = getChangedProperties(patches, persistedProperties);

      for (const prop of changed) {
        const key = storeKey(controllerName, prop);
        const removed = !hasProperty(state, prop);

        // Derive the value before the try/catch so a throwing `StateDeriver`
        // surfaces as its own error instead of a misreported write failure.
        const persistFlag = metadata[prop]?.persist;
        const value =
          !removed && typeof persistFlag === 'function'
            ? persistFlag(state[prop] as never)
            : state[prop];

        try {
          if (removed) {
            store.delete(key);
          } else {
            store.set(key, value);
          }
        } catch (error) {
          // TODO: Surface persistence-write failures up the stack so callers
          // can decide to halt rather than continue with diverging in-memory
          // and on-disk state. For now, log and continue.
          logFn(`Failed to persist state for ${key}: ${String(error)}`);
        }
      }
    };

    unsubscribers.push(subscribeToStateChanged(messenger, eventType, handler));
  }

  const unsubscribeAll = (): void => {
    while (unsubscribers.length > 0) {
      unsubscribers.pop()?.();
    }
  };

  return unsubscribeAll;
}

/**
 * Subscribe a handler to a controller's `stateChanged` event.
 *
 * The event name is built from a runtime controller name, so it widens to
 * `string` and cannot be proven to be a literal member of the messenger's event
 * union at compile time. This helper localizes that single unavoidable cast
 * behind a typed {@link StateChangedHandler}, so the `(state, patches)` payload
 * shape stays compile-checked at every call site instead of being erased by a
 * statement-level `@ts-expect-error`.
 *
 * @param messenger - The root messenger to subscribe on.
 * @param eventType - The `${controllerName}:stateChanged` event name.
 * @param handler - The state-change handler to register.
 * @returns A function that unsubscribes the handler.
 */
function subscribeToStateChanged(
  messenger: Readonly<RootMessenger<DefaultActions, DefaultEvents>>,
  eventType: string,
  handler: StateChangedHandler,
): () => void {
  const subscriber = messenger as unknown as {
    subscribe: (eventType: string, handler: StateChangedHandler) => void;
    unsubscribe: (eventType: string, handler: StateChangedHandler) => void;
  };
  subscriber.subscribe(eventType, handler);
  return () => {
    subscriber.unsubscribe(eventType, handler);
  };
}

/**
 * Determine whether a property is currently persist-flagged.
 *
 * The `persist` flag is truthy when it is `true` or a `StateDeriver` function,
 * and falsy when it is `false` or when the controller or property is absent
 * from the metadata. `loadState` and `subscribeToChanges` share this predicate
 * so the read and write paths can never disagree on what counts as persisted.
 *
 * @param metadata - The controller's state metadata, or `undefined` when the
 * controller is absent from the metadata map.
 * @param propertyName - The property name to check.
 * @returns `true` if the property should be persisted.
 */
function isPersisted(
  metadata: Readonly<StateMetadataConstraint> | undefined,
  propertyName: string,
): boolean {
  return Boolean(metadata?.[propertyName]?.persist);
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
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const key of Object.keys(metadata)) {
    if (isPersisted(metadata, key)) {
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
  persistedProperties: ReadonlySet<string>,
): ReadonlySet<string> {
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
