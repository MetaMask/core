import type { TransactionParams } from '../types';
import { getTransactionParamsWithIncreasedGasFee } from './retry';

const RATE_MOCK = 16;
const VALUE_MOCK = '0x111';
const VALUE_MOCK_2 = '0x222';
const VALUE_MOCK_3 = '0x333';
const VALUE_MOCK_4 = '0x444';
const VALUE_MOCK_5 = '0x555';
const VALUE_MOCK_6 = '0x666';
const VALUE_MULTIPLIED_MOCK = '0x1110';
const VALUE_MULTIPLIED_MOCK_2 = '0x2220';

const TRANSACTION_PARAMS_MOCK: TransactionParams = {
  from: '0x1',
  to: '0x2',
};

describe('Retry Utils', () => {
  describe('getTransactionParamsWithIncreasedGasFee', () => {
    describe('if provided value', () => {
      it('uses provided gas price value', () => {
        const result = getTransactionParamsWithIncreasedGasFee(
          {
            ...TRANSACTION_PARAMS_MOCK,
            gasPrice: VALUE_MOCK,
            maxFeePerGas: VALUE_MOCK_2,
          },
          RATE_MOCK,
          {
            gasPrice: VALUE_MOCK_3,
          },
        );

        expect(result).toStrictEqual({
          ...TRANSACTION_PARAMS_MOCK,
          gasPrice: VALUE_MOCK_3,
        });
      });

      it('uses provided 1559 values', () => {
        const result = getTransactionParamsWithIncreasedGasFee(
          {
            ...TRANSACTION_PARAMS_MOCK,
            gasPrice: VALUE_MOCK,
            maxFeePerGas: VALUE_MOCK_2,
            maxPriorityFeePerGas: VALUE_MOCK_3,
          },
          RATE_MOCK,
          {
            maxFeePerGas: VALUE_MOCK_4,
            maxPriorityFeePerGas: VALUE_MOCK_5,
          },
        );

        expect(result).toStrictEqual({
          ...TRANSACTION_PARAMS_MOCK,
          maxFeePerGas: VALUE_MOCK_4,
          maxPriorityFeePerGas: VALUE_MOCK_5,
        });
      });

      it('uses provided 1559 values if gas price value also provided', () => {
        const result = getTransactionParamsWithIncreasedGasFee(
          {
            ...TRANSACTION_PARAMS_MOCK,
            gasPrice: VALUE_MOCK,
            maxFeePerGas: VALUE_MOCK_2,
            maxPriorityFeePerGas: VALUE_MOCK_3,
          },
          RATE_MOCK,
          {
            gasPrice: VALUE_MOCK_4,
            maxFeePerGas: VALUE_MOCK_5,
            maxPriorityFeePerGas: VALUE_MOCK_6,
          },
        );

        expect(result).toStrictEqual({
          ...TRANSACTION_PARAMS_MOCK,
          maxFeePerGas: VALUE_MOCK_5,
          maxPriorityFeePerGas: VALUE_MOCK_6,
        });
      });
    });

    describe('if no provided values', () => {
      it('multiplies current gas price by rate', () => {
        const result = getTransactionParamsWithIncreasedGasFee(
          {
            ...TRANSACTION_PARAMS_MOCK,
            gasPrice: VALUE_MOCK,
          },
          RATE_MOCK,
        );

        expect(result).toStrictEqual({
          ...TRANSACTION_PARAMS_MOCK,
          gasPrice: VALUE_MULTIPLIED_MOCK,
        });
      });

      it('multiplies 1559 values by rate', () => {
        const result = getTransactionParamsWithIncreasedGasFee(
          {
            ...TRANSACTION_PARAMS_MOCK,
            maxFeePerGas: VALUE_MOCK,
            maxPriorityFeePerGas: VALUE_MOCK_2,
          },
          RATE_MOCK,
        );

        expect(result).toStrictEqual({
          ...TRANSACTION_PARAMS_MOCK,
          maxFeePerGas: VALUE_MULTIPLIED_MOCK,
          maxPriorityFeePerGas: VALUE_MULTIPLIED_MOCK_2,
        });
      });

      it('multiplies 1559 values by rate if also current gas price', () => {
        const result = getTransactionParamsWithIncreasedGasFee(
          {
            ...TRANSACTION_PARAMS_MOCK,
            maxFeePerGas: VALUE_MOCK,
            maxPriorityFeePerGas: VALUE_MOCK_2,
            gasPrice: VALUE_MOCK_3,
          },
          RATE_MOCK,
        );

        expect(result).toStrictEqual({
          ...TRANSACTION_PARAMS_MOCK,
          maxFeePerGas: VALUE_MULTIPLIED_MOCK,
          maxPriorityFeePerGas: VALUE_MULTIPLIED_MOCK_2,
        });
      });

      it('multiplies gas price value by rate if 1559 values are zero', () => {
        const result = getTransactionParamsWithIncreasedGasFee(
          {
            ...TRANSACTION_PARAMS_MOCK,
            maxFeePerGas: '0x0',
            maxPriorityFeePerGas: '0x0',
            gasPrice: VALUE_MOCK,
          },
          RATE_MOCK,
        );

        expect(result).toStrictEqual({
          ...TRANSACTION_PARAMS_MOCK,
          gasPrice: VALUE_MULTIPLIED_MOCK,
        });
      });
    });

    it('throws if no provided values and no current values', () => {
      expect(() =>
        getTransactionParamsWithIncreasedGasFee(
          TRANSACTION_PARAMS_MOCK,
          RATE_MOCK,
        ),
      ).toThrow(
        'Cannot increase gas fee as no current values and no new values were provided',
      );
    });

    it('throws if no provided values and current values are zero', () => {
      expect(() =>
        getTransactionParamsWithIncreasedGasFee(
          {
            ...TRANSACTION_PARAMS_MOCK,
            gasPrice: '0x0',
            maxFeePerGas: '0x0',
            maxPriorityFeePerGas: '0x0',
          },
          RATE_MOCK,
        ),
      ).toThrow(
        'Cannot increase gas fee as no current values and no new values were provided',
      );
    });
  });
});
