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
    detectionMiddleware: stubSource('DetectionMiddleware'),
    tokenDataSource: stubSource('TokenDataSource'),
    priceDataSource: stubSource('PriceDataSource'),
  };
}

describe('buildUpdateSources', () => {
  it.each([
    {
      title: 'v5 AccountsApi lane: graduation → RPC fallback → detection → enrichment',
      includeCustomAssetGraduation: true,
      includeRpcFallback: true,
      isBasicFunctionality: true,
      expected: [
        'CustomAssetGraduationMiddleware',
        'RpcFallbackMiddleware',
        'DetectionMiddleware',
        'ParallelMiddleware',
      ],
    },
    {
      title: 'v5 AccountsApi lane: graduation → RPC fallback → detection',
      includeCustomAssetGraduation: true,
      includeRpcFallback: true,
      isBasicFunctionality: false,
      expected: [
        'CustomAssetGraduationMiddleware',
        'RpcFallbackMiddleware',
        'DetectionMiddleware',
      ],
    },
    {
      title: 'v5 Snap/RPC lane: detection → enrichment',
      includeCustomAssetGraduation: false,
      includeRpcFallback: false,
      isBasicFunctionality: true,
      expected: ['DetectionMiddleware', 'ParallelMiddleware'],
    },
    {
      title: 'v6 lane: RPC fallback → detection → enrichment',
      includeCustomAssetGraduation: false,
      includeRpcFallback: true,
      isBasicFunctionality: true,
      expected: [
        'RpcFallbackMiddleware',
        'DetectionMiddleware',
        'ParallelMiddleware',
      ],
    },
    {
      title: 'v6 lane: detection only',
      includeCustomAssetGraduation: false,
      includeRpcFallback: false,
      isBasicFunctionality: false,
      expected: ['DetectionMiddleware'],
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

      expect(sources.map((source) => source.getName())).toStrictEqual(
        expected,
      );
    },
  );
});
