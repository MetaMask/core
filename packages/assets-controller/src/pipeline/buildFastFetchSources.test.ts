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
  };
}

describe('buildFastFetchSources', () => {
  it.each([
    {
      title: 'is only the Accounts API call',
      isBasicFunctionality: true,
      expected: ['AccountsApiDataSource'],
    },
    {
      title: 'runs nothing',
      isBasicFunctionality: false,
      // No balance source runs. The RPC background lane covers this.
      expected: [],
    },
  ])('$title', ({ isBasicFunctionality, expected }) => {
    const sources = buildFastFetchSources(buildSources(), {
      isBasicFunctionality,
    });

    expect(sources.map((source) => source.getName())).toStrictEqual(expected);
  });
});
