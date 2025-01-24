import type {
  BlockTracker,
  NetworkClientId,
} from '@metamask/network-controller';
import { NetworkType } from '@metamask/controller-utils';
import { BN } from 'bn.js';

import { CHAIN_IDS } from '../constants';

import {
  type ResimulateHelperOptions,
  ResimulateHelper,
  BLOCK_TIME_ADDITIONAL_SECONDS,
  BLOCKAID_RESULT_TYPE_MALICIOUS,
  hasSimulationDataChanged,
  RESIMULATE_PARAMS,
  shouldResimulate,
  VALUE_COMPARISON_PERCENT_THRESHOLD,
} from './ResimulateHelper';
import type {
  TransactionMeta,
  SecurityAlertResponse,
  SimulationData,
  SimulationTokenBalanceChange,
} from '../types';
import { TransactionStatus, SimulationTokenStandard } from '../types';
import { getPercentageChange } from '../utils/utils';

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
  isFocused: true,
  status: TransactionStatus.unapproved,
} as TransactionMeta;

jest.mock('../utils/utils');

describe('ResimulateHelper', () => {
  let blockTrackerMock: jest.Mocked<BlockTracker>;
  let getBlockTrackerMock: jest.Mock<
    (networkClientId: NetworkClientId) => BlockTracker
  >;
  let getTransactionsMock: jest.Mock<() => TransactionMeta[]>;
  let updateSimulationDataMock: jest.Mock<
    (transactionMeta: TransactionMeta) => void
  >;
  let onStateChangeMock: jest.Mock<(listener: () => void) => void>;

  let resimulateHelper: ResimulateHelper;

  beforeEach(() => {
    blockTrackerMock = {
      on: jest.fn(),
      removeListener: jest.fn(),
    } as unknown as jest.Mocked<BlockTracker>;

    getBlockTrackerMock = jest.fn().mockReturnValue(blockTrackerMock);
    getTransactionsMock = jest.fn();
    onStateChangeMock = jest.fn();
    updateSimulationDataMock = jest.fn();

    resimulateHelper = new ResimulateHelper({
      getBlockTracker: getBlockTrackerMock,
      getTransactions: getTransactionsMock,
      onStateChange: onStateChangeMock,
      updateSimulationData: updateSimulationDataMock,
    } as unknown as ResimulateHelperOptions);
  });

  it('assigns a block tracker listener to resimulate for a focused transaction', () => {
    resimulateHelper.start(mockTransactionMeta);

    expect(getBlockTrackerMock).toHaveBeenCalledWith(
      mockTransactionMeta.networkClientId,
    );
    expect(blockTrackerMock.on).toHaveBeenCalledWith(
      'latest',
      expect.any(Function),
    );
  });

  it('removes a block tracker listener for a transaction that is no longer focused', () => {
    resimulateHelper.start(mockTransactionMeta);

    const unfocusedTransactionMeta = {
      ...mockTransactionMeta,
      isFocused: false,
    } as TransactionMeta;

    resimulateHelper.stop(unfocusedTransactionMeta);

    expect(blockTrackerMock.removeListener).toHaveBeenCalledWith(
      'latest',
      expect.any(Function),
    );
  });

  it('does not add a block tracker listener for a transaction that is not focused', () => {
    resimulateHelper.start({
      ...mockTransactionMeta,
      isFocused: false,
    });

    expect(blockTrackerMock.on).not.toHaveBeenCalled();
  });

  it('does not add a block tracker listener for a transaction that is already resimulating', () => {
    resimulateHelper.start(mockTransactionMeta);
    resimulateHelper.start(mockTransactionMeta);

    expect(blockTrackerMock.on).toHaveBeenCalledTimes(1);
  });

  it('does not remove a block tracker listener for a transaction that is not resimulating', () => {
    resimulateHelper.stop(mockTransactionMeta);

    expect(blockTrackerMock.on).toHaveBeenCalledTimes(0);
  });

  describe('on Transaction Controller state change', () => {
    it('start and stop resimulations depending on the isFocused state', async () => {
      const firstTransactionMeta = {
        ...mockTransactionMeta,
        networkClientId: 'network1' as NetworkClientId,
        id: '1',
      } as TransactionMeta;

      const secondTransactionMeta = {
        ...mockTransactionMeta,
        networkClientId: 'network2' as NetworkClientId,
        id: '2',
      } as TransactionMeta;

      // Assume both transactions are started to put them in the activeResimulations state
      resimulateHelper.start(firstTransactionMeta);
      resimulateHelper.start(secondTransactionMeta);

      expect(getBlockTrackerMock).toHaveBeenCalledWith(
        firstTransactionMeta.networkClientId,
      );
      expect(getBlockTrackerMock).toHaveBeenCalledWith(
        secondTransactionMeta.networkClientId,
      );

      // Assume both transactions are still in the transaction list but second is not focused anymore
      getTransactionsMock.mockReturnValueOnce([
        firstTransactionMeta,
        {
          ...secondTransactionMeta,
          isFocused: false,
        },
      ] as unknown as ResimulateHelperOptions['getTransactions']);

      // Manually trigger the state change listener
      onStateChangeMock.mock.calls[0][0]();

      expect(blockTrackerMock.removeListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );

      // Manually trigger the block tracker listener
      const firstTransactionListener = blockTrackerMock.on.mock.calls[0][1];
      await firstTransactionListener();

      // Assert that first transaction is still in the activeResimulations state
      expect(updateSimulationDataMock).toHaveBeenCalledWith(
        firstTransactionMeta,
      );
    });

    it('forces to stop resimulation for a transaction that is no longer in transaction list', async () => {
      const firstTransactionMeta = {
        ...mockTransactionMeta,
        networkClientId: 'network1' as NetworkClientId,
        id: '1',
      } as TransactionMeta;

      const secondTransactionMeta = {
        ...mockTransactionMeta,
        networkClientId: 'network2' as NetworkClientId,
        id: '2',
      } as TransactionMeta;

      // Assume both transactions are started to put them in the activeResimulations state
      resimulateHelper.start(firstTransactionMeta);
      resimulateHelper.start(secondTransactionMeta);

      // On next state change, first transaction is still in the transaction list but second is not
      getTransactionsMock.mockReturnValueOnce([
        firstTransactionMeta,
      ] as unknown as ResimulateHelperOptions['getTransactions']);

      // Manually trigger the state change listener
      onStateChangeMock.mock.calls[0][0]();

      expect(blockTrackerMock.removeListener).toHaveBeenCalledWith(
        'latest',
        expect.any(Function),
      );

      // Manually trigger the block tracker listener
      const firstTransactionListener = blockTrackerMock.on.mock.calls[0][1];
      await firstTransactionListener();

      // Assert that first transaction is still in the activeResimulations state
      expect(updateSimulationDataMock).toHaveBeenCalledWith(
        firstTransactionMeta,
      );
    });
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
