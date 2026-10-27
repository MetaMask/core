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
    rpcFallbackMiddleware: stubSource('RpcFallbackMiddleware'),
    tokenDataSource: stubTokenSource('TokenDataSource'),
    priceDataSource: stubSource('PriceDataSource'),
  };
}

describe('buildWsUpdateSources', () => {
  it.each([
    {
      title: 'occurrence filter, RPC fallback, then enrichment',
      isBasicFunctionality: true,
      expected: [
        'OccurrenceFloorFilter',
        'RpcFallbackMiddleware',
        'ParallelMiddleware',
      ],
    },
    {
      title: 'runs nothing when basic functionality is off',
      isBasicFunctionality: false,
      expected: [],
    },
  ])('$title', ({ isBasicFunctionality, expected }) => {
    const sources = buildWsUpdateSources(buildSources(), {
      isBasicFunctionality,
    });

    expect(sources.map((source) => source.getName())).toStrictEqual(expected);
  });

  it('derives the occurrence filter from the token data source', () => {
    const tokenDataSource = stubTokenSource('TokenDataSource');
    const middlewareSpy = vi.fn(tokenDataSource.occurrenceFilterMiddleware);
    tokenDataSource.occurrenceFilterMiddleware = middlewareSpy;

    const sources = buildWsUpdateSources(
      { ...buildSources(), tokenDataSource },
      { isBasicFunctionality: true },
    );

    const occurrenceFloorFilter = sources.find(
      (source) => source.getName() === 'OccurrenceFloorFilter',
    );
    expect(occurrenceFloorFilter).toBeDefined();
    expect(occurrenceFloorFilter?.assetsMiddleware).toBe(middlewareSpy);
  });
});
