import { describe, expect, it } from 'vitest';

import type { AssetsDataSource } from '../types.js';
import { buildUpdateSources } from './buildUpdateSources.js';
import type { UpdateSources } from './buildUpdateSources.js';

function stubSource(name: string): AssetsDataSource {
  return {
    getName: () => name,
    assetsMiddleware: async (ctx) => ctx,
  };
}

function buildSources(): UpdateSources {
  return {
    customAssetGraduationMiddleware: stubSource(
      'CustomAssetGraduationMiddleware',
    ),
    rpcFallbackMiddleware: stubSource('RpcFallbackMiddleware'),
    tokenDataSource: stubSource('TokenDataSource'),
    priceDataSource: stubSource('PriceDataSource'),
  };
}

describe('buildUpdateSources', () => {
  it.each([
    {
      title: 'v5 AccountsApi lane: graduation → RPC fallback → enrichment',
      includeCustomAssetGraduation: true,
      includeRpcFallback: true,
      isBasicFunctionality: true,
      expected: [
        'CustomAssetGraduationMiddleware',
        'RpcFallbackMiddleware',
        'ParallelMiddleware',
      ],
    },
    {
      title: 'v5 AccountsApi lane: graduation → RPC fallback',
      includeCustomAssetGraduation: true,
      includeRpcFallback: true,
      isBasicFunctionality: false,
      expected: ['CustomAssetGraduationMiddleware', 'RpcFallbackMiddleware'],
    },
    {
      title: 'v5 Snap/RPC lane: enrichment',
      includeCustomAssetGraduation: false,
      includeRpcFallback: false,
      isBasicFunctionality: true,
      expected: ['ParallelMiddleware'],
    },
    {
      title: 'v6 lane: RPC fallback → enrichment',
      includeCustomAssetGraduation: false,
      includeRpcFallback: true,
      isBasicFunctionality: true,
      expected: ['RpcFallbackMiddleware', 'ParallelMiddleware'],
    },
    {
      title: 'v6 lane: no enrichment when basic functionality is off',
      includeCustomAssetGraduation: false,
      includeRpcFallback: false,
      isBasicFunctionality: false,
      expected: [],
    },
  ])(
    '$title',
    ({
      includeCustomAssetGraduation,
      includeRpcFallback,
      isBasicFunctionality,
      expected,
    }) => {
      const sources = buildUpdateSources(buildSources(), {
        isBasicFunctionality,
        includeCustomAssetGraduation,
        includeRpcFallback,
      });

      expect(sources.map((source) => source.getName())).toStrictEqual(expected);
    },
  );
});
