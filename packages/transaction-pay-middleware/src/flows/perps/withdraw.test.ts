import { TransactionType } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import { perpsWithdrawFlow } from './withdraw.js';

const FROM = '0x1234567890abcdef1234567890abcdef12345678' as Hex;

describe('perpsWithdrawFlow', () => {
  it('builds a USDC transfer to from on Arbitrum', () => {
    expect(
      perpsWithdrawFlow.build({
        type: 'perpsWithdraw',
        from: FROM,
        amount: '5',
      }),
    ).toStrictEqual({
      chainId: '0xa4b1',
      transactionParams: {
        from: FROM,
        to: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        value: '0x0',
        data: `0xa9059cbb${FROM.slice(2).padStart(64, '0')}${'4c4b40'.padStart(64, '0')}`,
      },
      type: TransactionType.perpsWithdraw,
      skipInitialGasEstimate: true,
    });
  });

  it('is enabled only when the in-wallet withdraw flow is', () => {
    expect(
      perpsWithdrawFlow.isEnabled?.({
        // eslint-disable-next-line @typescript-eslint/naming-convention
        confirmations_pay_post_quote: { default: { enabled: true } },
      }),
    ).toBe(true);
    expect(perpsWithdrawFlow.isEnabled?.({})).toBe(false);
  });
});
