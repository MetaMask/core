import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { getAcrossOrderedTransactions } from './transactions.js';
import type { AcrossSwapApprovalResponse } from './types.js';

const QUOTE_MOCK: AcrossSwapApprovalResponse = {
  approvalTxns: [
    {
      chainId: undefined,
      data: '0xaaaa',
      to: '0xapprove',
    },
  ],
  inputToken: {
    address: '0xabc',
    chainId: 1,
    decimals: 18,
  },
  outputToken: {
    address: '0xdef',
    chainId: 2,
    decimals: 6,
  },
  swapTx: {
    chainId: 10,
    data: '0xdeadbeef',
    to: '0xswap',
  },
};

describe('getAcrossOrderedTransactions', () => {
  it('falls back to the swap chain id when an approval transaction omits chainId', () => {
    expect(getAcrossOrderedTransactions({ quote: QUOTE_MOCK })).toStrictEqual([
      {
        chainId: 10,
        data: '0xaaaa',
        kind: 'approval',
        to: '0xapprove',
        type: TransactionType.tokenMethodApprove,
      },
      {
        chainId: 10,
        data: '0xdeadbeef',
        kind: 'swap',
        to: '0xswap',
        type: undefined,
      },
    ]);
  });
});
