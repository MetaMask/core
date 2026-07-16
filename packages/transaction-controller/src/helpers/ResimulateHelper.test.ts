import { jest } from '@jest/globals';
import { NetworkType } from '@metamask/controller-utils';
import type { NetworkClientId } from '@metamask/network-controller';
import { BN } from 'bn.js';

import { CHAIN_IDS } from '../constants.js';
import type {
  TransactionMeta,
  SecurityAlertResponse,
  SimulationData,
  SimulationTokenBalanceChange,
} from '../types.js';
import { TransactionStatus, SimulationTokenStandard } from '../types.js';
import { getPercentageChange } from '../utils/utils.js';
import {
  ResimulateHelper,
  BLOCK_TIME_ADDITIONAL_SECONDS,
  BLOCKAID_RESULT_TYPE_MALICIOUS,
  hasSimulationDataChanged,
  RESIMULATE_PARAMS,
  shouldResimulate,
  VALUE_COMPARISON_PERCENT_THRESHOLD,
  RESIMULATE_INTERVAL_MS,
} from './ResimulateHelper.js';
import type { ResimulateHelperOptions } from './ResimulateHelper.js';

const CURRENT_TIME_MOCK = 1234567890;
const CURRENT_TIME_SECONDS_MOCK = 1234567;

const SECURITY_ALERT_RESPONSE_MOCK: SecurityAlertResponse = {
  reason: 'TestReason',
  result_type: 'TestResultType',
};

const TOKEN_BALANCE_CHANGE_MOCK: SimulationTokenBalanceChange = {
  address: '0x1',
  standard: SimulationTokenStandard.erc20,
  difference: '0x1',
  previousBalance: '0x1',
  newBalance: '0x2',
  isDecrease: true,
};

const SIMULATION_DATA_MOCK: SimulationData = {
  nativeBalanceChange: {
    difference: '0x1',
    previousBalance: '0x1',
    newBalance: '0x2',
    isDecrease: true,
  },
  tokenBalanceChanges: [],
};

const SIMULATION_DATA_2_MOCK: SimulationData = {
  nativeBalanceChange: {
    difference: '0x1',
    previousBalance: '0x2',
    newBalance: '0x3',
    isDecrease: false,
  },
  tokenBalanceChanges: [],
};

const TRANSACTION_META_MOCK: TransactionMeta = {
  chainId: CHAIN_IDS.MAINNET,
  id: '123-456',
  networkClientId: NetworkType.mainnet,
  securityAlertResponse: SECURITY_ALERT_RESPONSE_MOCK,
  status: TransactionStatus.unapproved,
  time: 1234567890,
  txParams: {
    data: '0x1',
    from: '0x2',
    to: '0x3',
    value: '0x4',
  },
};

const mockTransactionMeta = {
  id: '1',
  networkClientId: 'network1' as NetworkClientId,
  isActive: true,
  status: TransactionStatus.unapproved,
} as TransactionMeta;

jest.mock('../utils/utils');

