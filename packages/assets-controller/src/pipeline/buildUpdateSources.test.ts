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
    rpcFallbackMiddleware: stubSource('RpcFallbackMiddleware'),
    tokenDataSource: stubSource('TokenDataSource'),
    priceDataSource: stubSource('PriceDataSource'),
  };
}

describe('buildUpdateSources', () => {
  it.each([
    {
      title: 'RPC fallback then enrichment',
      includeRpcFallback: true,
      isBasicFunctionality: true,
      expected: ['RpcFallbackMiddleware', 'ParallelMiddleware'],
    },
    {
      title: 'enrichment when the RPC fallback is off',
      includeRpcFallback: false,
      isBasicFunctionality: true,
      expected: ['ParallelMiddleware'],
    },
    {
      title: 'runs nothing when basic functionality is off',
      includeRpcFallback: false,
      isBasicFunctionality: false,
      expected: [],
    },
  ])('$title', ({ includeRpcFallback, isBasicFunctionality, expected }) => {
    const sources = buildUpdateSources(buildSources(), {
      isBasicFunctionality,
      includeRpcFallback,
    });

    expect(sources.map((source) => source.getName())).toStrictEqual(expected);
  });
});
