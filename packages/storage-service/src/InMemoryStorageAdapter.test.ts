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
    it('stores a value', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 'value');
      const result = await adapter.getItem('TestNamespace', 'key');

      expect(result).toBe('value');
    });

    it('overwrites existing values', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 'oldValue');
      await adapter.setItem('TestNamespace', 'key', 'newValue');
      const result = await adapter.getItem('TestNamespace', 'key');

      expect(result).toBe('newValue');
    });

    it('stores large strings', async () => {
      const adapter = new InMemoryStorageAdapter();
      const largeString = 'x'.repeat(1000000); // 1 MB

      await adapter.setItem('TestNamespace', 'large', largeString);
      const result = await adapter.getItem('TestNamespace', 'large');

      expect(result).toBe(largeString);
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

      await expect(adapter.removeItem('TestNamespace', 'nonExistent')).resolves.toBeUndefined();
    });
  });

  describe('getAllKeys', () => {
    it('returns keys for a namespace', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'storageService:TestController:key1', 'value1');
      await adapter.setItem('TestNamespace', 'storageService:TestController:key2', 'value2');
      await adapter.setItem('TestNamespace', 'storageService:OtherController:key3', 'value3');

      const keys = await adapter.getAllKeys('TestController');

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

      await adapter.setItem('TestNamespace', 'storageService:TestController:my-key', 'value');

      const keys = await adapter.getAllKeys('TestController');

      expect(keys).toStrictEqual(['my-key']);
      expect(keys[0]).not.toContain('storage:');
      expect(keys[0]).not.toContain('TestController:');
    });
  });

  describe('clear', () => {
    it('removes all items for a namespace', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'storageService:TestController:key1', 'value1');
      await adapter.setItem('TestNamespace', 'storageService:TestController:key2', 'value2');
      await adapter.setItem('TestNamespace', 'storageService:OtherController:key3', 'value3');

      await adapter.clear('TestController');

      const testKeys = await adapter.getAllKeys('TestController');
      const otherKeys = await adapter.getAllKeys('OtherController');

      expect(testKeys).toStrictEqual([]);
      expect(otherKeys).toStrictEqual(['key3']);
    });

    it('does not affect other namespaces', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'storageService:Controller1:key', 'value1');
      await adapter.setItem('TestNamespace', 'storageService:Controller2:key', 'value2');

      await adapter.clear('Controller1');

      expect(await adapter.getItem('TestNamespace', 'storageService:Controller1:key')).toBeNull();
      expect(await adapter.getItem('TestNamespace', 'storageService:Controller2:key')).toBe('value2');
    });
  });

  describe('data isolation', () => {
    it('different instances have isolated storage', async () => {
      const adapter1 = new InMemoryStorageAdapter();
      const adapter2 = new InMemoryStorageAdapter();

      await adapter1.setItem('key', 'value1');
      await adapter2.setItem('key', 'value2');

      expect(await adapter1.getItem('key')).toBe('value1');
      expect(await adapter2.getItem('key')).toBe('value2');
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
});

