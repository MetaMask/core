import { type Hex } from '@metamask/utils';

import { CHAIN_IDS } from '../constants';
import type { TransactionMeta } from '../types';
import { OracleLayer1GasFeeFlow } from './OracleLayer1GasFeeFlow';

const SCROLL_CHAIN_IDS: Hex[] = [CHAIN_IDS.SCROLL, CHAIN_IDS.SCROLL_SEPOLIA];

// BlockExplorer link: https://scrollscan.com/address/0x5300000000000000000000000000000000000002#code
const SCROLL_GAS_PRICE_ORACLE_ADDRESS =
  '0x5300000000000000000000000000000000000002';

/**
 * Scroll layer 1 gas fee flow that obtains gas fee estimate using an oracle contract.
 */
export class ScrollLayer1GasFeeFlow extends OracleLayer1GasFeeFlow {
  constructor() {
    super(SCROLL_GAS_PRICE_ORACLE_ADDRESS, true);
  }

  matchesTransaction(transactionMeta: TransactionMeta): boolean {
    return SCROLL_CHAIN_IDS.includes(transactionMeta.chainId);
  }
}
