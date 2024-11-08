import type { ExternalScopeObject } from './types';
import { isValidScope, validateScopes } from './validation';

const validScopeString = 'eip155:1';
const validScopeObject: ExternalScopeObject = {
  methods: [],
  notifications: [],
};

describe('Scope Validation', () => {
  describe('isValidScope', () => {
    it('returns false when the scopeString is neither a CAIP namespace or CAIP chainId', () => {
      expect(
        isValidScope('not a namespace or a caip chain id', validScopeObject),
      ).toBe(false);
    });

    it('returns true when the scopeString is "wallet" and the scopeObject does not contain references', () => {
      expect(isValidScope('wallet', validScopeObject)).toBe(true);
    });

    it('returns true when the scopeString is a valid CAIP chainId and the scopeObject is valid', () => {
      expect(isValidScope('eip155:1', validScopeObject)).toBe(true);
    });

    it('returns false when the scopeString is a CAIP chainId but references is nonempty', () => {
      expect(
        isValidScope('eip155:1', {
          ...validScopeObject,
          references: ['5'],
        }),
      ).toBe(false);
    });

    it('returns false when the scopeString is a valid CAIP namespace but references are invalid CAIP references', () => {
      expect(
        isValidScope('eip155', {
          ...validScopeObject,
          references: ['@'],
        }),
      ).toBe(false);
    });

    it('returns false when the scopeString is a valid CAIP namespace (other than "wallet") but references is an empty array', () => {
      expect(
        isValidScope('eip155', { ...validScopeObject, references: [] }),
      ).toBe(false);
    });

    it('returns false when the scopeString is a valid CAIP namespace (other than "wallet") but references is undefined', () => {
      expect(isValidScope('eip155', validScopeObject)).toBe(false);
    });

    it('returns false when methods contains empty string', () => {
      expect(
        isValidScope(validScopeString, {
          ...validScopeObject,
          methods: [''],
        }),
      ).toBe(false);
    });

    it('returns false when methods contains non-string', () => {
      expect(
        isValidScope(validScopeString, {
          ...validScopeObject,
          // @ts-expect-error Intentionally invalid input
          methods: [{ foo: 'bar' }],
        }),
      ).toBe(false);
    });

    it('returns true when methods contains only strings', () => {
      expect(
        isValidScope(validScopeString, {
          ...validScopeObject,
          methods: ['method1', 'method2'],
        }),
      ).toBe(true);
    });

    it('returns false when notifications contains empty string', () => {
      expect(
        isValidScope(validScopeString, {
          ...validScopeObject,
          notifications: [''],
        }),
      ).toBe(false);
    });

    it('returns false when notifications contains non-string', () => {
      expect(
        isValidScope(validScopeString, {
          ...validScopeObject,
          // @ts-expect-error Intentionally invalid input
          notifications: [{ foo: 'bar' }],
        }),
      ).toBe(false);
    });

    it('returns false when unexpected properties are defined', () => {
      expect(
        isValidScope(validScopeString, {
          ...validScopeObject,
          // @ts-expect-error Intentionally invalid input
          unexpectedParam: 'foobar',
        }),
      ).toBe(false);
    });

    it('returns true when only expected properties are defined', () => {
      expect(
        isValidScope(validScopeString, {
          references: [],
          methods: [],
          notifications: [],
          accounts: [],
          rpcDocuments: [],
          rpcEndpoints: [],
        }),
      ).toBe(true);
    });
  });

  describe('validateScopes', () => {
    const validScopeObjectWithAccounts = {
      ...validScopeObject,
      accounts: [],
    };

    it('does not throw an error if required scopes are defined but none are valid', () => {
      expect(
        validateScopes(
          // @ts-expect-error Intentionally invalid input
          { 'eip155:1': {} },
          undefined,
        ),
      ).toStrictEqual({ validRequiredScopes: {}, validOptionalScopes: {} });
    });

    it('does not throw an error if optional scopes are defined but none are valid', () => {
      expect(
        validateScopes(undefined, {
          // @ts-expect-error Intentionally invalid input
          'eip155:1': {},
        }),
      ).toStrictEqual({ validRequiredScopes: {}, validOptionalScopes: {} });
    });

    it('returns the valid required and optional scopes', () => {
      expect(
        validateScopes(
          {
            'eip155:1': validScopeObjectWithAccounts,
            // @ts-expect-error Intentionally invalid input
            'eip155:64': {},
          },
          {
            'eip155:2': {},
            'eip155:5': validScopeObjectWithAccounts,
          },
        ),
      ).toStrictEqual({
        validRequiredScopes: {
          'eip155:1': validScopeObjectWithAccounts,
        },
        validOptionalScopes: {
          'eip155:5': validScopeObjectWithAccounts,
        },
      });
    });
  });
});
