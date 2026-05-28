import { webcrypto } from 'crypto';

import { createSecretRecoveryPhrase } from './utilities';
import { Wallet } from './Wallet';

const TEST_PASSWORD = 'testpass';

describe('createSecretRecoveryPhrase', () => {
  beforeAll(() => {
    // We can remove this once we drop Node 18
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    globalThis.crypto ??= webcrypto as typeof globalThis.crypto;

    // eslint-disable-next-line no-restricted-syntax
    if (!('CryptoKey' in globalThis)) {
      Object.defineProperty(globalThis, 'CryptoKey', {
        value: webcrypto.CryptoKey,
      });
    }
  });

  it('creates a vault and populates accounts', async () => {
    const wallet = new Wallet({});

    await createSecretRecoveryPhrase(wallet, TEST_PASSWORD);

    expect(
      await wallet.messenger.call('KeyringController:getAccounts'),
    ).toHaveLength(1);
  });
});
