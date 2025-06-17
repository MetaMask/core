import {
  FeeMarketEIP1559Transaction,
  LegacyTransaction,
  EOACodeEIP7702Transaction,
} from '@ethereumjs/tx';

import { prepareTransaction, serializeTransaction } from './prepare';
import type { Authorization } from '../types';
import { TransactionEnvelopeType, type TransactionParams } from '../types';

const CHAIN_ID_MOCK = '0x123';

const SERIALIZED_TRANSACTION =
  '0xea808301234582012394123456789012345678901234567890123456789084123456788412345678808080';

const SERIALIZED_TRANSACTION_FEE_MARKET =
  '0x02f4820123808401234567841234567882012394123456789012345678901234567890123456789084123456788412345678c0808080';

const TRANSACTION_PARAMS_MOCK: TransactionParams = {
  data: '0x12345678',
  from: '0x1234567890123456789012345678901234567890',
  gasLimit: '0x123',
  gasPrice: '0x12345',
  to: '0x1234567890123456789012345678901234567890',
  value: '0x12345678',
};

const TRANSACTION_PARAMS_FEE_MARKET_MOCK: TransactionParams = {
  ...TRANSACTION_PARAMS_MOCK,
  type: TransactionEnvelopeType.feeMarket,
  maxFeePerGas: '0x12345678',
  maxPriorityFeePerGas: '0x1234567',
};

const TRANSACTION_PARAMS_SET_CODE_MOCK: TransactionParams = {
  ...TRANSACTION_PARAMS_MOCK,
  type: TransactionEnvelopeType.setCode,
  authorizationList: [
    {
      address: '0x0034567890123456789012345678901234567890',
      chainId: '0x123',
      // @ts-expect-error Wrong nonce type in `ethereumjs/tx`.
      nonce: ['0x1'],
      r: '0x1234567890123456789012345678901234567890123456789012345678901234',
      s: '0x1234567890123456789012345678901234567890123456789012345678901235',
      yParity: '0x1',
    },
  ],
};

describe('Prepare Utils', () => {
  describe('prepareTransaction', () => {
    it('returns legacy transaction object', () => {
      const result = prepareTransaction(CHAIN_ID_MOCK, TRANSACTION_PARAMS_MOCK);
      expect(result).toBeInstanceOf(LegacyTransaction);
    });

    it('returns fee market transaction object', () => {
      const result = prepareTransaction(
        CHAIN_ID_MOCK,
        TRANSACTION_PARAMS_FEE_MARKET_MOCK,
      );
      expect(result).toBeInstanceOf(FeeMarketEIP1559Transaction);
    });

    it('returns set code transaction object', () => {
      const result = prepareTransaction(
        CHAIN_ID_MOCK,
        TRANSACTION_PARAMS_SET_CODE_MOCK,
      );
      expect(result).toBeInstanceOf(EOACodeEIP7702Transaction);
    });

    describe('removes leading zeroes', () => {
      it.each(['r', 's'] as const)('from authorization %s', (propertyName) => {
        const transaction = prepareTransaction(CHAIN_ID_MOCK, {
          ...TRANSACTION_PARAMS_SET_CODE_MOCK,
          authorizationList: [
            {
              ...TRANSACTION_PARAMS_SET_CODE_MOCK.authorizationList?.[0],
              [propertyName]:
                '0x0034567890123456789012345678901234567890123456789012345678901234',
            } as Authorization,
          ],
        }) as EOACodeEIP7702Transaction;

        expect(transaction.AuthorizationListJSON[0][propertyName]).toBe(
          '0x34567890123456789012345678901234567890123456789012345678901234',
        );
      });

      it('from authorization yParity', () => {
        const transaction = prepareTransaction(CHAIN_ID_MOCK, {
          ...TRANSACTION_PARAMS_SET_CODE_MOCK,
          authorizationList: [
            {
              ...TRANSACTION_PARAMS_SET_CODE_MOCK.authorizationList?.[0],
              yParity: '0x0',
            } as Authorization,
          ],
        }) as EOACodeEIP7702Transaction;

        expect(transaction.AuthorizationListJSON[0].yParity).toBe('0x');
      });

      it('including multiple pairs', () => {
        const transaction = prepareTransaction(CHAIN_ID_MOCK, {
          ...TRANSACTION_PARAMS_SET_CODE_MOCK,
          authorizationList: [
            {
              ...TRANSACTION_PARAMS_SET_CODE_MOCK.authorizationList?.[0],
              r: '0x0000007890123456789012345678901234567890123456789012345678901234',
            } as Authorization,
          ],
        }) as EOACodeEIP7702Transaction;

        expect(transaction.AuthorizationListJSON[0].r).toBe(
          '0x7890123456789012345678901234567890123456789012345678901234',
        );
      });

      it('allows zero nibbles', () => {
        const transaction = prepareTransaction(CHAIN_ID_MOCK, {
          ...TRANSACTION_PARAMS_SET_CODE_MOCK,
          authorizationList: [
            {
              ...TRANSACTION_PARAMS_SET_CODE_MOCK.authorizationList?.[0],
              r: '0x0200567890123456789012345678901234567890123456789012345678901234',
            } as Authorization,
          ],
        }) as EOACodeEIP7702Transaction;

        expect(transaction.AuthorizationListJSON[0].r).toBe(
          '0x0200567890123456789012345678901234567890123456789012345678901234',
        );
      });
    });
  });

  describe('serializeTransaction', () => {
    it('returns hex string for legacy transaction', () => {
      const transaction = prepareTransaction(
        CHAIN_ID_MOCK,
        TRANSACTION_PARAMS_MOCK,
      );

      const result = serializeTransaction(transaction);
      expect(result).toStrictEqual(SERIALIZED_TRANSACTION);
    });

    it('returns hex string for fee market transaction', () => {
      const transaction = prepareTransaction(
        CHAIN_ID_MOCK,
        TRANSACTION_PARAMS_FEE_MARKET_MOCK,
      );

      const result = serializeTransaction(transaction);
      expect(result).toStrictEqual(SERIALIZED_TRANSACTION_FEE_MARKET);
    });
  });
});
