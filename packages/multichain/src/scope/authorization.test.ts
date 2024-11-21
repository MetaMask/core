import { bucketScopes, validateAndNormalizeScopes } from './authorization';
import * as Transform from './transform';
import type { ExternalScopeObject } from './types';
import * as Validation from './validation';

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
      const isChainIdSupported = jest.fn();
      bucketScopes(
        {
          wallet: {
            methods: [],
            notifications: [],
            accounts: [],
          },
        },
        {
          isChainIdSupported,
          isChainIdSupportable: jest.fn(),
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
          isChainIdSupported,
        },
      );
    });

    it('buckets the mayble supportable scopes', () => {
      const isChainIdSupportable = jest.fn();
      bucketScopes(
        {
          wallet: {
            methods: [],
            notifications: [],
            accounts: [],
          },
        },
        {
          isChainIdSupported: jest.fn(),
          isChainIdSupportable,
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
          isChainIdSupported: isChainIdSupportable,
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
            isChainIdSupported: jest.fn(),
            isChainIdSupportable: jest.fn(),
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
});
