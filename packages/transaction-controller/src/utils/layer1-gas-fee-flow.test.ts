import { BN } from 'ethereumjs-util';

import { CHAIN_IDS } from '../constants';
import type { Layer1GasFeeFlow, TransactionMeta } from '../types';
import {
  getLayer1GasFeeFlow,
  buildUnserializedTransaction,
} from './layer1-gas-fee-flow';

const MOCK_UNSUPPORTED_CHAIN_ID = '0xunsupported';

describe('getLayer1GasFeeFlow', () => {
  const mockLayer1GasFeeFlows = [
    {
      matchesTransaction: (transactionMeta: TransactionMeta) =>
        transactionMeta.chainId === CHAIN_IDS.OPTIMISM,
    },
    {
      matchesTransaction: (transactionMeta: TransactionMeta) =>
        transactionMeta.chainId === CHAIN_IDS.BASE,
    },
  ] as Layer1GasFeeFlow[];

  it('should return the correct Layer1GasFeeFlow based on the transactionMeta', () => {
    const transactionMetaOptimism = {
      chainId: CHAIN_IDS.OPTIMISM,
    } as unknown as TransactionMeta;
    const transactionMetaBase = {
      chainId: CHAIN_IDS.BASE,
    } as unknown as TransactionMeta;

    expect(
      getLayer1GasFeeFlow(transactionMetaOptimism, mockLayer1GasFeeFlows),
    ).toBe(mockLayer1GasFeeFlows[0]);
    expect(
      getLayer1GasFeeFlow(transactionMetaBase, mockLayer1GasFeeFlows),
    ).toBe(mockLayer1GasFeeFlows[1]);
  });

  it('should return undefined if no Layer1GasFeeFlow matches the transactionMeta', () => {
    const transactionMetaUnsupported = {
      chainId: MOCK_UNSUPPORTED_CHAIN_ID,
    } as unknown as TransactionMeta;
    expect(
      getLayer1GasFeeFlow(transactionMetaUnsupported, mockLayer1GasFeeFlows),
    ).toBeUndefined();
  });
});

describe('buildUnserializedTransaction', () => {
  it('returns a transaction that can be serialized and fed to an Optimism smart contract', () => {
    const unserializedTransaction = buildUnserializedTransaction({
      txParams: {
        nonce: '0x0',
        gasPrice: `0x${new BN('100').toString(16)}`,
        gas: `0x${new BN('21000').toString(16)}`,
        to: '0x0000000000000000000000000000000000000000',
        value: `0x${new BN('10000000000000').toString(16)}`,
        data: '0x0',
      },
    } as unknown as TransactionMeta);
    expect(unserializedTransaction.toJSON()).toMatchObject({
      nonce: '0x0',
      gasPrice: '0x64',
      gasLimit: '0x5208',
      to: '0x0000000000000000000000000000000000000000',
      value: '0x9184e72a000',
      data: '0x00',
    });
  });
});
