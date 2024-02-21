import { CHAIN_IDS } from '../constants';
import type { Layer1GasFeeFlow, TransactionMeta } from '../types';
import { getLayer1GasFeeFlow } from './layer1-gas-fee-flow';

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