describe('ResimulateHelper', () => {
  let getTransactionsMock: jest.Mock<() => TransactionMeta[]>;
  let simulateTransactionMock: jest.Mock<
    (transactionMeta: TransactionMeta) => Promise<void>
  >;
  let onTransactionsUpdateMock: jest.Mock<(listener: () => void) => void>;

  /**
   * Triggers onStateChange callback
   */
  function triggerStateChange(): void {
    onTransactionsUpdateMock.mock.calls[0][0]();
  }

  /**
   * Flushes the microtask queue so the resimulation promise chain settles and
   * the next timer is scheduled before advancing fake timers again.
   */
  async function flushPromises(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  }

  /**
   * Mocks getTransactions to always return the given transactions argument.
   * The resimulation timer reads the latest state on each tick, so the mock
   * must persist across calls rather than returning a value only once.
   *
   * @param transactions - Transactions to be returned
   */
  function mockGetTransactions(transactions: TransactionMeta[]): void {
    getTransactionsMock.mockReturnValue(
      transactions as unknown as ResimulateHelperOptions['getTransactions'],
    );
  }

  beforeEach(() => {
    jest.useFakeTimers();
    getTransactionsMock = jest.fn();
    onTransactionsUpdateMock = jest.fn();
    simulateTransactionMock = jest.fn().mockResolvedValue(undefined);

    // eslint-disable-next-line no-new
    new ResimulateHelper({
      getTransactions: getTransactionsMock,
      onTransactionsUpdate: onTransactionsUpdateMock,
      simulateTransaction: simulateTransactionMock,
    } as unknown as ResimulateHelperOptions);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  it(`resimulates unapproved active transaction every ${RESIMULATE_INTERVAL_MS} milliseconds`, async () => {
    mockGetTransactions([mockTransactionMeta]);
    triggerStateChange();

    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS);
    await flushPromises();

    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS);
    await flushPromises();

    expect(simulateTransactionMock).toHaveBeenCalledWith(mockTransactionMeta);
    expect(simulateTransactionMock).toHaveBeenCalledTimes(2);
  });

  it('resimulates with the latest transaction after it is updated', async () => {
    const updatedTransactionMeta = {
      ...mockTransactionMeta,
      txParams: {
        ...mockTransactionMeta.txParams,
        data: '0x2',
      },
    } as TransactionMeta;

    mockGetTransactions([mockTransactionMeta]);
    triggerStateChange();

    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS);
    await flushPromises();

    expect(simulateTransactionMock).toHaveBeenNthCalledWith(
      1,
      mockTransactionMeta,
    );

    mockGetTransactions([updatedTransactionMeta]);
    triggerStateChange();

    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS);
    await flushPromises();

    expect(simulateTransactionMock).toHaveBeenNthCalledWith(
      2,
      updatedTransactionMeta,
    );
    expect(simulateTransactionMock).toHaveBeenCalledTimes(2);
  });

  it(`does not resimulate twice the same transaction even if state change is triggered twice`, async () => {
    mockGetTransactions([mockTransactionMeta]);
    triggerStateChange();

    // Halfway through the interval
    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS / 2);

    // Assume state change is triggered again
    triggerStateChange();

    // Halfway through the interval
    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS / 2);

    expect(simulateTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('does not resimulate a transaction that is no longer active', () => {
    mockGetTransactions([mockTransactionMeta]);
    triggerStateChange();

    // Halfway through the interval
    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS / 2);

    const inactiveTransactionMeta = {
      ...mockTransactionMeta,
      isActive: false,
    } as TransactionMeta;

    mockGetTransactions([inactiveTransactionMeta]);
    triggerStateChange();

    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS / 2);

    expect(simulateTransactionMock).toHaveBeenCalledTimes(0);
  });

  it('does not resimulate a transaction that is not active', () => {
    const inactiveTransactionMeta = {
      ...mockTransactionMeta,
      isActive: false,
    } as TransactionMeta;

    mockGetTransactions([inactiveTransactionMeta]);
    triggerStateChange();

    jest.advanceTimersByTime(2 * RESIMULATE_INTERVAL_MS);

    expect(simulateTransactionMock).toHaveBeenCalledTimes(0);
  });

  it('stops resimulating a transaction that is no longer in the transaction list', () => {
    mockGetTransactions([mockTransactionMeta]);
    triggerStateChange();

    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS);

    mockGetTransactions([]);
    triggerStateChange();

    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS);

    expect(simulateTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('stops resimulating when the transaction disappears between ticks', async () => {
    mockGetTransactions([mockTransactionMeta]);
    triggerStateChange();

    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS);
    await flushPromises();

    expect(simulateTransactionMock).toHaveBeenCalledTimes(1);

    // The transaction is removed without a state change being triggered, so
    // the running timer must detect this on its next tick and stop itself.
    mockGetTransactions([]);

    jest.advanceTimersByTime(RESIMULATE_INTERVAL_MS);
    await flushPromises();

    expect(simulateTransactionMock).toHaveBeenCalledTimes(1);
  });
});

