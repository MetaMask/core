import { describe, expect, it } from 'vitest';

import type { AssetsDataSource } from '../types.js';
import { buildFastFetchSources } from './buildFastFetchSources.js';
import type { FastFetchSources } from './buildFastFetchSources.js';

function stubSource(name: string): AssetsDataSource {
  return {
    getName: () => name,
    assetsMiddleware: async (ctx) => ctx,
  };
}

function buildSources(): FastFetchSources {
  return {
    accountsApiDataSource: stubSource('AccountsApiDataSource'),
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
      includeCustomAssetGraduation: true,
      expected: [
        'AccountsApiDataSource',
        'CustomAssetGraduationMiddleware',
        'RpcFallbackMiddleware',
        'DetectionMiddleware',
        'ParallelMiddleware',
      ],
    },
    {
      title: 'drops graduation from the lane',
      isBasicFunctionality: true,
      // The Accounts API v6 lane resolves pins through `includeAssetIds`.
      includeCustomAssetGraduation: false,
      expected: [
        'AccountsApiDataSource',
        'RpcFallbackMiddleware',
        'DetectionMiddleware',
        'ParallelMiddleware',
      ],
    },
    {
      title: 'runs nothing',
      isBasicFunctionality: false,
      includeCustomAssetGraduation: true,
      // No balance source runs, so detection has nothing to scan and no
      // token or price source to feed. The RPC background lane covers this.
      expected: [],
    },
  ])(
    '$title',
    ({ isBasicFunctionality, includeCustomAssetGraduation, expected }) => {
      const sources = buildFastFetchSources(buildSources(), {
        isBasicFunctionality,
        includeCustomAssetGraduation,
      });

      expect(sources.map((source) => source.getName())).toStrictEqual(expected);
    },
  );
});
