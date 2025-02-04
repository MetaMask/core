import {
  FeeMarketEIP1559Transaction,
  LegacyTransaction,
  TransactionType,
} from '@ethereumjs/tx';
import { hexToBytes } from '@ethereumjs/util';

import { prepareTransaction, serializeTransaction } from './prepare';
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
