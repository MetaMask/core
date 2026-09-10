import type { BalanceSource } from '../middlewares/ParallelMiddleware.js';
import type { AssetsDataSource, ChainId, Middleware } from '../types.js';
import { buildFastFetchSources } from './buildFastFetchSources.js';
import type { FastFetchSources } from './buildFastFetchSources.js';

/**
 * A source that only has to be identifiable. `buildFastFetchSources` is pure
 * composition — it never invokes a middleware — so a name is all that is needed
 * to observe where each role lands.
 *
 * @param name - The source's reported name.
 * @returns The stub source.
 */
function stubSource(name: string): AssetsDataSource {
  return {
    getName: () => name,
    assetsMiddleware: (async (ctx) => ctx) as Middleware,
  };
}

/**
 * As {@link stubSource}, plus the chain accessor a balance source must expose.
 *
 * @param name - The source's reported name.
 * @returns The stub balance source.
 */
function stubBalanceSource(name: string): BalanceSource {
  return {
    ...stubSource(name),
    getActiveChainsSync: (): ChainId[] => [],
  };
}

/**
 * The full role set, as `AssetsController` supplies it.
 *
 * @returns Stub sources for every role.
 */
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
  describe('with basic functionality on', () => {
    it('orders the lane balances → graduation → rpc fallback → detection → enrichment', () => {
      const sources = buildFastFetchSources(buildSources(), {
        isBasicFunctionality: true,
      });

      expect(sources.map((source) => source.getName())).toStrictEqual([
        'ParallelBalanceMiddleware',
        'CustomAssetGraduationMiddleware',
        'RpcFallbackMiddleware',
        'DetectionMiddleware',
        'ParallelMiddleware',
      ]);
    });

    it('runs graduation before the RPC fallback', () => {
      const names = buildFastFetchSources(buildSources(), {
        isBasicFunctionality: true,
      }).map((source) => source.getName());

      // Graduation must only ever see Accounts API / websocket balances. RPC
      // intentionally carries custom assets and must not trigger graduation.
      expect(names.indexOf('CustomAssetGraduationMiddleware')).toBeLessThan(
        names.indexOf('RpcFallbackMiddleware'),
      );
    });

    it('runs detection before token and price enrichment', () => {
      const names = buildFastFetchSources(buildSources(), {
        isBasicFunctionality: true,
      }).map((source) => source.getName());

      // Both enrichment sources read `response.detectedAssets`.
      expect(names.indexOf('DetectionMiddleware')).toBeLessThan(
        names.indexOf('ParallelMiddleware'),
      );
    });
  });

  describe('with basic functionality off', () => {
    it('runs only the staking balance and detection', () => {
      const sources = buildFastFetchSources(buildSources(), {
        isBasicFunctionality: false,
      });

      // No network-backed source may run when the user has opted out.
      expect(sources.map((source) => source.getName())).toStrictEqual([
        'StakedBalanceDataSource',
        'DetectionMiddleware',
      ]);
    });
  });
});
