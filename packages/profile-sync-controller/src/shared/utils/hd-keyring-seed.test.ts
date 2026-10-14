import { KeyringType } from '@metamask/keyring-api/v2';

import { getHdKeyringSeed } from './hd-keyring-seed.js';

describe('getHdKeyringSeed', () => {
  it('returns the HD keyring seed for a matching entropy source id', async () => {
    const seed = new Uint8Array(64).fill(7);
    const messenger = {
      call: jest.fn(async (_action, _selector, operation) =>
        operation({
          keyring: { type: KeyringType.Hd, seed },
          metadata: { id: 'entropy-1', name: '' },
        }),
      ),
    };

    expect(await getHdKeyringSeed(messenger, 'entropy-1')).toBe(seed);
    expect(messenger.call).toHaveBeenCalledWith(
      'KeyringController:withKeyringV2Unsafe',
      { id: 'entropy-1' },
      expect.any(Function),
    );
  });

  it('throws when the keyring is not an HD keyring with a seed', async () => {
    const messenger = {
      call: jest.fn(async (_action, _selector, operation) =>
        operation({
          keyring: { type: KeyringType.Snap },
          metadata: { id: 'missing', name: '' },
        }),
      ),
    };

    await expect(getHdKeyringSeed(messenger, 'missing')).rejects.toThrow(
      'Entropy source not found or is not an HD keyring.',
    );
  });
});
