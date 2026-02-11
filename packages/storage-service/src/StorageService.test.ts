import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { StorageService } from './StorageService';
import type { StorageServiceMessenger, StorageAdapter } from './types';

describe('StorageService', () => {
  let consoleWarnSpy: jest.SpiedFunction;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('constructor', () => {
    it('uses provided storage adapter', () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockResolvedValue([]),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      expect(service).toBeInstanceOf(StorageService);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('defaults to InMemoryStorageAdapter when no storage provided', () => {
      const { service } = getService();

      expect(service).toBeInstanceOf(StorageService);
    });

    it('logs warning when using in-memory storage', () => {
      getService();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No storage adapter provided'),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Data will be lost on restart'),
      );
    });
  });

  describe('setItem', () => {
    it('delegates to adapter with namespace and key', async () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockResolvedValue([]),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      await service.setItem('TestController', 'testKey', 'testValue');

      // Adapter receives namespace and key separately (adapter handles key building)
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'TestController',
        'testKey',
        'testValue',
      );
    });

    it('passes complex objects to adapter', async () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockResolvedValue([]),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });
      const complexObject = { foo: 'bar', nested: { value: 123 } };

      await service.setItem('TestController', 'complex', complexObject);

      // Adapter handles serialization
      expect(mockStorage.setItem).toHaveBeenCalledWith(
        'TestController',
        'complex',
        complexObject,
      );
    });

    it('handles storage errors gracefully', async () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn(),
        setItem: jest
          .fn()
          .mockRejectedValue(new Error('Storage quota exceeded')),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockResolvedValue([]),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      await expect(
        service.setItem('TestController', 'key', 'value'),
      ).rejects.toThrow('Storage quota exceeded');
    });

    it('publishes itemSet event with key and value', async () => {
      const { service, rootMessenger } = getService();
      const eventHandler = jest.fn();

      rootMessenger.subscribe(
        'StorageService:itemSet:TestController' as `StorageService:itemSet:${string}`,
        eventHandler,
      );

      await service.setItem('TestController', 'myKey', { data: 'test' });

      expect(eventHandler).toHaveBeenCalledTimes(1);
      expect(eventHandler).toHaveBeenCalledWith('myKey', { data: 'test' });
    });

    it('publishes itemSet event only for matching namespace', async () => {
      const { service, rootMessenger } = getService();
      const controller1Handler = jest.fn();

      rootMessenger.subscribe(
        'StorageService:itemSet:Controller1' as `StorageService:itemSet:${string}`,
        controller1Handler,
      );

      await service.setItem('Controller1', 'key', 'value1');
      await service.setItem('Controller2', 'key', 'value2');

      expect(controller1Handler).toHaveBeenCalledTimes(1);
      expect(controller1Handler).toHaveBeenCalledWith('key', 'value1');
    });
  });

  describe('getItem', () => {
    it('returns { result } with stored data when key exists', async () => {
      const { service } = getService();

      await service.setItem('TestController', 'testKey', { data: 'test' });
      const response = await service.getItem('TestController', 'testKey');

      expect(response).toStrictEqual({ result: { data: 'test' } });
    });

    it('returns empty object {} for non-existent keys', async () => {
      const { service } = getService();

      const response = await service.getItem('TestController', 'nonExistent');

      expect(response).toStrictEqual({});
    });

    it('returns empty object {} when adapter returns not found', async () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn().mockResolvedValue({}), // Adapter returns {} for not found
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockResolvedValue([]),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      const response = await service.getItem('TestController', 'missing');

      expect(response).toStrictEqual({});
      expect(mockStorage.getItem).toHaveBeenCalledWith(
        'TestController',
        'missing',
      );
    });

    it('returns { error } when adapter returns error', async () => {
      const testError = new Error('Parse error');
      const mockStorage: StorageAdapter = {
        getItem: jest.fn().mockResolvedValue({ error: testError }),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockResolvedValue([]),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      const response = await service.getItem('TestController', 'corrupt');

      expect(response).toStrictEqual({ error: testError });
    });

    it('returns { result } with string values', async () => {
      const { service } = getService();

      await service.setItem('TestController', 'string', 'simple string');
      const response = await service.getItem('TestController', 'string');

      expect(response).toStrictEqual({ result: 'simple string' });
    });

    it('returns { result } with number values', async () => {
      const { service } = getService();

      await service.setItem('TestController', 'number', 42);
      const response = await service.getItem('TestController', 'number');

      expect(response).toStrictEqual({ result: 42 });
    });

    it('returns { result } with array values', async () => {
      const { service } = getService();
      const array = [1, 2, 3];

      await service.setItem('TestController', 'array', array);
      const response = await service.getItem('TestController', 'array');

      expect(response).toStrictEqual({ result: array });
    });

    it('returns { result: null } when null was explicitly stored', async () => {
      const { service } = getService();

      await service.setItem('TestController', 'nullValue', null);
      const response = await service.getItem('TestController', 'nullValue');

      // This is different from {} - data WAS found, and it was null
      expect(response).toStrictEqual({ result: null });
    });
  });

  describe('removeItem', () => {
    it('removes data from storage', async () => {
      const { service } = getService();

      await service.setItem('TestController', 'toRemove', 'value');
      await service.removeItem('TestController', 'toRemove');
      const response = await service.getItem('TestController', 'toRemove');

      // After removal, key doesn't exist - returns empty object
      expect(response).toStrictEqual({});
    });

    it('removes key from registry', async () => {
      const { service } = getService();

      await service.setItem('TestController', 'key1', 'value1');
      await service.setItem('TestController', 'key2', 'value2');
      await service.removeItem('TestController', 'key1');
      const keys = await service.getAllKeys('TestController');

      expect(keys).toStrictEqual(['key2']);
    });
  });

  describe('getAllKeys', () => {
    it('delegates to storage adapter with namespace', async () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockResolvedValue(['key1', 'key2']),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      const keys = await service.getAllKeys('TestController');

      expect(mockStorage.getAllKeys).toHaveBeenCalledWith('TestController');
      expect(keys).toStrictEqual(['key1', 'key2']);
    });

    it('returns keys from default in-memory adapter', async () => {
      const { service } = getService(); // Uses InMemoryAdapter

      await service.setItem('TestController', 'key1', 'value1');
      await service.setItem('TestController', 'key2', 'value2');
      await service.setItem('OtherController', 'key3', 'value3');

      const keys = await service.getAllKeys('TestController');

      expect(keys).toStrictEqual(expect.arrayContaining(['key1', 'key2']));
      expect(keys).toHaveLength(2);
    });

    it('returns empty array for namespace with no keys', async () => {
      const { service } = getService();

      const keys = await service.getAllKeys('EmptyController');

      expect(keys).toStrictEqual([]);
    });

    it('delegates to adapter for namespace filtering', async () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockResolvedValue([]),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      const keys = await service.getAllKeys('NonExistentController');

      expect(mockStorage.getAllKeys).toHaveBeenCalledWith(
        'NonExistentController',
      );
      expect(keys).toStrictEqual([]);
    });
  });

  describe('clear', () => {
    it('delegates to storage adapter', async () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockResolvedValue([]),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      await service.clear('TestController');

      expect(mockStorage.clear).toHaveBeenCalledWith('TestController');
    });

    it('clears namespace using default in-memory adapter', async () => {
      const { service } = getService();

      await service.setItem('TestController', 'key1', 'value1');
      await service.setItem('TestController', 'key2', 'value2');
      await service.setItem('OtherController', 'key3', 'value3');

      await service.clear('TestController');

      const testKeys = await service.getAllKeys('TestController');
      const otherKeys = await service.getAllKeys('OtherController');

      expect(testKeys).toStrictEqual([]);
      expect(otherKeys).toStrictEqual(['key3']);
    });

    it('does not affect other namespaces', async () => {
      const { service } = getService();

      await service.setItem('Controller1', 'key', 'value1');
      await service.setItem('Controller2', 'key', 'value2');
      await service.setItem('Controller3', 'key', 'value3');

      await service.clear('Controller2');

      expect(await service.getItem('Controller1', 'key')).toStrictEqual({
        result: 'value1',
      });
      expect(await service.getItem('Controller2', 'key')).toStrictEqual({});
      expect(await service.getItem('Controller3', 'key')).toStrictEqual({
        result: 'value3',
      });
    });
  });

  describe('namespace isolation', () => {
    it('prevents key collisions between namespaces', async () => {
      const { service } = getService();

      await service.setItem('Controller1', 'sameKey', 'value1');
      await service.setItem('Controller2', 'sameKey', 'value2');

      const response1 = await service.getItem('Controller1', 'sameKey');
      const response2 = await service.getItem('Controller2', 'sameKey');

      expect(response1).toStrictEqual({ result: 'value1' });
      expect(response2).toStrictEqual({ result: 'value2' });
    });

    it('getAllKeys only returns keys for specified namespace', async () => {
      const { service } = getService();

      await service.setItem('SnapController', 'snap1', 'data1');
      await service.setItem('SnapController', 'snap2', 'data2');
      await service.setItem('TokensController', 'token1', 'data3');

      const snapKeys = await service.getAllKeys('SnapController');
      const tokenKeys = await service.getAllKeys('TokensController');

      expect(snapKeys).toStrictEqual(
        expect.arrayContaining(['snap1', 'snap2']),
      );
      expect(snapKeys).toHaveLength(2);
      expect(tokenKeys).toStrictEqual(['token1']);
    });
  });

  describe('messenger actions', () => {
    it('exposes setItem as messenger action', async () => {
      const { rootMessenger } = getService();

      await rootMessenger.call(
        'StorageService:setItem',
        'TestController',
        'key',
        'value',
      );

      const response = await rootMessenger.call(
        'StorageService:getItem',
        'TestController',
        'key',
      );

      expect(response).toStrictEqual({ result: 'value' });
    });

    it('exposes getItem as messenger action', async () => {
      const { service, rootMessenger } = getService();

      await service.setItem('TestController', 'key', 'value');

      const response = await rootMessenger.call(
        'StorageService:getItem',
        'TestController',
        'key',
      );

      expect(response).toStrictEqual({ result: 'value' });
    });

    it('exposes removeItem as messenger action', async () => {
      const { service, rootMessenger } = getService();

      await service.setItem('TestController', 'key', 'value');
      await rootMessenger.call(
        'StorageService:removeItem',
        'TestController',
        'key',
      );

      const response = await service.getItem('TestController', 'key');

      expect(response).toStrictEqual({});
    });

    it('exposes getAllKeys as messenger action', async () => {
      const { service, rootMessenger } = getService();

      await service.setItem('TestController', 'key1', 'value1');
      await service.setItem('TestController', 'key2', 'value2');

      const keys = await rootMessenger.call(
        'StorageService:getAllKeys',
        'TestController',
      );

      expect(keys).toStrictEqual(expect.arrayContaining(['key1', 'key2']));
    });

    it('exposes clear as messenger action', async () => {
      const { service, rootMessenger } = getService();

      await service.setItem('TestController', 'key1', 'value1');
      await service.setItem('TestController', 'key2', 'value2');

      await rootMessenger.call('StorageService:clear', 'TestController');

      const keys = await service.getAllKeys('TestController');

      expect(keys).toStrictEqual([]);
    });
  });

  describe('real-world usage scenario', () => {
    it('simulates SnapController storing and retrieving source code', async () => {
      const { service } = getService();

      // Simulate storing 5 snap source codes (like production)
      const snaps = {
        'npm:@metamask/bitcoin-wallet-snap': {
          sourceCode: 'a'.repeat(3864960),
        }, // ~3.86 MB
        'npm:@metamask/tron-wallet-snap': { sourceCode: 'b'.repeat(1089930) }, // ~1.09 MB
        'npm:@metamask/solana-wallet-snap': { sourceCode: 'c'.repeat(603890) }, // ~603 KB
        'npm:@metamask/ens-resolver-snap': { sourceCode: 'd'.repeat(371590) }, // ~371 KB
        'npm:@metamask/message-signing-snap': {
          sourceCode: 'e'.repeat(159030),
        }, // ~159 KB
      };

      // Store all source codes
      for (const [snapId, snap] of Object.entries(snaps)) {
        await service.setItem(
          'SnapController',
          `${snapId}:sourceCode`,
          snap.sourceCode,
        );
      }

      // Verify all keys are tracked
      const keys = await service.getAllKeys('SnapController');
      expect(keys).toHaveLength(5);

      // Retrieve specific snap source code
      const response = await service.getItem(
        'SnapController',
        'npm:@metamask/bitcoin-wallet-snap:sourceCode',
      );

      expect(response).toStrictEqual({
        result: snaps['npm:@metamask/bitcoin-wallet-snap'].sourceCode,
      });

      // Clear all snap data
      await service.clear('SnapController');
      const keysAfterClear = await service.getAllKeys('SnapController');

      expect(keysAfterClear).toStrictEqual([]);
    });

    it('delegates getAllKeys to adapter', async () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn().mockResolvedValue({}),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest
          .fn()
          .mockResolvedValue(['snap1:sourceCode', 'snap2:sourceCode']),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      const keys = await service.getAllKeys('SnapController');

      expect(mockStorage.getAllKeys).toHaveBeenCalledWith('SnapController');
      expect(keys).toStrictEqual(['snap1:sourceCode', 'snap2:sourceCode']);
    });

    it('adapter handles namespace filtering', async () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn().mockResolvedValue({}),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockImplementation((namespace) => {
          // Adapter filters by namespace
          if (namespace === 'TestController') {
            return Promise.resolve(['key1', 'key2']);
          }
          return Promise.resolve([]);
        }),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      await service.setItem('TestController', 'key1', 'value1');
      await service.setItem('TestController', 'key2', 'value2');

      const keys = await service.getAllKeys('TestController');

      expect(mockStorage.getAllKeys).toHaveBeenCalledWith('TestController');
      expect(keys).toStrictEqual(['key1', 'key2']);
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the service under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<StorageServiceMessenger>,
  MessengerEvents<StorageServiceMessenger>
>;

/**
 * Constructs the messenger populated with all external actions and events
 * required by the service under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the service under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the service's messenger.
 * @returns The service-specific messenger.
 */
function getMessenger(rootMessenger: RootMessenger): StorageServiceMessenger {
  return new Messenger({
    namespace: 'StorageService',
    parent: rootMessenger,
  });
}

/**
 * Constructs the service under test.
 *
 * @param args - The arguments to this function.
 * @param args.storage - Optional storage adapter to use.
 * @returns The new service, root messenger, and service messenger.
 */
function getService({
  storage,
}: {
  storage?: StorageAdapter;
} = {}): {
  service: StorageService;
  rootMessenger: RootMessenger;
  messenger: StorageServiceMessenger;
} {
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const service = new StorageService({
    messenger,
    storage,
  });

  return { service, rootMessenger, messenger };
}
