import type { Json } from '@metamask/utils';

import { KeyValueStore } from './KeyValueStore';
import { loadState, subscribeToChanges } from './persistence';
import type { RootMessenger, DefaultInstances } from '../initialization';

describe('loadState', () => {
  let store: KeyValueStore;

  beforeEach(() => {
    store = new KeyValueStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('returns an empty object when the store is empty', () => {
    expect(loadState(store)).toStrictEqual({});
  });

  it('groups keys by controller name', () => {
    store.set('ControllerA.prop1', 'value1');
    store.set('ControllerA.prop2', 42);
    store.set('ControllerB.prop1', [1, 2, 3]);

    expect(loadState(store)).toStrictEqual({
      ControllerA: { prop1: 'value1', prop2: 42 },
      ControllerB: { prop1: [1, 2, 3] },
    });
  });

  it('splits on the first dot only', () => {
    store.set('Controller.prop.with.dots', 'value');

    expect(loadState(store)).toStrictEqual({
      Controller: { 'prop.with.dots': 'value' },
    });
  });

  it('throws on a key without a dot separator', () => {
    store.set('noDot', 'value');

    expect(() => loadState(store)).toThrow(
      "Invalid key in store: 'noDot'. Expected format 'ControllerName.propertyName'.",
    );
  });
});

describe('subscribeToChanges', () => {
  let store: KeyValueStore;

  beforeEach(() => {
    store = new KeyValueStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('writes persist-flagged properties on state change', () => {
    const { messenger, instances } = createMockSetup({
      TestController: {
        metadata: {
          persisted: {
            persist: true,
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            usedInUi: false,
          },
          transient: {
            persist: false,
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            usedInUi: false,
          },
        },
      },
    });

    subscribeToChanges(messenger, instances, store);

    publishStateChanged(messenger, 'TestController', {
      state: { persisted: 'savedValue', transient: 'notSaved' },
      patches: [
        { op: 'replace', path: ['persisted'], value: 'savedValue' },
        { op: 'replace', path: ['transient'], value: 'notSaved' },
      ],
    });

    expect(store.get('TestController.persisted')).toBe('savedValue');
    expect(store.get('TestController.transient')).toBeUndefined();
  });

  it('only writes properties that are in the patches', () => {
    const { messenger, instances } = createMockSetup({
      TestController: {
        metadata: {
          propA: {
            persist: true,
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            usedInUi: false,
          },
          propB: {
            persist: true,
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            usedInUi: false,
          },
        },
      },
    });

    subscribeToChanges(messenger, instances, store);

    publishStateChanged(messenger, 'TestController', {
      state: { propA: 'changedA', propB: 'unchangedB' },
      patches: [{ op: 'replace', path: ['propA'], value: 'changedA' }],
    });

    expect(store.get('TestController.propA')).toBe('changedA');
    expect(store.get('TestController.propB')).toBeUndefined();
  });

  it('applies StateDeriver functions before writing', () => {
    const deriver = (value: never): Json =>
      (value as unknown as string).toUpperCase();

    const { messenger, instances } = createMockSetup({
      TestController: {
        metadata: {
          derived: {
            persist: deriver,
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            usedInUi: false,
          },
        },
      },
    });

    subscribeToChanges(messenger, instances, store);

    publishStateChanged(messenger, 'TestController', {
      state: { derived: 'hello' },
      patches: [{ op: 'replace', path: ['derived'], value: 'hello' }],
    });

    expect(store.get('TestController.derived')).toBe('HELLO');
  });

  it('handles nested property changes by extracting the top-level key', () => {
    const { messenger, instances } = createMockSetup({
      TestController: {
        metadata: {
          nested: {
            persist: true,
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            usedInUi: false,
          },
        },
      },
    });

    subscribeToChanges(messenger, instances, store);

    publishStateChanged(messenger, 'TestController', {
      state: { nested: { inner: { deep: 'value' } } },
      patches: [
        { op: 'replace', path: ['nested', 'inner', 'deep'], value: 'value' },
      ],
    });

    expect(store.get('TestController.nested')).toStrictEqual({
      inner: { deep: 'value' },
    });
  });

  it('skips controllers with no persisted properties', () => {
    const { messenger, instances } = createMockSetup({
      TestController: {
        metadata: {
          transientOnly: {
            persist: false,
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            usedInUi: false,
          },
        },
      },
    });

    const unsubscribe = subscribeToChanges(messenger, instances, store);

    publishStateChanged(messenger, 'TestController', {
      state: { transientOnly: 'value' },
      patches: [{ op: 'replace', path: ['transientOnly'], value: 'value' }],
    });

    expect(store.getAll()).toStrictEqual({});
    unsubscribe();
  });

  it('returns an unsubscribe function that stops persistence', () => {
    const { messenger, instances } = createMockSetup({
      TestController: {
        metadata: {
          prop: {
            persist: true,
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            usedInUi: false,
          },
        },
      },
    });

    const unsubscribe = subscribeToChanges(messenger, instances, store);

    publishStateChanged(messenger, 'TestController', {
      state: { prop: 'first' },
      patches: [{ op: 'replace', path: ['prop'], value: 'first' }],
    });

    expect(store.get('TestController.prop')).toBe('first');

    unsubscribe();

    publishStateChanged(messenger, 'TestController', {
      state: { prop: 'second' },
      patches: [{ op: 'replace', path: ['prop'], value: 'second' }],
    });

    expect(store.get('TestController.prop')).toBe('first');
  });

  it('handles multiple controllers independently', () => {
    const { messenger, instances } = createMockSetup({
      ControllerA: {
        metadata: {
          data: {
            persist: true,
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            usedInUi: false,
          },
        },
      },
      ControllerB: {
        metadata: {
          data: {
            persist: true,
            includeInDebugSnapshot: false,
            includeInStateLogs: false,
            usedInUi: false,
          },
        },
      },
    });

    subscribeToChanges(messenger, instances, store);

    publishStateChanged(messenger, 'ControllerA', {
      state: { data: 'fromA' },
      patches: [{ op: 'replace', path: ['data'], value: 'fromA' }],
    });

    publishStateChanged(messenger, 'ControllerB', {
      state: { data: 'fromB' },
      patches: [{ op: 'replace', path: ['data'], value: 'fromB' }],
    });

    expect(store.get('ControllerA.data')).toBe('fromA');
    expect(store.get('ControllerB.data')).toBe('fromB');
  });
});

// --- Test helpers ---

type MockControllerConfig = {
  metadata: Record<
    string,
    {
      persist: boolean | ((value: never) => Json);
      includeInDebugSnapshot: boolean;
      includeInStateLogs: boolean;
      usedInUi: boolean;
    }
  >;
};

type MockSetup = {
  messenger: RootMessenger;
  instances: DefaultInstances;
};

/**
 * Creates a mock messenger and instances map for testing persistence wiring.
 * The messenger supports subscribe/unsubscribe/publish for stateChanged events.
 *
 * @param controllers - Map of controller names to their mock configurations.
 * @returns A mock messenger and instances map.
 */
function createMockSetup(
  controllers: Record<string, MockControllerConfig>,
): MockSetup {
  const handlers = new Map<string, Set<(...args: unknown[]) => void>>();

  const messenger = {
    subscribe: (eventType: string, handler: (...args: unknown[]) => void) => {
      if (!handlers.has(eventType)) {
        handlers.set(eventType, new Set());
      }
      handlers.get(eventType)?.add(handler);
    },
    unsubscribe: (eventType: string, handler: (...args: unknown[]) => void) => {
      handlers.get(eventType)?.delete(handler);
    },
    publish: (eventType: string, ...payload: unknown[]) => {
      const subs = handlers.get(eventType);
      if (subs) {
        for (const handler of subs) {
          handler(...payload);
        }
      }
    },
  } as unknown as RootMessenger;

  const instances: Record<string, unknown> = {};
  for (const [name, config] of Object.entries(controllers)) {
    instances[name] = { metadata: config.metadata };
  }

  return { messenger, instances: instances as unknown as DefaultInstances };
}

/**
 * Publishes a stateChanged event on the mock messenger.
 *
 * @param messenger - The mock messenger to publish on.
 * @param controllerName - The name of the controller whose state changed.
 * @param options0 - The state and patches to publish.
 * @param options0.state - The new controller state.
 * @param options0.patches - The Immer patches describing the state change.
 */
function publishStateChanged(
  messenger: RootMessenger,
  controllerName: string,
  { state, patches }: { state: Record<string, Json>; patches: unknown[] },
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (messenger as any).publish(`${controllerName}:stateChanged`, state, patches);
}
