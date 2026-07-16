import { jest } from '@jest/globals';
import type { StateMetadataConstraint } from '@metamask/base-controller';
import type { Json } from '@metamask/utils';
import type {
  DefaultActions,
  DefaultEvents,
  RootMessenger,
} from '@metamask/wallet';

import { KeyValueStore } from './KeyValueStore.js';
import { loadState, subscribeToChanges } from './persistence.js';

type TestMessenger = RootMessenger<DefaultActions, DefaultEvents>;

describe('loadState', () => {
  let store: KeyValueStore;

  beforeEach(() => {
    store = new KeyValueStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('returns an empty object when the store is empty', () => {
    expect(loadState(store, {})).toStrictEqual({});
  });

  it('groups keys by controller name', () => {
    store.set('ControllerA.prop1', 'value1');
    store.set('ControllerA.prop2', 42);
    store.set('ControllerB.prop1', [1, 2, 3]);

    const controllerMetadata = createControllerMetadata({
      ControllerA: [
        ['prop1', true],
        ['prop2', true],
      ],
      ControllerB: [['prop1', true]],
    });

    expect(loadState(store, controllerMetadata)).toStrictEqual({
      ControllerA: { prop1: 'value1', prop2: 42 },
      ControllerB: { prop1: [1, 2, 3] },
    });
  });

  it('splits on the first dot only', () => {
    store.set('Controller.prop.with.dots', 'value');

    const controllerMetadata = createControllerMetadata({
      Controller: [['prop.with.dots', true]],
    });

    expect(loadState(store, controllerMetadata)).toStrictEqual({
      Controller: { 'prop.with.dots': 'value' },
    });
  });

  it('rehydrates properties whose persist flag is a deriver function', () => {
    store.set('TestController.derived', 'value');

    const controllerMetadata = createControllerMetadata({
      TestController: [['derived', (value: never): Json => value]],
    });

    expect(loadState(store, controllerMetadata)).toStrictEqual({
      TestController: { derived: 'value' },
    });
  });

  it('skips properties whose persist flag is disabled', () => {
    store.set('TestController.kept', 'keepMe');
    store.set('TestController.dropped', 'staleValue');

    const controllerMetadata = createControllerMetadata({
      TestController: [
        ['kept', true],
        ['dropped', false],
      ],
    });

    expect(loadState(store, controllerMetadata)).toStrictEqual({
      TestController: { kept: 'keepMe' },
    });
  });

  it('skips properties absent from the controller metadata', () => {
    store.set('TestController.kept', 'keepMe');
    store.set('TestController.removed', 'staleValue');

    const controllerMetadata = createControllerMetadata({
      TestController: [['kept', true]],
    });

    expect(loadState(store, controllerMetadata)).toStrictEqual({
      TestController: { kept: 'keepMe' },
    });
  });

  it('skips keys for controllers absent from the metadata', () => {
    store.set('RemovedController.prop', 'staleValue');

    expect(loadState(store, {})).toStrictEqual({});
  });

  it('throws on a key without a dot separator', () => {
    store.set('noDot', 'value');

    expect(() => loadState(store, {})).toThrow(
      "Invalid key in store: 'noDot'. Expected format 'ControllerName.propertyName'.",
    );
  });

  it('throws on a key with an empty controller name', () => {
    store.set('.propName', 'value');

    expect(() => loadState(store, {})).toThrow(
      "Invalid key in store: '.propName'. Both controller name and property name must be non-empty.",
    );
  });

  it('throws on a key with an empty property name', () => {
    store.set('ControllerName.', 'value');

    expect(() => loadState(store, {})).toThrow(
      "Invalid key in store: 'ControllerName.'. Both controller name and property name must be non-empty.",
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
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([
        ['persisted', true],
        ['transient', false],
      ]),
    });

    subscribeToChanges(messenger, controllerMetadata, store);

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
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([
        ['propA', true],
        ['propB', true],
      ]),
    });

    subscribeToChanges(messenger, controllerMetadata, store);

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

    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([['derived', deriver]]),
    });

    subscribeToChanges(messenger, controllerMetadata, store);

    publishStateChanged(messenger, 'TestController', {
      state: { derived: 'hello' },
      patches: [{ op: 'replace', path: ['derived'], value: 'hello' }],
    });

    expect(store.get('TestController.derived')).toBe('HELLO');
  });

  it('logs and skips the write when a deriver result serializes to undefined', () => {
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([
        ['derived', (): Json => undefined as unknown as Json],
      ]),
    });

    const log = jest.fn();
    subscribeToChanges(messenger, controllerMetadata, store, log);

    publishStateChanged(messenger, 'TestController', {
      state: { derived: 'anything' },
      patches: [{ op: 'replace', path: ['derived'], value: 'anything' }],
    });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to persist state for TestController.derived',
      ),
    );
    expect(store.get('TestController.derived')).toBeUndefined();
  });

  it('does not swallow errors thrown by a deriver function', () => {
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([
        [
          'derived',
          (): Json => {
            throw new Error('deriver boom');
          },
        ],
      ]),
    });

    const log = jest.fn();
    subscribeToChanges(messenger, controllerMetadata, store, log);

    expect(() =>
      publishStateChanged(messenger, 'TestController', {
        state: { derived: 'value' },
        patches: [{ op: 'replace', path: ['derived'], value: 'value' }],
      }),
    ).toThrow('deriver boom');

    expect(log).not.toHaveBeenCalled();
  });

  it('handles nested property changes by extracting the top-level key', () => {
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([['nested', true]]),
    });

    subscribeToChanges(messenger, controllerMetadata, store);

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
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([['transientOnly', false]]),
    });

    const unsubscribe = subscribeToChanges(
      messenger,
      controllerMetadata,
      store,
    );

    publishStateChanged(messenger, 'TestController', {
      state: { transientOnly: 'value' },
      patches: [{ op: 'replace', path: ['transientOnly'], value: 'value' }],
    });

    expect(store.getAll()).toStrictEqual({});
    unsubscribe();
  });

  it('returns an unsubscribe function that stops persistence', () => {
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([['prop', true]]),
    });

    const unsubscribe = subscribeToChanges(
      messenger,
      controllerMetadata,
      store,
    );

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

  it('deletes persisted property when it is removed from state', () => {
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([['removable', true]]),
    });

    subscribeToChanges(messenger, controllerMetadata, store);

    // First, persist a value
    publishStateChanged(messenger, 'TestController', {
      state: { removable: 'exists' },
      patches: [{ op: 'replace', path: ['removable'], value: 'exists' }],
    });

    expect(store.get('TestController.removable')).toBe('exists');

    // Now remove it — state no longer contains the property
    publishStateChanged(messenger, 'TestController', {
      state: {},
      patches: [{ op: 'remove', path: ['removable'] }],
    });

    expect(store.get('TestController.removable')).toBeUndefined();
  });

  it('persists all flagged properties on root state replacement', () => {
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([
        ['propA', true],
        ['propB', true],
        ['transient', false],
      ]),
    });

    subscribeToChanges(messenger, controllerMetadata, store);

    publishStateChanged(messenger, 'TestController', {
      state: { propA: 'newA', propB: 'newB', transient: 'skip' },
      patches: [
        {
          op: 'replace',
          path: [],
          value: { propA: 'newA', propB: 'newB', transient: 'skip' },
        },
      ],
    });

    expect(store.get('TestController.propA')).toBe('newA');
    expect(store.get('TestController.propB')).toBe('newB');
    expect(store.get('TestController.transient')).toBeUndefined();
  });

  it('routes store.set failures through the supplied log callback', () => {
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([
        ['propA', true],
        ['propB', true],
      ]),
    });

    const log = jest.fn();
    subscribeToChanges(messenger, controllerMetadata, store, log);

    const error = new Error('disk full');
    const originalSet = store.set.bind(store);
    let callCount = 0;
    jest.spyOn(store, 'set').mockImplementation((key, value) => {
      callCount += 1;
      if (callCount === 1) {
        throw error;
      }
      originalSet(key, value);
    });

    publishStateChanged(messenger, 'TestController', {
      state: { propA: 'a', propB: 'b' },
      patches: [
        { op: 'replace', path: ['propA'], value: 'a' },
        { op: 'replace', path: ['propB'], value: 'b' },
      ],
    });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to persist state for TestController.propA',
      ),
    );
    // propB should still be persisted despite propA failing
    expect(store.get('TestController.propB')).toBe('b');
  });

  it('falls back to console.error when no log callback is supplied', () => {
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([['prop', true]]),
    });

    subscribeToChanges(messenger, controllerMetadata, store);

    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const error = new Error('disk full');
    jest.spyOn(store, 'set').mockImplementationOnce(() => {
      throw error;
    });

    publishStateChanged(messenger, 'TestController', {
      state: { prop: 'value' },
      patches: [{ op: 'replace', path: ['prop'], value: 'value' }],
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Failed to persist state for TestController.prop',
      ),
    );

    consoleSpy.mockRestore();
  });

  it('handles multiple controllers independently', () => {
    const { messenger, controllerMetadata } = createMockControllers({
      ControllerA: createStateMetadata([['data', true]]),
      ControllerB: createStateMetadata([['data', true]]),
    });

    subscribeToChanges(messenger, controllerMetadata, store);

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

describe('subscribeToChanges unsubscribe', () => {
  let store: KeyValueStore;

  beforeEach(() => {
    store = new KeyValueStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('stops persistence so writes to a subsequently closed store do not throw', () => {
    const { messenger, controllerMetadata } = createMockControllers({
      TestController: createStateMetadata([['prop', true]]),
    });

    const unsubscribe = subscribeToChanges(
      messenger,
      controllerMetadata,
      store,
    );

    unsubscribe();
    store.close();

    // This should not throw — the handler was unsubscribed before close.
    expect(() =>
      publishStateChanged(messenger, 'TestController', {
        state: { prop: 'after-close' },
        patches: [{ op: 'replace', path: ['prop'], value: 'after-close' }],
      }),
    ).not.toThrow();
  });
});

type MockMetadata = Record<
  string,
  {
    persist: boolean | ((value: never) => Json);
    includeInDebugSnapshot: boolean;
    includeInStateLogs: boolean;
    usedInUi: boolean;
  }
>;

type MockControllers = {
  messenger: TestMessenger;
  controllerMetadata: Record<string, StateMetadataConstraint>;
};

/**
 * Creates a state metadata object for a mock controller.
 *
 * @param properties - An array of [property name, persist value] pairs.
 * @returns A mock metadata object.
 */
function createStateMetadata(
  properties: [string, boolean | ((value: never) => Json)][],
): MockMetadata {
  return Object.fromEntries(
    properties.map(([name, persist]) => [
      name,
      {
        persist,
        includeInDebugSnapshot: false,
        includeInStateLogs: false,
        usedInUi: false,
      },
    ]),
  );
}

/**
 * Builds a `controllerMetadata` map for `loadState` tests.
 *
 * @param controllers - Map of controller names to an array of
 * [property name, persist value] pairs.
 * @returns A `controllerMetadata` map keyed by controller name.
 */
function createControllerMetadata(
  controllers: Record<string, [string, boolean | ((value: never) => Json)][]>,
): Record<string, StateMetadataConstraint> {
  return Object.fromEntries(
    Object.entries(controllers).map(([name, properties]) => [
      name,
      createStateMetadata(properties),
    ]),
  );
}

/**
 * Creates a mock messenger and controllerMetadata map for testing persistence
 * wiring. The messenger supports subscribe/unsubscribe/publish.
 *
 * @param controllers - Map of controller names to their metadata.
 * @returns A mock messenger and a controllerMetadata map.
 */
function createMockControllers(
  controllers: Record<string, MockMetadata>,
): MockControllers {
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
  } as unknown as TestMessenger;

  const controllerMetadata: Record<string, StateMetadataConstraint> = {};
  for (const [name, metadata] of Object.entries(controllers)) {
    controllerMetadata[name] = metadata;
  }

  return { messenger, controllerMetadata };
}

/**
 * Publishes a stateChanged event on the mock messenger.
 *
 * @param messenger - The mock messenger to publish on.
 * @param controllerName - The name of the controller whose state changed.
 * @param options - The state and patches to publish.
 * @param options.state - The new controller state.
 * @param options.patches - The Immer patches describing the state change.
 */
function publishStateChanged(
  messenger: RootMessenger,
  controllerName: string,
  { state, patches }: { state: Record<string, Json>; patches: unknown[] },
): void {
  // @ts-expect-error Event type is dynamically constructed, but we know it's valid.
  messenger.publish(`${controllerName}:stateChanged`, state, patches);
}
