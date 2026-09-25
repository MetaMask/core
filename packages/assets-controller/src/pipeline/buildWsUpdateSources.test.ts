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
    detectionMiddleware: stubSource('DetectionMiddleware'),
    tokenDataSource: stubTokenSource('TokenDataSource'),
    priceDataSource: stubSource('PriceDataSource'),
  };
}

describe('buildWsUpdateSources', () => {
  it.each([
    {
      title:
        'orders the lane graduation → occurrence filter → detection → enrichment',
      isBasicFunctionality: true,
      expected: [
        'CustomAssetGraduationMiddleware',
        'OccurrenceFloorFilter',
        'DetectionMiddleware',
        'ParallelMiddleware',
      ],
    },
    {
      title: 'runs only the graduation and detection',
      isBasicFunctionality: false,
      // No network-backed source may run when the user has opted out.
      expected: ['CustomAssetGraduationMiddleware', 'DetectionMiddleware'],
    },
  ])('$title', ({ isBasicFunctionality, expected }) => {
    const sources = buildWsUpdateSources(buildSources(), {
      isBasicFunctionality,
    });

    expect(sources.map((source) => source.getName())).toStrictEqual(expected);
  });

  it('derives the occurrence filter from the token data source', () => {
    const tokenDataSource = stubTokenSource('TokenDataSource');
    const middlewareSpy = jest.fn(tokenDataSource.occurrenceFilterMiddleware);
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
