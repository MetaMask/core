import { bucketScopes, validateAndFlattenScopes } from './authorization';
import * as Filter from './filter';
import * as Transform from './transform';
import type { ExternalScopeObject } from './types';
import * as Validation from './validation';

jest.mock('./validation', () => ({
  validateScopes: jest.fn(),
}));
const MockValidation = jest.mocked(Validation);

jest.mock('./transform', () => ({
  flattenMergeScopes: jest.fn(),
}));
const MockTransform = jest.mocked(Transform);

jest.mock('./filter', () => ({
  bucketScopesBySupport: jest.fn(),
}));
const MockFilter = jest.mocked(Filter);

const validScopeObject: ExternalScopeObject = {
  methods: [],
  notifications: [],
};

describe('Scope Authorization', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('validateAndFlattenScopes', () => {
    it('validates the scopes', () => {
      try {
        validateAndFlattenScopes(
          {
            'eip155:1': validScopeObject,
          },
          {
            'eip155:5': validScopeObject,
          },
        );
      } catch (err) {
        // noop
      }
      expect(MockValidation.validateScopes).toHaveBeenCalledWith(
        {
          'eip155:1': validScopeObject,
        },
        {
          'eip155:5': validScopeObject,
        },
      );
    });

    it('flatten and merges the validated scopes', () => {
      MockValidation.validateScopes.mockReturnValue({
        validRequiredScopes: {
          'eip155:1': validScopeObject,
        },
        validOptionalScopes: {
          'eip155:5': validScopeObject,
        },
      });

      validateAndFlattenScopes({}, {});
      expect(MockTransform.flattenMergeScopes).toHaveBeenCalledWith({
        'eip155:1': validScopeObject,
      });
      expect(MockTransform.flattenMergeScopes).toHaveBeenCalledWith({
        'eip155:5': validScopeObject,
      });
    });

    it('returns the flattened and merged scopes', () => {
      MockValidation.validateScopes.mockReturnValue({
        validRequiredScopes: {
          'eip155:1': validScopeObject,
        },
        validOptionalScopes: {
          'eip155:5': validScopeObject,
        },
      });
      MockTransform.flattenMergeScopes.mockImplementation((value) => ({
        ...value,
        transformed: true,
      }));

      expect(validateAndFlattenScopes({}, {})).toStrictEqual({
        flattenedRequiredScopes: {
          'eip155:1': validScopeObject,
          transformed: true,
        },
        flattenedOptionalScopes: {
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
            },
          },
          unsupportedScopes: {
            'mock:B': {
              methods: [`mock_method_${callCount}`],
              notifications: [],
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
          },
        },
        supportableScopes: {
          'mock:A': {
            methods: [`mock_method_2`],
            notifications: [],
          },
        },
        unsupportableScopes: {
          'mock:B': {
            methods: [`mock_method_2`],
            notifications: [],
          },
        },
      });
    });
  });
});