describe('Resimulate Utils', () => {
  const getPercentageChangeMock = jest.mocked(getPercentageChange);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(CURRENT_TIME_MOCK);

    getPercentageChangeMock.mockReturnValue(0);
  });

  describe('shouldResimulate', () => {
    it('does not resimulate if metadata unchanged', () => {
      const result = shouldResimulate(
        TRANSACTION_META_MOCK,
        TRANSACTION_META_MOCK,
      );

      expect(result).toStrictEqual({
        blockTime: undefined,
        resimulate: false,
      });
    });

    describe('Parameters', () => {
      it.each(RESIMULATE_PARAMS)(
        'resimulates if %s parameter updated',
        (param) => {
          const result = shouldResimulate(TRANSACTION_META_MOCK, {
            ...TRANSACTION_META_MOCK,
            txParams: {
              ...TRANSACTION_META_MOCK.txParams,
              [param]: '0x6',
            },
          });

          expect(result).toStrictEqual({
            blockTime: undefined,
            resimulate: true,
          });
        },
      );

      it('does not resimulate if no original params', () => {
        const result = shouldResimulate(
          { ...TRANSACTION_META_MOCK, txParams: undefined } as never,
          TRANSACTION_META_MOCK,
        );

        expect(result).toStrictEqual({
          blockTime: undefined,
          resimulate: false,
        });
      });
    });

    describe('Security Alert', () => {
      it('resimulates if security alert updated and malicious', () => {
        const result = shouldResimulate(TRANSACTION_META_MOCK, {
          ...TRANSACTION_META_MOCK,
          securityAlertResponse: {
            ...SECURITY_ALERT_RESPONSE_MOCK,
            result_type: BLOCKAID_RESULT_TYPE_MALICIOUS,
          },
        });

        expect(result.resimulate).toBe(true);
      });

      it('includes block time if security alert updated and malicious', () => {
        const result = shouldResimulate(TRANSACTION_META_MOCK, {
          ...TRANSACTION_META_MOCK,
          securityAlertResponse: {
            ...SECURITY_ALERT_RESPONSE_MOCK,
            result_type: BLOCKAID_RESULT_TYPE_MALICIOUS,
          },
        });

        expect(result.blockTime).toBe(
          CURRENT_TIME_SECONDS_MOCK + BLOCK_TIME_ADDITIONAL_SECONDS,
        );
      });

      it('does not resimulate if security alert updated but not malicious', () => {
        const result = shouldResimulate(TRANSACTION_META_MOCK, {
          ...TRANSACTION_META_MOCK,
          securityAlertResponse: {
            ...SECURITY_ALERT_RESPONSE_MOCK,
            result_type: 'TestResultType2',
          },
        });

        expect(result).toStrictEqual({
          blockTime: undefined,
          resimulate: false,
        });
      });
    });

    describe('Value & Native Balance', () => {
      it('resimulates if value does not match native balance difference from simulation', () => {
        getPercentageChangeMock.mockReturnValueOnce(
          VALUE_COMPARISON_PERCENT_THRESHOLD + 1,
        );

        const result = shouldResimulate(TRANSACTION_META_MOCK, {
          ...TRANSACTION_META_MOCK,
          simulationData: SIMULATION_DATA_MOCK,
        });

        expect(result.resimulate).toBe(true);
      });

      it('includes block time if value does not match native balance difference from simulation', () => {
        getPercentageChangeMock.mockReturnValueOnce(
          VALUE_COMPARISON_PERCENT_THRESHOLD + 1,
        );

        const result = shouldResimulate(TRANSACTION_META_MOCK, {
          ...TRANSACTION_META_MOCK,
          simulationData: SIMULATION_DATA_MOCK,
        });

        expect(result.blockTime).toBe(
          CURRENT_TIME_SECONDS_MOCK + BLOCK_TIME_ADDITIONAL_SECONDS,
        );
      });

      it('does not resimulate if simulation data changed but value and native balance match', () => {
        getPercentageChangeMock.mockReturnValueOnce(0);

        const result = shouldResimulate(TRANSACTION_META_MOCK, {
          ...TRANSACTION_META_MOCK,
          simulationData: SIMULATION_DATA_MOCK,
        });

        expect(result).toStrictEqual({
          blockTime: undefined,
          resimulate: false,
        });
      });

      it('does not resimulate if simulation data changed but value and native balance not specified', () => {
        const result = shouldResimulate(
          {
            ...TRANSACTION_META_MOCK,
            txParams: {
              ...TRANSACTION_META_MOCK.txParams,
              value: undefined,
            },
          },
          {
            ...TRANSACTION_META_MOCK,
            txParams: {
              ...TRANSACTION_META_MOCK.txParams,
              value: undefined,
            },
            simulationData: {
              ...SIMULATION_DATA_MOCK,
              nativeBalanceChange: undefined,
            },
          },
        );

        expect(getPercentageChangeMock).toHaveBeenCalledTimes(1);
        expect(getPercentageChangeMock).toHaveBeenCalledWith(
          new BN(0),
          new BN(0),
        );

        expect(result).toStrictEqual({
          blockTime: undefined,
          resimulate: false,
        });
      });
    });
  });

  describe('hasSimulationDataChanged', () => {
    it('returns false if simulation data unchanged', () => {
      const result = hasSimulationDataChanged(
        SIMULATION_DATA_MOCK,
        SIMULATION_DATA_MOCK,
      );

      expect(result).toBe(false);
    });

    it('returns true if native balance changed', () => {
      getPercentageChangeMock.mockReturnValueOnce(
        VALUE_COMPARISON_PERCENT_THRESHOLD + 1,
      );

      const result = hasSimulationDataChanged(
        SIMULATION_DATA_MOCK,
        SIMULATION_DATA_2_MOCK,
      );

      expect(result).toBe(true);
    });

    it('returns true if token balance count does not match', () => {
      getPercentageChangeMock.mockReturnValueOnce(0);

      const result = hasSimulationDataChanged(SIMULATION_DATA_MOCK, {
        ...SIMULATION_DATA_MOCK,
        tokenBalanceChanges: [TOKEN_BALANCE_CHANGE_MOCK],
      });

      expect(result).toBe(true);
    });

    it('returns true if token balance does not match', () => {
      getPercentageChangeMock
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(VALUE_COMPARISON_PERCENT_THRESHOLD + 1);

      const result = hasSimulationDataChanged(
        {
          ...SIMULATION_DATA_MOCK,
          tokenBalanceChanges: [TOKEN_BALANCE_CHANGE_MOCK],
        },
        {
          ...SIMULATION_DATA_MOCK,
          tokenBalanceChanges: [
            { ...TOKEN_BALANCE_CHANGE_MOCK, difference: '0x2' },
          ],
        },
      );

      expect(result).toBe(true);
    });

    it('returns false if token balance changed but within threshold', () => {
      getPercentageChangeMock
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(VALUE_COMPARISON_PERCENT_THRESHOLD);

      const result = hasSimulationDataChanged(
        {
          ...SIMULATION_DATA_MOCK,
          tokenBalanceChanges: [TOKEN_BALANCE_CHANGE_MOCK],
        },
        {
          ...SIMULATION_DATA_MOCK,
          tokenBalanceChanges: [
            { ...TOKEN_BALANCE_CHANGE_MOCK, difference: '0x2' },
          ],
        },
      );

      expect(result).toBe(false);
    });

    it('returns true if new token balance not found', () => {
      getPercentageChangeMock.mockReturnValueOnce(0).mockReturnValueOnce(0);

      const result = hasSimulationDataChanged(
        {
          ...SIMULATION_DATA_MOCK,
          tokenBalanceChanges: [TOKEN_BALANCE_CHANGE_MOCK],
        },
        {
          ...SIMULATION_DATA_MOCK,
          tokenBalanceChanges: [
            { ...TOKEN_BALANCE_CHANGE_MOCK, address: '0x2' },
          ],
        },
      );

      expect(result).toBe(true);
    });

    it('supports increased balance', () => {
      getPercentageChangeMock
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(VALUE_COMPARISON_PERCENT_THRESHOLD + 1);

      const result = hasSimulationDataChanged(
        {
          ...SIMULATION_DATA_MOCK,
          tokenBalanceChanges: [TOKEN_BALANCE_CHANGE_MOCK],
        },
        {
          ...SIMULATION_DATA_MOCK,
          tokenBalanceChanges: [
            { ...TOKEN_BALANCE_CHANGE_MOCK, isDecrease: false },
          ],
        },
      );

      expect(getPercentageChangeMock).toHaveBeenCalledTimes(2);
      expect(getPercentageChangeMock).toHaveBeenNthCalledWith(
        2,
        new BN(1),
        new BN(-1),
      );

      expect(result).toBe(true);
    });
  });
});
