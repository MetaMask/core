import type { Hex } from '@metamask/utils';

import { getMessengerMock } from '../tests/messenger-mock';
import { getFallbackGas, getGasBuffer } from './feature-flags';
import { estimateGasLimit } from './gas';
import { estimateQuoteGasLimits } from './quote-gas';

jest.mock('./feature-flags', () => ({
  ...jest.requireActual('./feature-flags'),
  getFallbackGas: jest.fn(),
  getGasBuffer: jest.fn(),
}));

jest.mock('./gas', () => ({
  ...jest.requireActual('./gas'),
  estimateGasLimit: jest.fn(),
}));

describe('quote gas estimation', () => {
  const getFallbackGasMock = jest.mocked(getFallbackGas);
  const getGasBufferMock = jest.mocked(getGasBuffer);
  const estimateGasLimitMock = jest.mocked(estimateGasLimit);

  const { estimateGasBatchMock, messenger } = getMessengerMock();

  const TRANSACTIONS_MOCK = [
    {
      chainId: '0x1' as Hex,
      data: '0xaaaa' as Hex,
      from: '0x1234567890123456789012345678901234567891' as Hex,
      to: '0x1111111111111111111111111111111111111111' as Hex,
      value: '0x0' as Hex,
    },
    {
      chainId: '0x1' as Hex,
      data: '0xbbbb' as Hex,
      from: '0x1234567890123456789012345678901234567891' as Hex,
      gas: '30000',
      to: '0x2222222222222222222222222222222222222222' as Hex,
      value: '0x0' as Hex,
    },
  ];

  beforeEach(() => {
    jest.resetAllMocks();

    getGasBufferMock.mockReturnValue(1);
    getFallbackGasMock.mockReturnValue({ estimate: 200000, max: 400000 });
  });

  it('throws when there are no transactions', async () => {
    await expect(
      estimateQuoteGasLimits({
        messenger,
        transactions: [],
      }),
    ).rejects.toThrow('Quote gas estimation requires at least one transaction');

    expect(estimateGasBatchMock).not.toHaveBeenCalled();
    expect(estimateGasLimitMock).not.toHaveBeenCalled();
  });

  it('uses batch estimation for multiple transactions even when the chain does not support EIP-7702', async () => {
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 51000,
      gasLimits: [21000, 30000],
    });

    const result = await estimateQuoteGasLimits({
      fallbackOnSimulationFailure: true,
      messenger,
      transactions: TRANSACTIONS_MOCK,
    });

    expect(estimateGasBatchMock).toHaveBeenCalledTimes(1);
    expect(estimateGasLimitMock).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      gasLimits: [
        {
          estimate: 21000,
          max: 21000,
        },
        {
          estimate: 30000,
          max: 30000,
        },
      ],
      is7702: false,
      totalGasEstimate: 51000,
      totalGasLimit: 51000,
      usedBatch: true,
    });
  });

  it('uses per-transaction estimation when there is only one transaction', async () => {
    estimateGasLimitMock.mockResolvedValueOnce({
      estimate: 21000,
      max: 21000,
      usedFallback: false,
    });

    const result = await estimateQuoteGasLimits({
      messenger,
      transactions: [TRANSACTIONS_MOCK[0]],
    });

    expect(estimateGasBatchMock).not.toHaveBeenCalled();
    expect(result.is7702).toBe(false);
    expect(result.usedBatch).toBe(false);
  });

  it('uses batch estimation when the source chain supports EIP-7702', async () => {
    getGasBufferMock.mockReturnValue(1.5);
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 50000,
      gasLimits: [50000],
    });

    const result = await estimateQuoteGasLimits({
      fallbackOnSimulationFailure: true,
      messenger,
      transactions: TRANSACTIONS_MOCK,
    });

    expect(estimateGasLimitMock).not.toHaveBeenCalled();
    expect(estimateGasBatchMock).toHaveBeenCalledWith({
      chainId: '0x1',
      from: TRANSACTIONS_MOCK[0].from,
      transactions: [
        expect.objectContaining({
          data: TRANSACTIONS_MOCK[0].data,
          to: TRANSACTIONS_MOCK[0].to,
        }),
        expect.objectContaining({
          data: TRANSACTIONS_MOCK[1].data,
          gas: '0x7530',
          to: TRANSACTIONS_MOCK[1].to,
        }),
      ],
    });
    expect(result).toStrictEqual({
      batchGasLimit: {
        estimate: 75000,
        max: 75000,
      },
      gasLimits: [
        {
          estimate: 75000,
          max: 75000,
        },
      ],
      is7702: true,
      totalGasEstimate: 75000,
      totalGasLimit: 75000,
      usedBatch: true,
    });
  });

  it('marks batch estimates that require an authorization list', async () => {
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 50000,
      gasLimits: [50000],
      requiresAuthorizationList: true,
    });

    const result = await estimateQuoteGasLimits({
      messenger,
      transactions: TRANSACTIONS_MOCK,
    });

    expect(result).toStrictEqual({
      batchGasLimit: {
        estimate: 50000,
        max: 50000,
      },
      gasLimits: [
        {
          estimate: 50000,
          max: 50000,
        },
      ],
      is7702: true,
      requiresAuthorizationList: true,
      totalGasEstimate: 50000,
      totalGasLimit: 50000,
      usedBatch: true,
    });
  });

  it('uses per-transaction batch gas limits and preserves provided gas when it already matches', async () => {
    getGasBufferMock.mockReturnValue(1.5);
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 51000,
      gasLimits: [21000, 30000],
    });

    const result = await estimateQuoteGasLimits({
      messenger,
      transactions: TRANSACTIONS_MOCK,
    });

    expect(result).toStrictEqual({
      gasLimits: [
        {
          estimate: 31500,
          max: 31500,
        },
        {
          estimate: 30000,
          max: 30000,
        },
      ],
      is7702: false,
      totalGasEstimate: 61500,
      totalGasLimit: 61500,
      usedBatch: true,
    });
  });

  it('buffers per-transaction batch gas when a provided gas value is overridden', async () => {
    getGasBufferMock.mockReturnValue(1.5);
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 56000,
      gasLimits: [21000, 35000],
    });

    const result = await estimateQuoteGasLimits({
      messenger,
      transactions: TRANSACTIONS_MOCK,
    });

    expect(result).toStrictEqual({
      gasLimits: [
        {
          estimate: 31500,
          max: 31500,
        },
        {
          estimate: 52500,
          max: 52500,
        },
      ],
      is7702: false,
      totalGasEstimate: 84000,
      totalGasLimit: 84000,
      usedBatch: true,
    });
  });

  it('throws when batch estimation fails', async () => {
    estimateGasBatchMock.mockRejectedValue(
      new Error('Batch estimation failed'),
    );

    await expect(
      estimateQuoteGasLimits({
        fallbackOnSimulationFailure: true,
        messenger,
        transactions: TRANSACTIONS_MOCK,
      }),
    ).rejects.toThrow('Batch estimation failed');

    expect(estimateGasBatchMock).toHaveBeenCalledTimes(1);
    expect(estimateGasLimitMock).not.toHaveBeenCalled();
  });

  it('throws when batch returns an unexpected gas limit count', async () => {
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 123000,
      gasLimits: [21000, 30000, 72000],
    });

    await expect(
      estimateQuoteGasLimits({
        messenger,
        transactions: TRANSACTIONS_MOCK,
      }),
    ).rejects.toThrow('Unexpected batch gas limit count');

    expect(estimateGasBatchMock).toHaveBeenCalledTimes(1);
    expect(estimateGasLimitMock).not.toHaveBeenCalled();
  });

  it('treats numeric gas values as provided gas limits', async () => {
    const result = await estimateQuoteGasLimits({
      messenger,
      transactions: [
        {
          ...TRANSACTIONS_MOCK[0],
          gas: 42000,
        },
      ],
    });

    expect(estimateGasBatchMock).not.toHaveBeenCalled();
    expect(estimateGasLimitMock).not.toHaveBeenCalled();
    expect(result).toStrictEqual({
      gasLimits: [
        {
          estimate: 42000,
          max: 42000,
        },
      ],
      is7702: false,
      totalGasEstimate: 42000,
      totalGasLimit: 42000,
      usedBatch: false,
    });
  });

  it('defaults missing transaction values to zero for per-transaction estimation', async () => {
    estimateGasLimitMock.mockResolvedValueOnce({
      estimate: 21000,
      max: 21000,
      usedFallback: false,
    });

    await estimateQuoteGasLimits({
      messenger,
      transactions: [
        {
          chainId: '0x1' as Hex,
          data: '0xaaaa' as Hex,
          from: '0x1234567890123456789012345678901234567891' as Hex,
          to: '0x1111111111111111111111111111111111111111' as Hex,
        },
      ],
    });

    expect(estimateGasLimitMock).toHaveBeenCalledWith(
      expect.objectContaining({
        value: '0x0',
      }),
    );
  });

  it('defaults missing transaction values to zero for batch estimation', async () => {
    estimateGasBatchMock.mockResolvedValue({
      totalGasLimit: 50000,
      gasLimits: [50000],
    });

    await estimateQuoteGasLimits({
      messenger,
      transactions: TRANSACTIONS_MOCK.map(({ value, ...transaction }) => ({
        ...transaction,
      })),
    });

    expect(estimateGasBatchMock).toHaveBeenCalledWith({
      chainId: '0x1',
      from: TRANSACTIONS_MOCK[0].from,
      transactions: [
        expect.objectContaining({
          value: '0x0',
        }),
        expect.objectContaining({
          value: '0x0',
        }),
      ],
    });
  });

  describe('on batch simulation failure', () => {
    const SIMULATION_FAILS_MOCK = {
      reason: 'estimate failed',
      debug: {},
    };

    it('throws when simulation fails and fallbackOnSimulationFailure is false', async () => {
      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 99999999,
        gasLimits: [99999999],
        simulationFails: SIMULATION_FAILS_MOCK,
      });

      await expect(
        estimateQuoteGasLimits({
          messenger,
          transactions: TRANSACTIONS_MOCK,
        }),
      ).rejects.toThrow('Batch gas estimation failed: estimate failed');
    });

    it('throws with a generic reason when simulation fails without a reason', async () => {
      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 99999999,
        gasLimits: [99999999],
        simulationFails: { debug: {} },
      });

      await expect(
        estimateQuoteGasLimits({
          messenger,
          transactions: TRANSACTIONS_MOCK,
        }),
      ).rejects.toThrow('Batch gas estimation failed: unknown reason');
    });

    it('uses feature-flag fallback for the EIP-7702 batch when simulation fails', async () => {
      getGasBufferMock.mockReturnValue(1.5);
      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 99999999,
        gasLimits: [99999999],
        simulationFails: SIMULATION_FAILS_MOCK,
        requiresAuthorizationList: true,
      });

      const result = await estimateQuoteGasLimits({
        fallbackOnSimulationFailure: true,
        messenger,
        transactions: TRANSACTIONS_MOCK,
      });

      expect(result).toStrictEqual({
        batchGasLimit: {
          estimate: 300000,
          max: 600000,
        },
        gasLimits: [
          {
            estimate: 300000,
            max: 600000,
          },
        ],
        is7702: true,
        requiresAuthorizationList: true,
        totalGasEstimate: 600000,
        totalGasLimit: 600000,
        usedBatch: true,
      });
    });

    it('uses caller-provided fallbackGas over the feature-flag fallback', async () => {
      getGasBufferMock.mockReturnValue(1);
      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 99999999,
        gasLimits: [99999999],
        simulationFails: SIMULATION_FAILS_MOCK,
      });

      const result = await estimateQuoteGasLimits({
        fallbackGas: { estimate: 50000, max: 75000 },
        fallbackOnSimulationFailure: true,
        messenger,
        transactions: TRANSACTIONS_MOCK,
      });

      expect(getFallbackGasMock).not.toHaveBeenCalled();
      expect(result.batchGasLimit).toStrictEqual({
        estimate: 50000,
        max: 75000,
      });
      expect(result.totalGasLimit).toBe(75000);
    });

    it('fans out the fallback per transaction for non-7702 batch on simulation failure', async () => {
      getGasBufferMock.mockReturnValue(1);
      estimateGasBatchMock.mockResolvedValue({
        totalGasLimit: 99999999,
        gasLimits: [99999999, 99999999],
        simulationFails: SIMULATION_FAILS_MOCK,
      });

      const result = await estimateQuoteGasLimits({
        fallbackOnSimulationFailure: true,
        messenger,
        transactions: TRANSACTIONS_MOCK,
      });

      expect(result).toStrictEqual({
        gasLimits: [
          { estimate: 200000, max: 400000 },
          { estimate: 200000, max: 400000 },
        ],
        is7702: false,
        totalGasEstimate: 800000,
        totalGasLimit: 800000,
        usedBatch: true,
      });
    });
  });
});
