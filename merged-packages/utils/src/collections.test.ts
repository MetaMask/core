import { FrozenMap, FrozenSet } from './collections';

describe('FrozenMap', () => {
  describe('immutability', () => {
    it('has the expected class properties', () => {
      // i.e., does not have 'delete', 'set', or 'clear'
      expect(Object.getOwnPropertyNames(FrozenMap.prototype))
        .toMatchInlineSnapshot(`
        Array [
          "constructor",
          "size",
          "entries",
          "forEach",
          "get",
          "has",
          "keys",
          "values",
          "toString",
        ]
      `);
    });

    it('is frozen and cannot be mutated', () => {
      const frozenMap: any = new FrozenMap();
      expect(frozenMap.set).toBeUndefined();
      expect(frozenMap.clear).toBeUndefined();

      expect(Object.isFrozen(frozenMap)).toBe(true);
      expect(Object.isFrozen(frozenMap.prototype)).toBe(true);

      expect(Object.isFrozen(FrozenMap)).toBe(true);
      expect(Object.isFrozen(FrozenMap.prototype)).toBe(true);
    });
  });

  describe('iteration', () => {
    it('can be used as an iterator', () => {
      const input = [
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ] as const;
      const map = new Map([...input]);
      const frozenMap = new FrozenMap([...input]);

      let callCount = 0;
      for (const [key, value] of frozenMap) {
        expect(map.get(key)).toStrictEqual(value);
        callCount += 1;
      }
      expect(callCount).toStrictEqual(frozenMap.size);
    });
  });

  describe('entries', () => {
    it('matches the behavior of Map.entries()', () => {
      const mapEntries = new Map([
        ['a', 1],
        ['b', 2],
      ]).entries();
      const frozenMapEntries = new FrozenMap([
        ['a', 1],
        ['b', 2],
      ]).entries();

      for (const key of frozenMapEntries) {
        expect(key).toStrictEqual(mapEntries.next().value);
      }

      expect(mapEntries.next()).toStrictEqual({ done: true, value: undefined });
      expect(frozenMapEntries.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });

  describe('forEach', () => {
    it('iterates over the map', () => {
      const expected = new Map([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);
      const deleteSpy = jest.spyOn(expected, 'delete');

      const frozenMap = new FrozenMap([
        ['a', 1],
        ['b', 2],
        ['c', 3],
      ]);

      frozenMap.forEach((value, key) => {
        expect(value).toStrictEqual(expected.get(key));
        expected.delete(key);
      });

      expect(deleteSpy).toHaveBeenCalledTimes(frozenMap.size);
      expect(expected.size).toBe(0);
    });

    it('defaults `thisArg` to undefined', () => {
      const frozenMap = new FrozenMap([['a', 1]]);
      frozenMap.forEach(function () {
        // @ts-expect-error: We have to shadow `this` here.
        expect(this).toBeUndefined(); // eslint-disable-line no-invalid-this
      });
    });

    it('respects the specified `thisArg`', () => {
      const frozenMap = new FrozenMap([['a', 1]]);

      const thisArg = {};
      frozenMap.forEach(function () {
        // @ts-expect-error: We have to shadow `this` here.
        expect(this).toBe(thisArg); // eslint-disable-line no-invalid-this
      }, thisArg);
    });

    it('does not provide a reference to the inner map via the callback', () => {
      const frozenMap = new FrozenMap([['a', 1]]);
      frozenMap.forEach((_value, _key, map) => {
        expect(map).not.toBeInstanceOf(Map);
        expect(map).toBeInstanceOf(FrozenMap);
      });
    });
  });

  describe('get', () => {
    it('matches the behavior of Map.get()', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const frozenMap = new FrozenMap([
        ['a', 1],
        ['b', 2],
      ]);

      ['a', 'b', 'c'].forEach((key) => {
        expect(frozenMap.get(key)).toStrictEqual(map.get(key));
      });
    });
  });

  describe('has', () => {
    it('matches the behavior of Map.has()', () => {
      const map = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const frozenMap = new FrozenMap([
        ['a', 1],
        ['b', 2],
      ]);

      ['a', 'b', 'c'].forEach((key) => {
        expect(frozenMap.has(key)).toStrictEqual(map.has(key));
      });
    });
  });

  describe('keys', () => {
    it('matches the behavior of Map.keys()', () => {
      const mapKeys = new Map([
        ['a', 1],
        ['b', 2],
      ]).keys();
      const frozenMapKeys = new FrozenMap([
        ['a', 1],
        ['b', 2],
      ]).keys();

      for (const key of frozenMapKeys) {
        expect(key).toStrictEqual(mapKeys.next().value);
      }

      expect(mapKeys.next()).toStrictEqual({ done: true, value: undefined });
      expect(frozenMapKeys.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });

  describe('values', () => {
    it('matches the behavior of Map.values()', () => {
      const mapValues = new Map([
        ['a', 1],
        ['b', 2],
      ]).values();
      const frozenMapValues = new FrozenMap([
        ['a', 1],
        ['b', 2],
      ]).values();

      for (const key of frozenMapValues) {
        expect(key).toStrictEqual(mapValues.next().value);
      }

      expect(mapValues.next()).toStrictEqual({ done: true, value: undefined });
      expect(frozenMapValues.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });

  describe('toString', () => {
    it('stringifies as expected', () => {
      expect(new FrozenMap().toString()).toMatchInlineSnapshot(
        `"FrozenMap(0) {}"`,
      );

      expect(new FrozenMap([['a', 1]]).toString()).toMatchInlineSnapshot(
        `"FrozenMap(1) { a => 1 }"`,
      );

      expect(
        new FrozenMap([
          ['a', 1],
          ['b', 2],
          ['c', 3],
        ]).toString(),
      ).toMatchInlineSnapshot(`"FrozenMap(3) { a => 1, b => 2, c => 3 }"`);
    });
  });
});

describe('FrozenSet', () => {
  describe('immutability', () => {
    it('has the expected class properties', () => {
      // i.e., does not have 'delete', 'add', or 'clear'
      expect(Object.getOwnPropertyNames(FrozenSet.prototype))
        .toMatchInlineSnapshot(`
        Array [
          "constructor",
          "size",
          "entries",
          "forEach",
          "has",
          "keys",
          "values",
          "toString",
        ]
      `);
    });

    it('is frozen and cannot be mutated', () => {
      const frozenSet: any = new FrozenSet();
      expect(frozenSet.set).toBeUndefined();
      expect(frozenSet.clear).toBeUndefined();

      expect(Object.isFrozen(frozenSet)).toBe(true);
      expect(Object.isFrozen(frozenSet.prototype)).toBe(true);

      expect(Object.isFrozen(FrozenSet)).toBe(true);
      expect(Object.isFrozen(FrozenSet.prototype)).toBe(true);
    });
  });

  describe('iteration', () => {
    it('can be used as an iterator', () => {
      const input = ['a', 'b', 'c'];
      const set = new Set([...input]);
      const frozenSet = new FrozenSet([...input]);

      let callCount = 0;
      for (const value of frozenSet) {
        expect(set.has(value)).toBe(true);
        callCount += 1;
      }
      expect(callCount).toStrictEqual(frozenSet.size);
    });
  });

  describe('entries', () => {
    it('matches the behavior of Set.entries()', () => {
      const setEntries = new Set([
        ['a', 1],
        ['b', 2],
      ]).entries();
      const frozenSetEntries = new FrozenSet([
        ['a', 1],
        ['b', 2],
      ]).entries();

      for (const key of frozenSetEntries) {
        expect(key).toStrictEqual(setEntries.next().value);
      }

      expect(setEntries.next()).toStrictEqual({ done: true, value: undefined });
      expect(frozenSetEntries.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });

  describe('forEach', () => {
    it('iterates over the set', () => {
      const expected = new Set(['a', 'b', 'c']);
      const deleteSpy = jest.spyOn(expected, 'delete');

      const frozenSet = new FrozenSet(['a', 'b', 'c']);

      frozenSet.forEach((value, value2) => {
        expect(value).toBe(value2);
        expected.delete(value);
      });

      expect(deleteSpy).toHaveBeenCalledTimes(frozenSet.size);
      expect(expected.size).toBe(0);
    });

    it('defaults `thisArg` to undefined', () => {
      const frozenSet = new FrozenSet(['a']);
      frozenSet.forEach(function () {
        // @ts-expect-error: We have to shadow `this` here.
        expect(this).toBeUndefined(); // eslint-disable-line no-invalid-this
      });
    });

    it('respects the specified `thisArg`', () => {
      const frozenSet = new FrozenSet(['a']);

      const thisArg = {};
      frozenSet.forEach(function () {
        // @ts-expect-error: We have to shadow `this` here.
        expect(this).toBe(thisArg); // eslint-disable-line no-invalid-this
      }, thisArg);
    });

    it('does not provide a reference to the inner set via the callback', () => {
      const frozenSet = new FrozenSet([['a', 1]]);
      frozenSet.forEach((_value, _value2, set) => {
        expect(set).not.toBeInstanceOf(Set);
        expect(set).toBeInstanceOf(FrozenSet);
      });
    });
  });

  describe('has', () => {
    it('matches the behavior of Set.has()', () => {
      const set = new Set(['a', 'b']);
      const frozenSet = new FrozenSet(['a', 'b']);

      ['a', 'b', 'c'].forEach((value) => {
        expect(frozenSet.has(value)).toStrictEqual(set.has(value));
      });
    });
  });

  describe('keys', () => {
    it('matches the behavior of Set.keys()', () => {
      const setKeys = new Set([
        ['a', 1],
        ['b', 2],
      ]).keys();
      const frozenSetKeys = new FrozenSet([
        ['a', 1],
        ['b', 2],
      ]).keys();

      for (const key of frozenSetKeys) {
        expect(key).toStrictEqual(setKeys.next().value);
      }

      expect(setKeys.next()).toStrictEqual({ done: true, value: undefined });
      expect(frozenSetKeys.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });

  describe('values', () => {
    it('matches the behavior of Set.values()', () => {
      const setValues = new Set([
        ['a', 1],
        ['b', 2],
      ]).values();
      const frozenSetValues = new FrozenSet([
        ['a', 1],
        ['b', 2],
      ]).values();

      for (const key of frozenSetValues) {
        expect(key).toStrictEqual(setValues.next().value);
      }

      expect(setValues.next()).toStrictEqual({ done: true, value: undefined });
      expect(frozenSetValues.next()).toStrictEqual({
        done: true,
        value: undefined,
      });
    });
  });

  describe('toString', () => {
    it('stringifies as expected', () => {
      expect(new FrozenSet().toString()).toMatchInlineSnapshot(
        `"FrozenSet(0) {}"`,
      );

      expect(new FrozenSet(['a']).toString()).toMatchInlineSnapshot(
        `"FrozenSet(1) { a }"`,
      );

      expect(new FrozenSet(['a', 'b', 'c']).toString()).toMatchInlineSnapshot(
        `"FrozenSet(3) { a, b, c }"`,
      );
    });
  });
});
