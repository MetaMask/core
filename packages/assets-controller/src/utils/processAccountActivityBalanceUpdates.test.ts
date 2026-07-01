import type { BalanceUpdate } from '@metamask/core-backend';

import type { Caip19AssetId } from '../types';
import { processAccountActivityBalanceUpdates } from './processAccountActivityBalanceUpdates';

describe('processAccountActivityBalanceUpdates', () => {
  it('converts hex postBalance to human-readable amount', () => {
    const accountId = 'account-1';
    const assetId = 'eip155:42161/slip44:60' as Caip19AssetId;
    const updates = [
      {
        asset: {
          fungible: true,
          type: assetId,
          unit: 'ETH',
          decimals: 18,
        },
        postBalance: { amount: '0x10aa6d94e80' },
        transfers: [],
      },
    ] as BalanceUpdate[];

    const response = processAccountActivityBalanceUpdates(
      updates,
      accountId,
      () => 'native',
    );

    expect(response.updateMode).toBe('merge');
    expect(response.assetsBalance?.[accountId]?.[assetId]).toStrictEqual({
      amount: '0.00000114526056',
    });
    expect(response.assetsInfo?.[assetId]).toMatchObject({
      type: 'native',
      symbol: 'ETH',
      decimals: 18,
    });
  });
});
