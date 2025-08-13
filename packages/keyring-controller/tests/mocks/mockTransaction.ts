import { TransactionFactory, type TypedTxData } from '@ethereumjs/tx';

/**
 * Build a mock transaction, optionally overriding
 * any of the default values.
 *
 * @param options - The transaction options to override.
 * @returns The mock transaction.
 */
export const buildMockTransaction = (options: TypedTxData = {}) =>
  TransactionFactory.fromTxData({
    to: '0xB1A13aBECeB71b2E758c7e0Da404DF0C72Ca3a12',
    value: '0x0',
    data: '0x',
    gasPrice: '0x0',
    nonce: '0x0',
    ...options,
  });
