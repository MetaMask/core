import { BN } from 'ethereumjs-util';
import { mocked } from 'ts-jest/utils';
import calculateBusyThreshold from './calculateBusyThreshold';
import fetchBlockFeeHistory from './fetchBlockFeeHistory';

jest.mock('./fetchBlockFeeHistory');

const mockedFetchFeeHistory = mocked(fetchBlockFeeHistory, true);

describe('calculateBusyThreshold', () => {
  const ethQuery = {};

  beforeEach(() => {
    const baseFeesPerGas = [
      3_000_000_000,
      8_000_000_000,
      4_000_000_000,
      6_000_000_000,
      11_000_000_000,
      5_000_000_000,
      10_000_000_000,
      2_000_000_000,
      7_000_000_000,
      1_000_000_000,
      9_000_000_000,
    ];
    mockedFetchFeeHistory.mockResolvedValue(
      baseFeesPerGas.map((baseFeePerGas, i) => {
        return {
          number: new BN(i + 1),
          baseFeePerGas: new BN(baseFeePerGas),
          gasUsedRatio: 0,
          priorityFeesByPercentile: {},
        };
      }),
    );
  });

  it('sorts the base fees returned by eth_feeHistory, then returns the base fee 9/10 of the way through the list', async () => {
    const busyThreshold = await calculateBusyThreshold(ethQuery);

    expect(busyThreshold).toStrictEqual(new BN(9_000_000_000));
  });
});
