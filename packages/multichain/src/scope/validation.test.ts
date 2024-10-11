import type { ExternalScopeObject } from './scope';
import { isValidScope, validateScopes } from './validation';

const validScopeString = 'eip155:1';
const validScopeObject: ExternalScopeObject = {
  methods: [],
  notifications: [],
};

describe('Scope Validation', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('isValidScope', () => {
    it.each([
      [
        false,
        'the scopeString is neither a CAIP namespace or CAIP chainId',
        'not a namespace or a caip chain id',
        validScopeObject,
      ],
      [
        true,
        'the scopeString is a valid CAIP namespace and the scopeObject is valid',
        'eip155',
        validScopeObject,
      ],
      [
        true,
        'the scopeString is a valid CAIP chainId and the scopeObject is valid',
        'eip155:1',
        validScopeObject,
      ],
      [
        false,
        'the scopeString is a CAIP chainId but references is nonempty',
        'eip155:1',
        {
          ...validScopeObject,
          references: ['5'],
        },
      ],
      [
        false,
        'methods contains empty string',
        validScopeString,
        {
          ...validScopeObject,
          methods: [''],
        },
      ],
      [
        false,
        'methods contains non-string',
        validScopeString,
        {
          ...validScopeObject,
          methods: [{ foo: 'bar' }],
        },
      ],
      [
        true,
        'methods contains only strings',
        validScopeString,
        {
          ...validScopeObject,
          methods: ['method1', 'method2'],
        },
      ],
      [
        false,
        'notifications contains empty string',
        validScopeString,
        {
          ...validScopeObject,
          notifications: [''],
        },
      ],
      [
        false,
        'notifications contains non-string',
        validScopeString,
        {
          ...validScopeObject,
          notifications: [{ foo: 'bar' }],
        },
      ],
      [
        false,
        'notifications contains non-string',
        'eip155:1',
        {
          ...validScopeObject,
          notifications: [{ foo: 'bar' }],
        },
      ],
      [
        false,
        'unexpected properties are defined',
        validScopeString,
        {
          ...validScopeObject,
          unexpectedParam: 'foobar',
        },
      ],
      [
        true,
        'only expected properties are defined',
        validScopeString,
        {
          references: [],
          methods: [],
          notifications: [],
          accounts: [],
          rpcDocuments: [],
          rpcEndpoints: [],
        },
      ],
    ])(
      'returns %s when %s',
      (
        expected: boolean,
        _scenario: string,
        scopeString: string,
        scopeObject: unknown,
      ) => {
        expect(
          isValidScope(scopeString, scopeObject as ExternalScopeObject),
        ).toStrictEqual(expected);
      },
    );
  });

  describe('validateScopes', () => {
    const validScopeObjectWithAccounts = {
      ...validScopeObject,
      accounts: [],
    };

    it('does not throw an error if required scopes are defined but none are valid', () => {
      expect(
        validateScopes(
          { 'eip155:1': {} as unknown as ExternalScopeObject },
          undefined,
        ),
      ).toStrictEqual({ validRequiredScopes: {}, validOptionalScopes: {} });
    });

    it('does not throw an error if optional scopes are defined but none are valid', () => {
      expect(
        validateScopes(undefined, {
          'eip155:1': {} as unknown as ExternalScopeObject,
        }),
      ).toStrictEqual({ validRequiredScopes: {}, validOptionalScopes: {} });
    });

    it('returns the valid required and optional scopes', () => {
      expect(
        validateScopes(
          {
            'eip155:1': validScopeObjectWithAccounts,
            'eip155:64': {} as unknown as ExternalScopeObject,
          },
          {
            'eip155:2': {} as unknown as ExternalScopeObject,
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
