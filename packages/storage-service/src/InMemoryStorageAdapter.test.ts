import { InMemoryStorageAdapter } from './InMemoryStorageAdapter';

describe('InMemoryStorageAdapter', () => {
  describe('getItem', () => {
    it('returns empty object {} for non-existent keys', async () => {
      const adapter = new InMemoryStorageAdapter();

      const response = await adapter.getItem('TestNamespace', 'nonExistent');

      expect(response).toStrictEqual({});
    });

    it('returns { result } with previously stored values', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'testKey', 'testValue');
      const response = await adapter.getItem('TestNamespace', 'testKey');

      expect(response).toStrictEqual({ result: 'testValue' });
    });

    it('returns { result: null } when null was explicitly stored', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'nullKey', null);
      const response = await adapter.getItem('TestNamespace', 'nullKey');

      // This is different from {} - data WAS found, and it was null
      expect(response).toStrictEqual({ result: null });
    });

    it('returns { error } when stored data is corrupted', async () => {
      const adapter = new InMemoryStorageAdapter();
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      const parseError = new SyntaxError('Unexpected token');

      // Store valid data first
      await adapter.setItem('TestNamespace', 'corruptKey', 'validValue');

      // Mock JSON.parse to throw on the next call (simulating corruption)
      const originalParse = JSON.parse;
      jest.spyOn(JSON, 'parse').mockImplementationOnce(() => {
        throw parseError;
      });

      const response = await adapter.getItem('TestNamespace', 'corruptKey');

      expect(response).toStrictEqual({ error: parseError });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse stored data'),
        parseError,
      );

      // Restore
      JSON.parse = originalParse;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('setItem', () => {
    it('stores a value that can be retrieved', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 'value');
      const response = await adapter.getItem('TestNamespace', 'key');

      expect(response).toStrictEqual({ result: 'value' });
    });

    it('stores objects', async () => {
      const adapter = new InMemoryStorageAdapter();
      const obj = { foo: 'bar', num: 123 };

      await adapter.setItem('TestNamespace', 'key', obj);
      const response = await adapter.getItem('TestNamespace', 'key');

      expect(response).toStrictEqual({ result: obj });
    });

    it('stores strings', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 'string value');
      const response = await adapter.getItem('TestNamespace', 'key');

      expect(response).toStrictEqual({ result: 'string value' });
    });

    it('stores numbers', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 42);
      const response = await adapter.getItem('TestNamespace', 'key');

      expect(response).toStrictEqual({ result: 42 });
    });

    it('stores booleans', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', true);
      const response = await adapter.getItem('TestNamespace', 'key');

      expect(response).toStrictEqual({ result: true });
    });

    it('overwrites existing values', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 'oldValue');
      await adapter.setItem('TestNamespace', 'key', 'newValue');
      const response = await adapter.getItem('TestNamespace', 'key');

      expect(response).toStrictEqual({ result: 'newValue' });
    });
  });

  describe('removeItem', () => {
    it('removes a stored item', async () => {
      const adapter = new InMemoryStorageAdapter();

      await adapter.setItem('TestNamespace', 'key', 'value');
      await adapter.removeItem('TestNamespace', 'key');
      const response = await adapter.getItem('TestNamespace', 'key');

      // After removal, key doesn't exist - returns empty object
      expect(response).toStrictEqual({});
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

      expect(await adapter.getItem('Namespace1', 'key')).toStrictEqual({});
      expect(await adapter.getItem('Namespace2', 'key')).toStrictEqual({
        result: 'value2',
      });
    });
  });

  describe('data isolation', () => {
    it('different instances have isolated storage', async () => {
      const adapter1 = new InMemoryStorageAdapter();
      const adapter2 = new InMemoryStorageAdapter();

      await adapter1.setItem('TestNamespace', 'key', 'value1');
      await adapter2.setItem('TestNamespace', 'key', 'value2');

      expect(await adapter1.getItem('TestNamespace', 'key')).toStrictEqual({
        result: 'value1',
      });
      expect(await adapter2.getItem('TestNamespace', 'key')).toStrictEqual({
        result: 'value2',
      });
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
