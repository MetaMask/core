import {
  bucketScopes,
  isNamespaceInScopesObject,
  validateAndNormalizeScopes,
} from './authorization';
import * as Filter from './filter';
import * as Transform from './transform';
import type { ExternalScopeObject } from './types';
import * as Validation from './validation';

jest.mock('./filter', () => ({
  bucketScopesBySupport: jest.fn(),
}));
const MockFilter = jest.mocked(Filter);

jest.mock('./validation', () => ({
  getValidScopes: jest.fn(),
}));
const MockValidation = jest.mocked(Validation);

jest.mock('./transform', () => ({
  normalizeAndMergeScopes: jest.fn(),
}));
const MockTransform = jest.mocked(Transform);

const validScopeObject: ExternalScopeObject = {
  methods: [],
  notifications: [],
};

describe('Scope Authorization', () => {
  describe('validateAndNormalizeScopes', () => {
    it('validates the scopes', () => {
      MockValidation.getValidScopes.mockReturnValue({
        validRequiredScopes: {},
        validOptionalScopes: {},
      });
      validateAndNormalizeScopes(
        {
          'eip155:1': validScopeObject,
        },
        {
          'eip155:5': validScopeObject,
        },
      );
      expect(MockValidation.getValidScopes).toHaveBeenCalledWith(
        {
          'eip155:1': validScopeObject,
        },
        {
          'eip155:5': validScopeObject,
        },
      );
    });

    it('normalizes and merges the validated scopes', () => {
      MockValidation.getValidScopes.mockReturnValue({
        validRequiredScopes: {
          'eip155:1': validScopeObject,
        },
        validOptionalScopes: {
          'eip155:5': validScopeObject,
        },
      });

      validateAndNormalizeScopes({}, {});
      expect(MockTransform.normalizeAndMergeScopes).toHaveBeenCalledWith({
        'eip155:1': validScopeObject,
      });
      expect(MockTransform.normalizeAndMergeScopes).toHaveBeenCalledWith({
        'eip155:5': validScopeObject,
      });
    });

    it('returns the normalized and merged scopes', () => {
      MockValidation.getValidScopes.mockReturnValue({
        validRequiredScopes: {
          'eip155:1': validScopeObject,
        },
        validOptionalScopes: {
          'eip155:5': validScopeObject,
        },
      });
      MockTransform.normalizeAndMergeScopes.mockImplementation((value) => ({
        ...value,
        transformed: true,
      }));

      expect(validateAndNormalizeScopes({}, {})).toStrictEqual({
        normalizedRequiredScopes: {
          'eip155:1': validScopeObject,
          transformed: true,
        },
        normalizedOptionalScopes: {
          'eip155:5': validScopeObject,
          transformed: true,
        },
      });
    });
  });

  describe('bucketScopes', () => {
    const isEvmChainIdSupported = jest.fn();
    const isEvmChainIdSupportable = jest.fn();
    const isNonEvmScopeSupported = jest.fn();
    const getNonEvmSupportedMethods = jest.fn();

    beforeEach(() => {
      let callCount = 0;
      MockFilter.bucketScopesBySupport.mockImplementation(() => {
        callCount += 1;
        return {
          supportedScopes: {
            'mock:A': {
              methods: [`mock_method_${callCount}`],
              notifications: [],
              accounts: [],
            },
          },
          unsupportedScopes: {
            'mock:B': {
              methods: [`mock_method_${callCount}`],
              notifications: [],
              accounts: [],
            },
          },
        };
      });
    });

    it('buckets the scopes by supported', () => {
      bucketScopes(
        {
          wallet: {
            methods: [],
            notifications: [],
            accounts: [],
          },
        },
        {
          isEvmChainIdSupported,
          isEvmChainIdSupportable,
          isNonEvmScopeSupported,
          getNonEvmSupportedMethods,
        },
      );

      expect(MockFilter.bucketScopesBySupport).toHaveBeenCalledWith(
        {
          wallet: {
            methods: [],
            notifications: [],
            accounts: [],
          },
        },
        {
          isEvmChainIdSupported,
          isNonEvmScopeSupported,
          getNonEvmSupportedMethods,
        },
      );
    });

    it('buckets the maybe supportable scopes', () => {
      bucketScopes(
        {
          wallet: {
            methods: [],
            notifications: [],
            accounts: [],
          },
        },
        {
          isEvmChainIdSupported,
          isEvmChainIdSupportable,
          isNonEvmScopeSupported,
          getNonEvmSupportedMethods,
        },
      );

      expect(MockFilter.bucketScopesBySupport).toHaveBeenCalledWith(
        {
          'mock:B': {
            methods: [`mock_method_1`],
            notifications: [],
            accounts: [],
          },
        },
        {
          isEvmChainIdSupported: isEvmChainIdSupportable,
          isNonEvmScopeSupported,
          getNonEvmSupportedMethods,
        },
      );
    });

    it('returns the bucketed scopes', () => {
      expect(
        bucketScopes(
          {
            wallet: {
              methods: [],
              notifications: [],
              accounts: [],
            },
          },
          {
            isEvmChainIdSupported,
            isEvmChainIdSupportable,
            isNonEvmScopeSupported,
            getNonEvmSupportedMethods,
          },
        ),
      ).toStrictEqual({
        supportedScopes: {
          'mock:A': {
            methods: [`mock_method_1`],
            notifications: [],
            accounts: [],
          },
        },
        supportableScopes: {
          'mock:A': {
            methods: [`mock_method_2`],
            notifications: [],
            accounts: [],
          },
        },
        unsupportableScopes: {
          'mock:B': {
            methods: [`mock_method_2`],
            notifications: [],
            accounts: [],
          },
        },
      });
    });
  });

  describe('isNamespaceInScopesObject', () => {
    it('returns true if the namespace is in the scopes object', () => {
      expect(
        isNamespaceInScopesObject(
          {
            'eip155:1': { methods: [], notifications: [], accounts: [] },
            'solana:1': { methods: [], notifications: [], accounts: [] },
          },
          'eip155',
        ),
      ).toBe(true);
    });

    it('returns false if the namespace is not in the scopes object', () => {
      expect(
        isNamespaceInScopesObject(
          {
            'eip155:1': { methods: [], notifications: [], accounts: [] },
            'eip155:5': { methods: [], notifications: [], accounts: [] },
          },
          'solana',
        ),
      ).toBe(false);
    });
  });
});
