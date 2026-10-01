import type { BalanceSource } from '../middlewares/ParallelMiddleware.js';
import type { AssetsDataSource, ChainId, Middleware } from '../types.js';
import { buildFastFetchSources } from './buildFastFetchSources.js';
import type { FastFetchSources } from './buildFastFetchSources.js';

function stubSource(name: string): AssetsDataSource {
  return {
    getName: () => name,
    assetsMiddleware: async (ctx) => ctx,
  };
}

function stubBalanceSource(name: string): BalanceSource {
  return {
    ...stubSource(name),
    getActiveChainsSync: (): ChainId[] => [],
  };
}

function buildSources(): FastFetchSources {
  return {
    accountsApiDataSource: stubBalanceSource('AccountsApiDataSource'),
    customAssetGraduationMiddleware: stubSource(
      'CustomAssetGraduationMiddleware',
    ),
    rpcFallbackMiddleware: stubSource('RpcFallbackMiddleware'),
    detectionMiddleware: stubSource('DetectionMiddleware'),
    tokenDataSource: stubSource('TokenDataSource'),
    priceDataSource: stubSource('PriceDataSource'),
  };
}

describe('buildFastFetchSources', () => {
  it.each([
    {
      title:
        'orders the lane balances → graduation → rpc fallback → detection → enrichment',
      includeCustomAssetGraduation: true,
      expected: [
        'ParallelBalanceMiddleware',
        'CustomAssetGraduationMiddleware',
        'RpcFallbackMiddleware',
        'DetectionMiddleware',
        'ParallelMiddleware',
      ],
    },
    {
      title: 'drops graduation from the lane',
      // The Accounts API v6 lane resolves pins through `includeAssetIds`.
      includeCustomAssetGraduation: false,
      expected: [
        'ParallelBalanceMiddleware',
        'RpcFallbackMiddleware',
        'DetectionMiddleware',
        'ParallelMiddleware',
      ],
    },
  ])(
    '$title',
    ({ includeCustomAssetGraduation, expected }) => {
      const sources = buildFastFetchSources(buildSources(), {
        includeCustomAssetGraduation,
      });

      expect(sources.map((source) => source.getName())).toStrictEqual(expected);
    },
  );
});
