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
  it.each([false, true])(
    'reports the exact refused exchange payload and preserves the guard error when reporting throws: %s',
    async (reportingThrows) => {
      const request = jest.fn();
      const client = new ExchangeClient({
        wallet: {
          address: '0x1111111111111111111111111111111111111111',
          signTypedData: jest.fn(),
        },
        transport: { isTestnet: false, request },
      });
      const refusal = new Error('scope changed');
      const payload = { signature: { r: `0x${'11'.repeat(32)}` } };
      const onDispatchRefused = jest.fn<void, [unknown]>(() => {
        if (reportingThrows) {
          throw new Error('observer failed');
        }
      });
      const guarded = createGuardedHyperLiquidClient(
        client,
        async () => {
          throw refusal;
        },
        onDispatchRefused,
      );

      await expect(
        guarded.config_.transport.request('exchange', payload),
      ).rejects.toBe(refusal);

      expect(onDispatchRefused.mock.calls).toStrictEqual([[payload]]);
      expect(onDispatchRefused.mock.calls[0]?.[0]).toBe(payload);
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('does not report a refused info request as an exchange request', async () => {
    const request = jest.fn();
    const client = new ExchangeClient({
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
        signTypedData: jest.fn(),
      },
      transport: { isTestnet: false, request },
    });
    const refusal = new Error('scope changed');
    const onDispatchRefused = jest.fn();
    const guarded = createGuardedHyperLiquidClient(
      client,
      async () => {
        throw refusal;
      },
      onDispatchRefused,
    );

    await expect(
      guarded.config_.transport.request('info', { type: 'meta' }),
    ).rejects.toBe(refusal);

    expect(onDispatchRefused).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('leaves dispatched transport failures to the reporting transport', async () => {
    const failure = new Error('fetch failed');
    const request = jest.fn().mockRejectedValue(failure);
    const client = new ExchangeClient({
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
        signTypedData: jest.fn(),
      },
      transport: { isTestnet: false, request },
    });
    const onDispatchRefused = jest.fn();
    const guarded = createGuardedHyperLiquidClient(
      client,
      jest.fn().mockResolvedValue(undefined),
      onDispatchRefused,
    );
    const payload = { action: { type: 'cancel' } };

    await expect(
      guarded.config_.transport.request('exchange', payload),
    ).rejects.toBe(failure);

    expect(request.mock.calls).toStrictEqual([
      ['exchange', payload, undefined],
    ]);
    expect(onDispatchRefused).not.toHaveBeenCalled();
  });

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
