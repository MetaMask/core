import { ExchangeClient } from '@nktkas/hyperliquid';

import { createGuardedHyperLiquidClient } from '../../../src/utils/guardedHyperLiquidClient.js';

const order = {
  orders: [
    {
      a: 1,
      b: true,
      p: '3000',
      s: '1',
      r: true,
      t: { limit: { tif: 'Gtc' as const } },
    },
  ],
  grouping: 'na' as const,
};

describe('createGuardedHyperLiquidClient', () => {
  it('preserves SDK signing configuration without changing the shared client or transport', async () => {
    const events: string[] = [];
    const wallet = {
      address: '0x1111111111111111111111111111111111111111' as const,
      signTypedData: async (_args: unknown): Promise<`0x${string}`> => {
        events.push('sign');
        return `0x${'11'.repeat(64)}1b`;
      },
    };
    const request = jest.fn().mockImplementation(async () => {
      events.push('dispatch');
      return {
        status: 'ok',
        response: {
          type: 'order',
          data: { statuses: [{ resting: { oid: 777 } }] },
        },
      };
    });
    const transport = { isTestnet: true, request };
    const nonceManager = jest.fn().mockResolvedValue(1234);
    const client = new ExchangeClient({
      wallet,
      transport,
      nonceManager,
      defaultExpiresAfter: 9999,
    });
    const config = client.config_;
    const guard = jest.fn().mockImplementation(async () => {
      events.push('guard');
    });
    const guarded = createGuardedHyperLiquidClient(client, guard);

    await guarded.order(order);

    expect(events).toStrictEqual(['sign', 'guard', 'dispatch']);
    expect(client.config_).toBe(config);
    expect(client.config_.transport).toBe(transport);
    expect(guarded.config_.wallet).toBe(wallet);
    expect(guarded.config_.nonceManager).toBe(nonceManager);
    expect(nonceManager).toHaveBeenCalledWith(wallet.address);
    expect(request).toHaveBeenCalledWith(
      'exchange',
      expect.objectContaining({ nonce: 1234, expiresAfter: 9999 }),
      undefined,
    );

    guard.mockRejectedValueOnce(new Error('scope changed'));
    await expect(guarded.order(order)).rejects.toThrow('scope changed');
    expect(request).toHaveBeenCalledTimes(1);
    await client.order(order);
    expect(request).toHaveBeenCalledTimes(2);
    expect(guard).toHaveBeenCalledTimes(2);
  });
});
