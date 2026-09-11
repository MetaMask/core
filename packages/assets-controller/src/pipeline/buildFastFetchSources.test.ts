import type { BalanceSource } from '../middlewares/ParallelMiddleware.js';
import type { AssetsDataSource, ChainId, Middleware } from '../types.js';
import { buildFastFetchSources } from './buildFastFetchSources.js';
import type { FastFetchSources } from './buildFastFetchSources.js';

function stubSource(name: string): AssetsDataSource {
  return {
    getName: () => name,
    assetsMiddleware: (async (ctx) => ctx) as Middleware,
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
    stakedBalanceDataSource: stubBalanceSource('StakedBalanceDataSource'),
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
      isBasicFunctionality: true,
      expected: [
        'ParallelBalanceMiddleware',
        'CustomAssetGraduationMiddleware',
        'RpcFallbackMiddleware',
        'DetectionMiddleware',
        'ParallelMiddleware',
      ],
    },
    {
      title: 'runs only the staking balance and detection',
      isBasicFunctionality: false,
      // No network-backed source may run when the user has opted out.
      expected: ['StakedBalanceDataSource', 'DetectionMiddleware'],
    },
  ])('$title', ({ isBasicFunctionality, expected }) => {
    const sources = buildFastFetchSources(buildSources(), {
      isBasicFunctionality,
    });

    expect(sources.map((source) => source.getName())).toStrictEqual(expected);
  });
});
