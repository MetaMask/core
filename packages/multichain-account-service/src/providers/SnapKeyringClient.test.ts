import { SolScope } from '@metamask/keyring-api';

import { createSnapKeyringClient } from './SnapKeyringClient.js';
import type { Sender } from './SnapKeyringClient.js';

/**
 * Builds a mock {@link Sender} whose `send` resolves to the given response.
 *
 * @param response - The value the sender should resolve to.
 * @returns The mock sender and its `send` jest mock.
 */
function makeSender(response: unknown = []): {
  sender: Sender;
  send: jest.Mock;
} {
  const send = jest.fn().mockResolvedValue(response);
  return { sender: { send } as unknown as Sender, send };
}

describe('createSnapKeyringClient', () => {
  describe('v1 client', () => {
    it('gets accounts', async () => {
      const { sender, send } = makeSender([]);
      const client = createSnapKeyringClient(sender, false);

      expect(await client.getAccounts()).toStrictEqual([]);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'keyring_listAccounts' }),
      );
    });

    it('deletes an account', async () => {
      const { sender, send } = makeSender(null);
      const client = createSnapKeyringClient(sender, false);

      await client.deleteAccount('account-id');
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'keyring_deleteAccount' }),
      );
    });

    it('discovers accounts', async () => {
      const { sender, send } = makeSender([]);
      const client = createSnapKeyringClient(sender, false);

      expect(
        await client.discoverAccounts([SolScope.Mainnet], 'entropy', 0),
      ).toStrictEqual([]);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'keyring_discoverAccounts' }),
      );
    });
  });

  describe('v2 client', () => {
    it('gets accounts via getAccounts', async () => {
      const { sender, send } = makeSender([]);
      const client = createSnapKeyringClient(sender, true);

      expect(await client.getAccounts()).toStrictEqual([]);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'keyring_getAccounts' }),
      );
    });

    it('deletes an account', async () => {
      const { sender, send } = makeSender(null);
      const client = createSnapKeyringClient(sender, true);

      await client.deleteAccount('account-id');
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'keyring_deleteAccount' }),
      );
    });

    it('throws for discoverAccounts (unsupported on v2)', async () => {
      const { sender } = makeSender();
      const client = createSnapKeyringClient(sender, true);

      await expect(
        client.discoverAccounts([SolScope.Mainnet], 'entropy', 0),
      ).rejects.toThrow(
        'discoverAccounts is not supported on the v2 keyring client',
      );
    });
  });
});
