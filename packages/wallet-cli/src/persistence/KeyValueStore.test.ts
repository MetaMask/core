import type { Json } from '@metamask/utils';
import Sqlite from 'better-sqlite3';
import { unlink } from 'fs/promises';
import os from 'os';
import path from 'path';

import { KeyValueStore } from './KeyValueStore';

describe('KeyValueStore', () => {
  let store: KeyValueStore;

  beforeEach(() => {
    store = new KeyValueStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  describe('set and get', () => {
    it('stores and retrieves a string value', () => {
      store.set('key1', 'hello');
      expect(store.get('key1')).toBe('hello');
    });

    it('stores and retrieves a number value', () => {
      store.set('key1', 42);
      expect(store.get('key1')).toBe(42);
    });

    it('stores and retrieves a boolean value', () => {
      store.set('key1', true);
      expect(store.get('key1')).toBe(true);
    });

    it('stores and retrieves null', () => {
      store.set('key1', null);
      expect(store.get('key1')).toBeNull();
    });

    it('stores and retrieves a complex object', () => {
      const makeValue = (): Json => ({
        nested: { array: [1, 'two', null, { deep: true }] },
      });
      store.set('key1', makeValue());
      expect(store.get('key1')).toStrictEqual(makeValue());
    });

    it('returns undefined for a nonexistent key', () => {
      expect(store.get('missing')).toBeUndefined();
    });

    it('overwrites an existing key', () => {
      store.set('key1', 'first');
      store.set('key1', 'second');
      expect(store.get('key1')).toBe('second');
    });
  });

  describe('getAll', () => {
    it('returns an empty object when the store is empty', () => {
      expect(store.getAll()).toStrictEqual({});
    });

    it('returns all stored key-value pairs', () => {
      store.set('a', 1);
      store.set('b', 'two');
      store.set('c', [3]);
      expect(store.getAll()).toStrictEqual({ a: 1, b: 'two', c: [3] });
    });
  });

  describe('delete', () => {
    it('removes an existing key', () => {
      store.set('key1', 'value');
      store.delete('key1');
      expect(store.get('key1')).toBeUndefined();
    });

    it('does nothing when deleting a nonexistent key', () => {
      expect(() => store.delete('missing')).not.toThrow();
    });
  });

  describe('corrupt data', () => {
    let tempPath: string;
    let corruptStore: KeyValueStore;

    beforeEach(() => {
      tempPath = path.join(os.tmpdir(), `kv-test-${Date.now()}.db`);
      corruptStore = new KeyValueStore(tempPath);

      const rawDb = new Sqlite(tempPath);
      rawDb
        .prepare('INSERT INTO kv (key, value) VALUES (?, ?)')
        .run('bad', 'not json');
      rawDb.close();
    });

    afterEach(async () => {
      corruptStore.close();
      await unlink(tempPath);
    });

    it('throws when get() encounters a non-JSON value', () => {
      expect(() => corruptStore.get('bad')).toThrow(
        "Failed to parse stored value for key 'bad'",
      );
    });

    it('throws when getAll() encounters a non-JSON value', () => {
      expect(() => corruptStore.getAll()).toThrow(
        "Failed to parse stored value for key 'bad'",
      );
    });
  });
});
