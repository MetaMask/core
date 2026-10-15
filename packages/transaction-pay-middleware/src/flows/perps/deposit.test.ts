import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';

import { perpsDepositFlow } from './deposit.js';

const FROM = '0x1234567890123456789012345678901234567890' as Hex;
const BRIDGE_ARG =
  '0000000000000000000000002df1c51e09aecf9cacb7bc98cb1742757f163df7';

describe('perpsDepositFlow', () => {
  it('builds a USDC transfer to the Hyperliquid bridge on Arbitrum', () => {
    expect(
      perpsDepositFlow.build({
        type: 'perpsDeposit',
        from: FROM,
        amount: '10',
      }),
    ).toStrictEqual({
      chainId: '0xa4b1',
      transactionParams: {
        from: FROM,
        to: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        value: '0x0',
        data: `0xa9059cbb${BRIDGE_ARG}${'989680'.padStart(64, '0')}`,
        gas: '0x186a0',
      },
      type: TransactionType.perpsDeposit,
      skipInitialGasEstimate: true,
    });
  });

  it('encodes a zero amount when none is given', () => {
    const { transactionParams } = perpsDepositFlow.build({
      type: 'perpsDeposit',
      from: FROM,
    });

    expect(transactionParams.data).toBe(
      `0xa9059cbb${BRIDGE_ARG}${'0'.repeat(64)}`,
    );
  });

  it('has no extra flag requirement', () => {
    expect(perpsDepositFlow.isEnabled).toBeUndefined();
  });
});
