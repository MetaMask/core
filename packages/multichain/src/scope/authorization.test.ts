import { validateAndNormalizeScopes } from './authorization';
import * as Transform from './transform';
import type { ExternalScopeObject } from './types';
import * as Validation from './validation';

jest.mock('./validation', () => ({
  validateScopes: jest.fn(),
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
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('validateAndNormalizeScopes', () => {
    it('validates the scopes', () => {
      try {
        validateAndNormalizeScopes(
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

    it('normalized and merges the validated scopes', () => {
      MockValidation.validateScopes.mockReturnValue({
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
      MockValidation.validateScopes.mockReturnValue({
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
});
