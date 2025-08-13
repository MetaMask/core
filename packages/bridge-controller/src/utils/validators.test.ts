import { validateFeatureFlagsResponse } from './validators';

describe('validators', () => {
  describe('validateFeatureFlagsResponse', () => {
    it.each([
      {
        response: {
          chains: {
            '1': { isActiveDest: true, isActiveSrc: true },
            '10': { isActiveDest: true, isActiveSrc: true },
            '137': { isActiveDest: true, isActiveSrc: true },
            '324': { isActiveDest: true, isActiveSrc: true },
            '42161': { isActiveDest: true, isActiveSrc: true },
            '43114': { isActiveDest: true, isActiveSrc: true },
            '56': { isActiveDest: true, isActiveSrc: true },
            '59144': { isActiveDest: true, isActiveSrc: true },
            '8453': { isActiveDest: true, isActiveSrc: true },
          },
          maxRefreshCount: 5,
          refreshRate: 30000,
          support: true,
          minimumVersion: '0.0.0',
        },
        type: 'all evm chains active',
        expected: true,
      },
      {
        response: {
          chains: {},
          maxRefreshCount: 1,
          refreshRate: 3000000,
          support: false,
          minimumVersion: '0.0.0',
        },
        type: 'bridge disabled',
        expected: true,
      },
      {
        response: {
          chains: {
            '1': {
              isActiveDest: true,
              isActiveSrc: true,
            },
            '10': {
              isActiveDest: true,
              isActiveSrc: true,
            },
            '56': {
              isActiveDest: true,
              isActiveSrc: true,
            },
            '137': {
              isActiveDest: true,
              isActiveSrc: true,
            },
            '324': {
              isActiveDest: true,
              isActiveSrc: true,
            },
            '8453': {
              isActiveDest: true,
              isActiveSrc: true,
            },
            '42161': {
              isActiveDest: true,
              isActiveSrc: true,
            },
            '43114': {
              isActiveDest: true,
              isActiveSrc: true,
            },
            '59144': {
              isActiveDest: true,
              isActiveSrc: true,
            },
            '1151111081099710': {
              isActiveDest: true,
              isActiveSrc: true,
              refreshRate: 10000,
              topAssets: [
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
                'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
                '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxsDx8F8k8k3uYw1PDC',
                '3iQL8BFS2vE7mww4ehAqQHAsbmRNCrPxizWAT2Zfyr9y',
                '9zNQRsGLjNKwCUU5Gq5LR8beUCPzQMVMqKAi3SSZh54u',
                'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
                'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof',
                '21AErpiB8uSb94oQKRcwuHqyHF93njAxBSbdUrpupump',
              ],
            },
          },
          maxRefreshCount: 5,
          refreshRate: 30000,
          support: true,
          minimumVersion: '0.0.0',
        },
        type: 'evm and solana chain config',
        expected: true,
      },
      {
        response: undefined,
        type: 'no response',
        expected: false,
      },
      {
        response: {
          chains: {
            '1': { isActiveDest: true, isActiveSrc: true },
            '10': { isActiveDest: true, isActiveSrc: true },
            '137': { isActiveDest: true, isActiveSrc: true },
            '324': { isActiveDest: true, isActiveSrc: true },
            '42161': { isActiveDest: true, isActiveSrc: true },
            '43114': { isActiveDest: true, isActiveSrc: true },
            '56': { isActiveDest: true, isActiveSrc: true },
            '59144': { isActiveDest: true, isActiveSrc: true },
            '8453': { isActiveDest: true, isActiveSrc: true },
          },
          maxRefreshCount: 5,
          refreshRate: 30000,
          support: true,
          minimumVersion: '0.0.0',
          extraField: 'foo',
        },
        type: 'all evm chains active + an extra field not specified in the schema',
        expected: true,
      },
    ])(
      'should return $expected if the response is valid: $type',
      ({ response, expected }) => {
        expect(validateFeatureFlagsResponse(response)).toBe(expected);
      },
    );
  });
});
