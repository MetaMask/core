/* eslint-disable @typescript-eslint/naming-convention */
import { CHAIN_IDS } from '../constants';
import type {
  SecurityAlertResponse,
  SimulationData,
  TransactionMeta,
} from '../types';
import { TransactionStatus } from '../types';
import {
  BLOCK_TIME_ADDITIONAL_SECONDS,
  BLOCKAID_RESULT_TYPE_MALICIOUS,
  RESIMULATE_PARAMS,
  shouldResimulate,
  VALUE_NATIVE_BALANCE_PERCENT_THRESHOLD,
} from './resimulate';
import { isPercentageDifferenceWithinThreshold } from './utils';

jest.mock('./utils');

const CURRENT_TIME_MOCK = 1234567890;
const CURRENT_TIME_SECONDS_MOCK = 1234567;

const SECURITY_ALERT_RESPONSE_MOCK: SecurityAlertResponse = {
  reason: 'TestReason',
  result_type: 'TestResultType',
};

const SIMULATION_DATA_MOCK: SimulationData = {
  nativeBalanceChange: {
    difference: '0x1',
    previousBalance: '0x1',
    newBalance: '0x2',
    isDecrease: false,
  },
  tokenBalanceChanges: [],
};

const TRANSACTION_META_MOCK: TransactionMeta = {
  chainId: CHAIN_IDS.MAINNET,
  id: '123-456',
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

describe('Resimulate Utils', () => {
  const isPercentageDifferenceWithinThresholdMock = jest.mocked(
    isPercentageDifferenceWithinThreshold,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(CURRENT_TIME_MOCK);
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
        isPercentageDifferenceWithinThresholdMock.mockReturnValue(false);

        const result = shouldResimulate(TRANSACTION_META_MOCK, {
          ...TRANSACTION_META_MOCK,
          simulationData: SIMULATION_DATA_MOCK,
        });

        expect(result.resimulate).toBe(true);
      });

      it('includes block time if value does not match native balance difference from simulation', () => {
        isPercentageDifferenceWithinThresholdMock.mockReturnValue(false);

        const result = shouldResimulate(TRANSACTION_META_MOCK, {
          ...TRANSACTION_META_MOCK,
          simulationData: SIMULATION_DATA_MOCK,
        });

        expect(result.blockTime).toBe(
          CURRENT_TIME_SECONDS_MOCK + BLOCK_TIME_ADDITIONAL_SECONDS,
        );
      });

      it('does not resimulate if simulation data changed but value and native balance match', () => {
        isPercentageDifferenceWithinThresholdMock.mockReturnValue(true);

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
        isPercentageDifferenceWithinThresholdMock.mockReturnValue(true);

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

        expect(isPercentageDifferenceWithinThresholdMock).toHaveBeenCalledTimes(
          1,
        );
        expect(isPercentageDifferenceWithinThresholdMock).toHaveBeenCalledWith(
          '0x0',
          '0x0',
          VALUE_NATIVE_BALANCE_PERCENT_THRESHOLD,
        );

        expect(result).toStrictEqual({
          blockTime: undefined,
          resimulate: false,
        });
      });
    });
  });
});
