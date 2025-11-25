import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MockAnyNamespace,
  type MessengerActions,
  type MessengerEvents,
} from '@metamask/messenger';

import { StorageService } from './StorageService';
import type { StorageServiceMessenger, StorageAdapter } from './types';

describe('StorageService', () => {
  let consoleWarnSpy: jest.SpyInstance;

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
  });

  describe('getItem', () => {
    it('retrieves and parses stored data', async () => {
      const { service } = getService();

      await service.setItem('TestController', 'testKey', { data: 'test' });
      const result = await service.getItem<{ data: string }>(
        'TestController',
        'testKey',
      );

      expect(result).toStrictEqual({ data: 'test' });
    });

    it('returns null for non-existent keys', async () => {
      const { service } = getService();

      const result = await service.getItem('TestController', 'nonExistent');

      expect(result).toBeNull();
    });

    it('returns what adapter returns (adapter handles parsing)', async () => {
      // Adapter now handles parsing internally and returns null for corrupt data
      const mockStorage: StorageAdapter = {
        getItem: jest.fn().mockResolvedValue(null), // Adapter returns null for corrupt data
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockResolvedValue([]),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      const result = await service.getItem('TestController', 'corrupt');

      expect(result).toBeNull();
    });

    it('handles storage returning null', async () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        getAllKeys: jest.fn().mockResolvedValue([]),
        clear: jest.fn().mockResolvedValue(undefined),
      };
      const { service } = getService({ storage: mockStorage });

      const result = await service.getItem('TestController', 'missing');

      expect(result).toBeNull();
      // Adapter receives namespace and key separately
      expect(mockStorage.getItem).toHaveBeenCalledWith(
        'TestController',
        'missing',
      );
    });

    it('retrieves string values', async () => {
      const { service } = getService();

      await service.setItem('TestController', 'string', 'simple string');
      const result = await service.getItem<string>('TestController', 'string');

      expect(result).toBe('simple string');
    });

    it('retrieves number values', async () => {
      const { service } = getService();

      await service.setItem('TestController', 'number', 42);
      const result = await service.getItem<number>('TestController', 'number');

      expect(result).toBe(42);
    });

    it('retrieves array values', async () => {
      const { service } = getService();
      const array = [1, 2, 3];

      await service.setItem('TestController', 'array', array);
      const result = await service.getItem<number[]>('TestController', 'array');

      expect(result).toStrictEqual(array);
    });
  });

  describe('removeItem', () => {
    it('removes data from storage', async () => {
      const { service } = getService();

      await service.setItem('TestController', 'toRemove', 'value');
      await service.removeItem('TestController', 'toRemove');
      const result = await service.getItem('TestController', 'toRemove');

      expect(result).toBeNull();
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

      expect(await service.getItem('Controller1', 'key')).toBe('value1');
      expect(await service.getItem('Controller2', 'key')).toBeNull();
      expect(await service.getItem('Controller3', 'key')).toBe('value3');
    });
  });

  describe('namespace isolation', () => {
    it('prevents key collisions between namespaces', async () => {
      const { service } = getService();

      await service.setItem('Controller1', 'sameKey', 'value1');
      await service.setItem('Controller2', 'sameKey', 'value2');

      const value1 = await service.getItem('Controller1', 'sameKey');
      const value2 = await service.getItem('Controller2', 'sameKey');

      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
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

      const result = await rootMessenger.call(
        'StorageService:getItem',
        'TestController',
        'key',
      );

      expect(result).toBe('value');
    });

    it('exposes getItem as messenger action', async () => {
      const { service, rootMessenger } = getService();

      await service.setItem('TestController', 'key', 'value');

      const result = await rootMessenger.call(
        'StorageService:getItem',
        'TestController',
        'key',
      );

      expect(result).toBe('value');
    });

    it('exposes removeItem as messenger action', async () => {
      const { service, rootMessenger } = getService();

      await service.setItem('TestController', 'key', 'value');
      await rootMessenger.call(
        'StorageService:removeItem',
        'TestController',
        'key',
      );

      const result = await service.getItem('TestController', 'key');

      expect(result).toBeNull();
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
      const bitcoinSource = await service.getItem<string>(
        'SnapController',
        'npm:@metamask/bitcoin-wallet-snap:sourceCode',
      );

      expect(bitcoinSource).toBe(
        snaps['npm:@metamask/bitcoin-wallet-snap'].sourceCode,
      );

      // Clear all snap data
      await service.clear('SnapController');
      const keysAfterClear = await service.getAllKeys('SnapController');

      expect(keysAfterClear).toStrictEqual([]);
    });

    it('delegates getAllKeys to adapter', async () => {
      const mockStorage: StorageAdapter = {
        getItem: jest.fn().mockResolvedValue(null),
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
        getItem: jest.fn().mockResolvedValue(null),
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
