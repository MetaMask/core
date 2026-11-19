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
    rpcFallbackMiddleware: stubSource('RpcFallbackMiddleware'),
    tokenDataSource: stubSource('TokenDataSource'),
    priceDataSource: stubSource('PriceDataSource'),
  };
}

describe('buildFastFetchSources', () => {
  it('orders the lane balances → rpc fallback → enrichment', () => {
    const sources = buildFastFetchSources(buildSources(), {
      isBasicFunctionality: true,
    });

    expect(sources.map((source) => source.getName())).toStrictEqual([
      'AccountsApiDataSource',
      'RpcFallbackMiddleware',
      'ParallelMiddleware',
    ]);
  });

  it('runs nothing when basic functionality is off', () => {
    const sources = buildFastFetchSources(buildSources(), {
      isBasicFunctionality: false,
    });

    expect(sources).toStrictEqual([]);
  });
});
