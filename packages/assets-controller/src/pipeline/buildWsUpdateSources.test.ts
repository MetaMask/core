import { describe, expect, it, vi } from 'vitest';

import type { AssetsDataSource } from '../types.js';
import { buildWsUpdateSources } from './buildWsUpdateSources.js';
import type { WsUpdateSources } from './buildWsUpdateSources.js';

function stubSource(name: string): AssetsDataSource {
  return {
    getName: () => name,
    assetsMiddleware: async (ctx) => ctx,
  };
}

function stubTokenSource(name: string): WsUpdateSources['tokenDataSource'] {
  return {
    ...stubSource(name),
    occurrenceFilterMiddleware: async (ctx) => ctx,
  };
}

function buildSources(): WsUpdateSources {
  return {
    customAssetGraduationMiddleware: stubSource(
      'CustomAssetGraduationMiddleware',
    ),
    rpcFallbackMiddleware: stubSource('RpcFallbackMiddleware'),
    tokenDataSource: stubTokenSource('TokenDataSource'),
    priceDataSource: stubSource('PriceDataSource'),
  };
}

describe('buildWsUpdateSources', () => {
  it.each([
    {
      title: 'v5 lane: graduation → occurrence filter → enrichment',
      includeCustomAssetGraduation: true,
      isBasicFunctionality: true,
      expected: [
        'CustomAssetGraduationMiddleware',
        'OccurrenceFloorFilter',
        'ParallelMiddleware',
      ],
    },
    {
      title: 'v5 lane: runs only graduation',
      includeCustomAssetGraduation: true,
      isBasicFunctionality: false,
      expected: ['CustomAssetGraduationMiddleware'],
    },
    {
      title: 'v6 lane: occurrence filter → RPC fallback → enrichment',
      includeCustomAssetGraduation: false,
      isBasicFunctionality: true,
      expected: [
        'OccurrenceFloorFilter',
        'RpcFallbackMiddleware',
        'ParallelMiddleware',
      ],
    },
    {
      title: 'v6 lane: runs nothing when basic functionality is off',
      includeCustomAssetGraduation: false,
      isBasicFunctionality: false,
      expected: [],
    },
  ])(
    '$title',
    ({ includeCustomAssetGraduation, isBasicFunctionality, expected }) => {
      const sources = buildWsUpdateSources(buildSources(), {
        isBasicFunctionality,
        includeCustomAssetGraduation,
      });

      expect(sources.map((source) => source.getName())).toStrictEqual(expected);
    },
  );

  it('derives the occurrence filter from the token data source', () => {
    const tokenDataSource = stubTokenSource('TokenDataSource');
    const middlewareSpy = vi.fn(tokenDataSource.occurrenceFilterMiddleware);
    tokenDataSource.occurrenceFilterMiddleware = middlewareSpy;

    const sources = buildWsUpdateSources(
      { ...buildSources(), tokenDataSource },
      { isBasicFunctionality: true, includeCustomAssetGraduation: true },
    );

    const occurrenceFloorFilter = sources.find(
      (source) => source.getName() === 'OccurrenceFloorFilter',
    );
    expect(occurrenceFloorFilter).toBeDefined();
    expect(occurrenceFloorFilter?.assetsMiddleware).toBe(middlewareSpy);
  });
});
