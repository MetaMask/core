import { InMemoryStorageAdapter } from './InMemoryStorageAdapter';

describe('InMemoryStorageAdapter', () => {
  describe('getItem', () => {
    it('returns null for non-existent keys', async () => {
      const adapter = new InMemoryStorageAdapter();

      const result = await adapter.getItem('TestNamespace', 'nonExistent');

      expect(result).toBeNull();
    });

    it('retrieves previously stored values', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'testKey', 'testValue');
      const result = await adapter.getItem('TestNamespace', 'testKey');

      expect(result).toBe('testValue');
    });
  });

  describe('setItem', () => {
    it('stores a value with wrapper', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 'value');
      const result = await adapter.getItem('TestNamespace', 'key');

      expect(result).toBe('value');
    });

    it('stores objects', async () => {
      const adapter = new InMemoryStorageAdapter();
      const obj = { foo: 'bar', num: 123 };

      await adapter.setItem('TestNamespace', 'key', obj);
      const result = await adapter.getItem('TestNamespace', 'key');

      expect(result).toStrictEqual(obj);
    });

    it('stores strings', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 'string value');
      const result = await adapter.getItem('TestNamespace', 'key');

      expect(result).toBe('string value');
    });

    it('stores numbers', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 42);
      const result = await adapter.getItem('TestNamespace', 'key');

      expect(result).toBe(42);
    });

    it('stores booleans', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', true);
      const result = await adapter.getItem('TestNamespace', 'key');

      expect(result).toBe(true);
    });

    it('overwrites existing values', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 'oldValue');
      await adapter.setItem('TestNamespace', 'key', 'newValue');
      const result = await adapter.getItem('TestNamespace', 'key');

      expect(result).toBe('newValue');
    });
  });

  describe('removeItem', () => {
    it('removes a stored item', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 'value');
      await adapter.removeItem('TestNamespace', 'key');
      const result = await adapter.getItem('TestNamespace', 'key');

      expect(result).toBeNull();
    });

    it('does not throw when removing non-existent key', async () => {
      const adapter = new InMemoryStorageAdapter();

      const result = await adapter.removeItem('TestNamespace', 'nonExistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getAllKeys', () => {
    it('returns keys for a namespace', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key1', 'value1');
      await adapter.setItem('TestNamespace', 'key2', 'value2');
      await adapter.setItem('OtherNamespace', 'key3', 'value3');

      const keys = await adapter.getAllKeys('TestNamespace');

      expect(keys).toStrictEqual(expect.arrayContaining(['key1', 'key2']));
      expect(keys).toHaveLength(2);
    });

    it('returns empty array when no keys for namespace', async () => {
      const adapter = new InMemoryStorageAdapter();

      const keys = await adapter.getAllKeys('EmptyNamespace');

      expect(keys).toStrictEqual([]);
    });

    it('strips prefix from returned keys', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'my-key', 'value');

      const keys = await adapter.getAllKeys('TestNamespace');

      expect(keys).toStrictEqual(['my-key']);
      expect(keys[0]).not.toContain('storageService:');
      expect(keys[0]).not.toContain('TestNamespace:');
    });
  });

  describe('clear', () => {
    it('removes all items for a namespace', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key1', 'value1');
      await adapter.setItem('TestNamespace', 'key2', 'value2');
      await adapter.setItem('OtherNamespace', 'key3', 'value3');

      await adapter.clear('TestNamespace');

      const testKeys = await adapter.getAllKeys('TestNamespace');
      const otherKeys = await adapter.getAllKeys('OtherNamespace');

      expect(testKeys).toStrictEqual([]);
      expect(otherKeys).toStrictEqual(['key3']);
    });

    it('does not affect other namespaces', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('Namespace1', 'key', 'value1');
      await adapter.setItem('Namespace2', 'key', 'value2');

      await adapter.clear('Namespace1');

      expect(await adapter.getItem('Namespace1', 'key')).toBeNull();
      expect(await adapter.getItem('Namespace2', 'key')).toBe('value2');
    });
  });

  describe('data isolation', () => {
    it('different instances have isolated storage', async () => {
      const adapter1 = new InMemoryStorageAdapter();
      const adapter2 = new InMemoryStorageAdapter();

      await adapter1.setItem('TestNamespace', 'key', 'value1');
      await adapter2.setItem('TestNamespace', 'key', 'value2');

      expect(await adapter1.getItem('TestNamespace', 'key')).toBe('value1');
      expect(await adapter2.getItem('TestNamespace', 'key')).toBe('value2');
    });
  });

  describe('implements StorageAdapter interface', () => {
    it('implements all required methods', () => {
      const adapter = new InMemoryStorageAdapter();

      expect(typeof adapter.getItem).toBe('function');
      expect(typeof adapter.setItem).toBe('function');
      expect(typeof adapter.removeItem).toBe('function');
      expect(typeof adapter.getAllKeys).toBe('function');
      expect(typeof adapter.clear).toBe('function');
    });
  });

  // Note: Error handling for corrupted data is covered by istanbul ignore
  // since private fields (#storage) can't be accessed to inject bad data
});
