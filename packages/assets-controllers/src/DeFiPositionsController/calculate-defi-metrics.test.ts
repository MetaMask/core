import { MOCK_EXPECTED_RESULT } from './__fixtures__/mock-result';
import { calculateDeFiPositionMetrics } from './calculate-defi-metrics';

describe('groupDeFiPositions', () => {
  it('verifies that the resulting object is valid', () => {
    const result = calculateDeFiPositionMetrics(MOCK_EXPECTED_RESULT);

    expect(result).toStrictEqual({
      category: 'DeFi',
      event: 'DeFi Stats',
      properties: {
        breakdown: [
          {
            chainId: '0x1',
            count: 3,
            marketValueUSD: 540,
            protocolId: 'aave-v3',
          },
          {
            chainId: '0x1',
            count: 1,
            marketValueUSD: 20000,
            protocolId: 'lido',
          },
          {
            chainId: '0x2105',
            count: 2,
            marketValueUSD: 9580,
            protocolId: 'uniswap-v3',
          },
        ],
        totalMarketValueUSD: 30120,
        totalPositions: 6,
      },
    });
  });
});
