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
      title: 'RPC fallback → enrichment',
      includeRpcFallback: true,
      isBasicFunctionality: true,
      expected: ['RpcFallbackMiddleware', 'ParallelMiddleware'],
    },
    {
      title: 'RPC fallback only',
      includeRpcFallback: true,
      isBasicFunctionality: false,
      expected: ['RpcFallbackMiddleware'],
    },
    {
      title: 'enrichment only',
      includeRpcFallback: false,
      isBasicFunctionality: true,
      expected: ['ParallelMiddleware'],
    },
    {
      title: 'runs nothing when basic functionality is off and RPC is excluded',
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
