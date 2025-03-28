import { type Hex } from '@metamask/utils';

import { OracleLayer1GasFeeFlow } from './OracleLayer1GasFeeFlow';
import { CHAIN_IDS } from '../constants';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';

const OPTIMISM_STACK_CHAIN_IDS: Hex[] = [
  CHAIN_IDS.OPTIMISM,
  CHAIN_IDS.OPTIMISM_TESTNET,
  CHAIN_IDS.BASE,
  CHAIN_IDS.BASE_TESTNET,
  CHAIN_IDS.OPBNB,
  CHAIN_IDS.OPBNB_TESTNET,
  CHAIN_IDS.ZORA,
];

// BlockExplorer link: https://optimistic.etherscan.io/address/0x420000000000000000000000000000000000000f#code
const OPTIMISM_GAS_PRICE_ORACLE_ADDRESS =
  '0x420000000000000000000000000000000000000F';

/**
 * Optimism layer 1 gas fee flow that obtains gas fee estimate using an oracle contract.
 */
export class OptimismLayer1GasFeeFlow extends OracleLayer1GasFeeFlow {
  constructor() {
    super(OPTIMISM_GAS_PRICE_ORACLE_ADDRESS);
  }

  matchesTransaction({
    transactionMeta,
  }: {
    transactionMeta: TransactionMeta;
    messenger: TransactionControllerMessenger;
  }): boolean {
    return OPTIMISM_STACK_CHAIN_IDS.includes(transactionMeta.chainId);
  }
}
