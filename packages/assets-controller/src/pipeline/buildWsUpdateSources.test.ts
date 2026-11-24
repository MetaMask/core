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
  it('orders the lane occurrence filter → RPC fallback → enrichment', () => {
    const sources = buildWsUpdateSources(buildSources(), {
      isBasicFunctionality: true,
    });

    expect(sources.map((source) => source.getName())).toStrictEqual([
      'OccurrenceFloorFilter',
      'RpcFallbackMiddleware',
      'ParallelMiddleware',
    ]);
  });

  it('runs nothing when basic functionality is off', () => {
    const sources = buildWsUpdateSources(buildSources(), {
      isBasicFunctionality: false,
    });

    expect(sources).toStrictEqual([]);
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
