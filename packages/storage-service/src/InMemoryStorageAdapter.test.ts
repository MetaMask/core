import { InMemoryStorageAdapter } from './InMemoryStorageAdapter';

describe('InMemoryStorageAdapter', () => {
  describe('getItem', () => {
    it('returns null for non-existent keys', async () => {
      const adapter = new InMemoryStorageAdapter();

      const result = await adapter.getItem('nonExistent');

      expect(result).toBeNull();
    });

    it('retrieves previously stored values', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('testKey', 'testValue');
      const result = await adapter.getItem('testKey');

      expect(result).toBe('testValue');
    });
  });

  describe('setItem', () => {
    it('stores a value', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('key', 'value');
      const result = await adapter.getItem('key');

      expect(result).toBe('value');
    });

    it('overwrites existing values', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('key', 'oldValue');
      await adapter.setItem('key', 'newValue');
      const result = await adapter.getItem('key');

      expect(result).toBe('newValue');
    });

    it('stores large strings', async () => {
      const adapter = new InMemoryStorageAdapter();
      const largeString = 'x'.repeat(1000000); // 1 MB

      await adapter.setItem('large', largeString);
      const result = await adapter.getItem('large');

      expect(result).toBe(largeString);
    });
  });

  describe('removeItem', () => {
    it('removes a stored item', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('key', 'value');
      await adapter.removeItem('key');
      const result = await adapter.getItem('key');

      expect(result).toBeNull();
    });

    it('does not throw when removing non-existent key', async () => {
      const adapter = new InMemoryStorageAdapter();

      await expect(adapter.removeItem('nonExistent')).resolves.toBeUndefined();
    });
  });

  describe('getAllKeys', () => {
    it('returns all stored keys', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('key1', 'value1');
      await adapter.setItem('key2', 'value2');
      await adapter.setItem('key3', 'value3');

      const keys = await adapter.getAllKeys();

      expect(keys).toStrictEqual(expect.arrayContaining(['key1', 'key2', 'key3']));
      expect(keys).toHaveLength(3);
    });

    it('returns empty array when no keys stored', async () => {
      const adapter = new InMemoryStorageAdapter();

      const keys = await adapter.getAllKeys();

      expect(keys).toStrictEqual([]);
    });

    it('reflects removed keys', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('key1', 'value1');
      await adapter.setItem('key2', 'value2');
      await adapter.removeItem('key1');

      const keys = await adapter.getAllKeys();

      expect(keys).toStrictEqual(['key2']);
    });
  });

  describe('clear', () => {
    it('removes all items', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('key1', 'value1');
      await adapter.setItem('key2', 'value2');
      await adapter.setItem('key3', 'value3');

      await adapter.clear();

      const keys = await adapter.getAllKeys();

      expect(keys).toStrictEqual([]);
    });

    it('makes all previously stored items return null', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('key1', 'value1');
      await adapter.setItem('key2', 'value2');
      await adapter.clear();

      expect(await adapter.getItem('key1')).toBeNull();
      expect(await adapter.getItem('key2')).toBeNull();
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
    });

    it('implements all optional methods', () => {
      const adapter = new InMemoryStorageAdapter();

      expect(typeof adapter.getAllKeys).toBe('function');
      expect(typeof adapter.clear).toBe('function');
    });
  });
});

