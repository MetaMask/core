import {
  normalizeScope,
  mergeNormalizedScopes,
  mergeInternalScopes,
  mergeScopeObject,
  normalizeAndMergeScopes,
} from './transform';
import type {
  ExternalScopeObject,
  NormalizedScopeObject,
  InternalScopesObject,
} from './types';

const externalScopeObject: ExternalScopeObject = {
  methods: [],
  notifications: [],
};

const validScopeObject: NormalizedScopeObject = {
  methods: [],
  notifications: [],
  accounts: [],
};

describe('Scope Transform', () => {
  describe('normalizeScope', () => {
    describe('scopeString is chain scoped', () => {
      it('returns the scope with empty accounts array when accounts are not defined', () => {
        expect(normalizeScope('eip155:1', externalScopeObject)).toStrictEqual({
          'eip155:1': {
            ...externalScopeObject,
            accounts: [],
          },
        });
      });

      it('returns the scope unchanged when accounts are defined', () => {
        expect(
          normalizeScope('eip155:1', { ...externalScopeObject, accounts: [] }),
        ).toStrictEqual({
          'eip155:1': {
            ...externalScopeObject,
            accounts: [],
          },
        });
      });
    });

    describe('scopeString is namespace scoped', () => {
      it('returns the scope as is when `references` is not defined', () => {
        expect(normalizeScope('eip155', validScopeObject)).toStrictEqual({
          eip155: validScopeObject,
        });
      });

      it('returns one scope per `references` element with `references` excluded from the scopeObject', () => {
        expect(
          normalizeScope('eip155', {
            ...validScopeObject,
            references: ['1', '5', '64'],
          }),
        ).toStrictEqual({
          'eip155:1': validScopeObject,
          'eip155:5': validScopeObject,
          'eip155:64': validScopeObject,
        });
      });

      it('returns one deep cloned scope per `references` element', () => {
        const normalizedScopes = normalizeScope('eip155', {
          ...validScopeObject,
          references: ['1', '5'],
        });

        expect(normalizedScopes['eip155:1']).not.toBe(
          normalizedScopes['eip155:5'],
        );
        expect(normalizedScopes['eip155:1'].methods).not.toBe(
          normalizedScopes['eip155:5'].methods,
        );
      });

      it('returns the scope as is when `references` is an empty array', () => {
        expect(
          normalizeScope('eip155', { ...validScopeObject, references: [] }),
        ).toStrictEqual({
          eip155: validScopeObject,
        });
      });
    });
  });

  describe('mergeScopeObject', () => {
    it('returns an object with the unique set of methods', () => {
      expect(
        mergeScopeObject(
          {
            ...validScopeObject,
            methods: ['a', 'b', 'c'],
          },
          {
            ...validScopeObject,
            methods: ['b', 'c', 'd'],
          },
        ),
      ).toStrictEqual({
        ...validScopeObject,
        methods: ['a', 'b', 'c', 'd'],
      });
    });

    it('returns an object with the unique set of notifications', () => {
      expect(
        mergeScopeObject(
          {
            ...validScopeObject,
            notifications: ['a', 'b', 'c'],
          },
          {
            ...validScopeObject,
            notifications: ['b', 'c', 'd'],
          },
        ),
      ).toStrictEqual({
        ...validScopeObject,
        notifications: ['a', 'b', 'c', 'd'],
      });
    });

    it('returns an object with the unique set of accounts', () => {
      expect(
        mergeScopeObject(
          {
            ...validScopeObject,
            accounts: ['eip155:1:a', 'eip155:1:b', 'eip155:1:c'],
          },
          {
            ...validScopeObject,
            accounts: ['eip155:1:b', 'eip155:1:c', 'eip155:1:d'],
          },
        ),
      ).toStrictEqual({
        ...validScopeObject,
        accounts: ['eip155:1:a', 'eip155:1:b', 'eip155:1:c', 'eip155:1:d'],
      });

      expect(
        mergeScopeObject(
          {
            ...validScopeObject,
            accounts: ['eip155:1:a', 'eip155:1:b', 'eip155:1:c'],
          },
          {
            ...validScopeObject,
          },
        ),
      ).toStrictEqual({
        ...validScopeObject,
        accounts: ['eip155:1:a', 'eip155:1:b', 'eip155:1:c'],
      });
    });

    it('returns an object with the unique set of rpcDocuments', () => {
      expect(
        mergeScopeObject(
          {
            ...validScopeObject,
            rpcDocuments: ['a', 'b', 'c'],
          },
          {
            ...validScopeObject,
            rpcDocuments: ['b', 'c', 'd'],
          },
        ),
      ).toStrictEqual({
        ...validScopeObject,
        rpcDocuments: ['a', 'b', 'c', 'd'],
      });

      expect(
        mergeScopeObject(
          {
            ...validScopeObject,
            rpcDocuments: ['a', 'b', 'c'],
          },
          {
            ...validScopeObject,
          },
        ),
      ).toStrictEqual({
        ...validScopeObject,
        rpcDocuments: ['a', 'b', 'c'],
      });

      expect(
        mergeScopeObject(
          {
            ...validScopeObject,
          },
          {
            ...validScopeObject,
            rpcDocuments: ['a', 'b', 'c'],
          },
        ),
      ).toStrictEqual({
        ...validScopeObject,
        rpcDocuments: ['a', 'b', 'c'],
      });
    });

    it('returns an object with the unique set of rpcEndpoints', () => {
      expect(
        mergeScopeObject(
          {
            ...validScopeObject,
            rpcEndpoints: ['a', 'b', 'c'],
          },
          {
            ...validScopeObject,
            rpcEndpoints: ['b', 'c', 'd'],
          },
        ),
      ).toStrictEqual({
        ...validScopeObject,
        rpcEndpoints: ['a', 'b', 'c', 'd'],
      });

      expect(
        mergeScopeObject(
          {
            ...validScopeObject,
            rpcEndpoints: ['a', 'b', 'c'],
          },
          {
            ...validScopeObject,
          },
        ),
      ).toStrictEqual({
        ...validScopeObject,
        rpcEndpoints: ['a', 'b', 'c'],
      });

      expect(
        mergeScopeObject(
          {
            ...validScopeObject,
          },
          {
            ...validScopeObject,
            rpcEndpoints: ['a', 'b', 'c'],
          },
        ),
      ).toStrictEqual({
        ...validScopeObject,
        rpcEndpoints: ['a', 'b', 'c'],
      });
    });
  });

  describe('mergeInternalScopes', () => {
    describe('incremental request existing scope with a new account', () => {
      it('should return merged scope with existing chain and both accounts', () => {
        const leftValue: InternalScopesObject = {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        };

        const rightValue: InternalScopesObject = {
          'eip155:1': {
            accounts: ['eip155:1:0xbeef'],
          },
        };

        const expectedMergedValue: InternalScopesObject = {
          'eip155:1': { accounts: ['eip155:1:0xdead', 'eip155:1:0xbeef'] },
        };

        const mergedValue = mergeInternalScopes(leftValue, rightValue);

        expect(mergedValue).toStrictEqual(expectedMergedValue);
      });
    });

    describe('incremental request a whole new scope without accounts', () => {
      it('should return merged scope with previously existing chain and accounts, plus new requested chain with no accounts', () => {
        const leftValue: InternalScopesObject = {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        };

        const rightValue: InternalScopesObject = {
          'eip155:10': {
            accounts: [],
          },
        };

        const expectedMergedValue: InternalScopesObject = {
          'eip155:1': { accounts: ['eip155:1:0xdead'] },
          'eip155:10': {
            accounts: [],
          },
        };

        const mergedValue = mergeInternalScopes(leftValue, rightValue);

        expect(mergedValue).toStrictEqual(expectedMergedValue);
      });
    });

    describe('incremental request a whole new scope with accounts', () => {
      it('should return merged scope with previously existing chain and accounts, plus new requested chain with new account', () => {
        const leftValue: InternalScopesObject = {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        };

        const rightValue: InternalScopesObject = {
          'eip155:10': {
            accounts: ['eip155:10:0xbeef'],
          },
        };

        const expectedMergedValue: InternalScopesObject = {
          'eip155:1': { accounts: ['eip155:1:0xdead'] },
          'eip155:10': { accounts: ['eip155:10:0xbeef'] },
        };

        const mergedValue = mergeInternalScopes(leftValue, rightValue);

        expect(mergedValue).toStrictEqual(expectedMergedValue);
      });
    });

    describe('incremental request an existing scope with new accounts, and whole new scope with accounts', () => {
      it('should return merged scope with previously existing chain and accounts, plus new requested chain with new accounts', () => {
        const leftValue: InternalScopesObject = {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        };

        const rightValue: InternalScopesObject = {
          'eip155:1': {
            accounts: ['eip155:1:0xdead', 'eip155:1:0xbeef'],
          },
          'eip155:10': {
            accounts: ['eip155:10:0xdead', 'eip155:10:0xbeef'],
          },
        };

        const expectedMergedValue: InternalScopesObject = {
          'eip155:1': { accounts: ['eip155:1:0xdead', 'eip155:1:0xbeef'] },
          'eip155:10': {
            accounts: ['eip155:10:0xdead', 'eip155:10:0xbeef'],
          },
        };

        const mergedValue = mergeInternalScopes(leftValue, rightValue);

        expect(mergedValue).toStrictEqual(expectedMergedValue);
      });
    });

    describe('incremental request an existing scope with new accounts, and 2 whole new scope with accounts', () => {
      it('should return merged scope with previously existing chain and accounts, plus new requested chains with new accounts', () => {
        const leftValue: InternalScopesObject = {
          'eip155:1': {
            accounts: ['eip155:1:0xdead'],
          },
        };

        const rightValue: InternalScopesObject = {
          'eip155:1': {
            accounts: ['eip155:1:0xdead', 'eip155:1:0xbadd'],
          },
          'eip155:10': {
            accounts: ['eip155:10:0xbeef', 'eip155:10:0xbadd'],
          },
          'eip155:426161': {
            accounts: [
              'eip155:426161:0xdead',
              'eip155:426161:0xbeef',
              'eip155:426161:0xbadd',
            ],
          },
        };

        const expectedMergedValue: InternalScopesObject = {
          'eip155:1': { accounts: ['eip155:1:0xdead', 'eip155:1:0xbadd'] },
          'eip155:10': {
            accounts: ['eip155:10:0xbeef', 'eip155:10:0xbadd'],
          },
          'eip155:426161': {
            accounts: [
              'eip155:426161:0xdead',
              'eip155:426161:0xbeef',
              'eip155:426161:0xbadd',
            ],
          },
        };

        const mergedValue = mergeInternalScopes(leftValue, rightValue);

        expect(mergedValue).toStrictEqual(expectedMergedValue);
      });
    });
  });

  describe('mergeNormalizedScopes', () => {
    it('merges the scopeObjects with matching scopeString', () => {
      expect(
        mergeNormalizedScopes(
          {
            'eip155:1': {
              methods: ['a', 'b', 'c'],
              notifications: ['foo'],
              accounts: [],
            },
          },
          {
            'eip155:1': {
              methods: ['c', 'd'],
              notifications: ['bar'],
              accounts: [],
            },
          },
        ),
      ).toStrictEqual({
        'eip155:1': {
          methods: ['a', 'b', 'c', 'd'],
          notifications: ['foo', 'bar'],
          accounts: [],
        },
      });
    });

    it('preserves the scopeObjects with no matching scopeString', () => {
      expect(
        mergeNormalizedScopes(
          {
            'eip155:1': {
              methods: ['a', 'b', 'c'],
              notifications: ['foo'],
              accounts: [],
            },
          },
          {
            'eip155:2': {
              methods: ['c', 'd'],
              notifications: ['bar'],
              accounts: [],
            },
            'eip155:3': {
              methods: [],
              notifications: [],
              accounts: [],
            },
          },
        ),
      ).toStrictEqual({
        'eip155:1': {
          methods: ['a', 'b', 'c'],
          notifications: ['foo'],
          accounts: [],
        },
        'eip155:2': {
          methods: ['c', 'd'],
          notifications: ['bar'],
          accounts: [],
        },
        'eip155:3': {
          methods: [],
          notifications: [],
          accounts: [],
        },
      });
    });
    it('returns an empty object when no scopes are provided', () => {
      expect(mergeNormalizedScopes({}, {})).toStrictEqual({});
    });

    it('returns an unchanged scope when two identical scopeObjects are provided', () => {
      expect(
        mergeNormalizedScopes(
          { 'eip155:1': validScopeObject },
          { 'eip155:1': validScopeObject },
        ),
      ).toStrictEqual({ 'eip155:1': validScopeObject });
    });
  });

  describe('normalizeAndMergeScopes', () => {
    it('normalizes scopes and merges any overlapping scopeStrings', () => {
      expect(
        normalizeAndMergeScopes({
          eip155: {
            ...validScopeObject,
            methods: ['a', 'b'],
            references: ['1', '5'],
          },
          'eip155:1': {
            ...validScopeObject,
            methods: ['b', 'c', 'd'],
          },
        }),
      ).toStrictEqual({
        'eip155:1': {
          ...validScopeObject,
          methods: ['a', 'b', 'c', 'd'],
        },
        'eip155:5': {
          ...validScopeObject,
          methods: ['a', 'b'],
        },
      });
    });
    it('returns an empty object when no scopes are provided', () => {
      expect(normalizeAndMergeScopes({})).toStrictEqual({});
    });
    it('return an unchanged scope when scopeObjects are already normalized (i.e. none contain references to flatten)', () => {
      expect(
        normalizeAndMergeScopes({
          'eip155:1': validScopeObject,
          'eip155:2': validScopeObject,
          'eip155:3': validScopeObject,
        }),
      ).toStrictEqual({
        'eip155:1': validScopeObject,
        'eip155:2': validScopeObject,
        'eip155:3': validScopeObject,
      });
    });
  });
});
