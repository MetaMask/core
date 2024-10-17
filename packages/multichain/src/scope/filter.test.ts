import * as Assert from './assert';
import { filterScopesSupported, bucketScopesBySupport } from './filter';

jest.mock('./assert', () => ({
  assertScopeSupported: jest.fn(),
}));
const MockAssert = jest.mocked(Assert);

describe('filter', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('filterScopesSupported', () => {
    const isChainIdSupported = jest.fn();

    it('checks if each scope is supported', () => {
      filterScopesSupported(
        {
          'eip155:1': {
            methods: ['a'],
            notifications: [],
            accounts: [],
          },
          'eip155:5': {
            methods: ['b'],
            notifications: [],
            accounts: [],
          },
        },
        { isChainIdSupported },
      );

      expect(MockAssert.assertScopeSupported).toHaveBeenCalledWith(
        'eip155:1',
        {
          methods: ['a'],
          notifications: [],
          accounts: [],
        },
        { isChainIdSupported },
      );
      expect(MockAssert.assertScopeSupported).toHaveBeenCalledWith(
        'eip155:5',
        {
          methods: ['b'],
          notifications: [],
          accounts: [],
        },
        { isChainIdSupported },
      );
    });

    it('returns only supported scopes', () => {
      MockAssert.assertScopeSupported.mockImplementation((scopeString) => {
        if (scopeString === 'eip155:1') {
          throw new Error('scope not supported');
        }
      });

      expect(
        filterScopesSupported(
          {
            'eip155:1': {
              methods: ['a'],
              notifications: [],
              accounts: [],
            },
            'eip155:5': {
              methods: ['b'],
              notifications: [],
              accounts: [],
            },
          },
          { isChainIdSupported },
        ),
      ).toStrictEqual({
        'eip155:5': {
          methods: ['b'],
          notifications: [],
          accounts: [],
        },
      });
    });
  });

  describe('bucketScopesBySupport', () => {
    const isChainIdSupported = jest.fn();

    it('checks if each scope is supported', () => {
      bucketScopesBySupport(
        {
          'eip155:1': {
            methods: ['a'],
            notifications: [],
            accounts: [],
          },
          'eip155:5': {
            methods: ['b'],
            notifications: [],
            accounts: [],
          },
        },
        { isChainIdSupported },
      );

      expect(MockAssert.assertScopeSupported).toHaveBeenCalledWith(
        'eip155:1',
        {
          methods: ['a'],
          notifications: [],
          accounts: [],
        },
        { isChainIdSupported },
      );
      expect(MockAssert.assertScopeSupported).toHaveBeenCalledWith(
        'eip155:5',
        {
          methods: ['b'],
          notifications: [],
          accounts: [],
        },
        { isChainIdSupported },
      );
    });

    it('returns supported and unsupported scopes', () => {
      MockAssert.assertScopeSupported.mockImplementation((scopeString) => {
        if (scopeString === 'eip155:1') {
          throw new Error('scope not supported');
        }
      });

      expect(
        bucketScopesBySupport(
          {
            'eip155:1': {
              methods: ['a'],
              notifications: [],
              accounts: [],
            },
            'eip155:5': {
              methods: ['b'],
              notifications: [],
              accounts: [],
            },
          },
          { isChainIdSupported },
        ),
      ).toStrictEqual({
        supportedScopes: {
          'eip155:5': {
            methods: ['b'],
            notifications: [],
            accounts: [],
          },
        },
        unsupportedScopes: {
          'eip155:1': {
            methods: ['a'],
            notifications: [],
            accounts: [],
          },
        },
      });
    });
  });
});
