import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createWallet } from './wallet-factory';

/**
 * Real-Wallet integration tests for `createWallet`. Every other suite in this
 * package mocks `@metamask/wallet` and `@metamask/remote-feature-flag-controller`;
 * these tests intentionally do not, so they exercise the actual
 * KeyringController encryption + persistence flow. They are slower than the
 * unit tests (real KDF + SQLite I/O) but guard against bugs that only show
 * up across the full lifecycle: that the persisted vault really survives a
 * restart, that `KeyringController:submitPassword` is the correct messenger
 * action to unlock it, and that a wrong password is surfaced cleanly without
 * leaving the daemon wedged.
 */

const TEST_PHRASE =
  'test test test test test test test test test test test ball';
const TEST_PASSWORD = 'integration-pass';
const INFURA_PROJECT_ID = 'fake-infura-project-id';

// SRP import runs a real KDF and SQLite writes; the default 5s jest timeout
// is occasionally tight on slower CI hardware.
jest.setTimeout(30_000);

const createdTempDbPaths: string[] = [];

/**
 * Build a unique on-disk SQLite path under the OS temp dir and remember it
 * for `afterEach` cleanup. Includes a random suffix so concurrent test runs
 * cannot collide.
 *
 * @param label - A short label that makes the resulting filename traceable.
 * @returns An absolute file path inside `os.tmpdir()`.
 */
function tempDbPath(label: string): string {
  const path = join(
    tmpdir(),
    `wallet-cli-it-${label}-${process.pid}-${Date.now()}-${Math.random()}.db`,
  );
  createdTempDbPaths.push(path);
  return path;
}

describe('createWallet (integration)', () => {
  afterEach(() => {
    while (createdTempDbPaths.length > 0) {
      const path = createdTempDbPaths.pop() as string;
      for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
        rmSync(candidate, { force: true });
      }
    }
  });

  it('imports the SRP on first run and lists accounts via the messenger', async () => {
    const databasePath = tempDbPath('first-run');

    const { wallet, store } = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: TEST_PASSWORD,
      srp: TEST_PHRASE,
    });

    try {
      expect(wallet.state.KeyringController.isUnlocked).toBe(true);
      const accounts = wallet.messenger.call('AccountsController:listAccounts');
      expect(accounts).toHaveLength(1);
    } finally {
      await wallet.destroy();
      store.close();
    }
  });

  it('auto-unlocks on a subsequent run when the password is supplied', async () => {
    const databasePath = tempDbPath('subsequent-unlock');

    const first = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: TEST_PASSWORD,
      srp: TEST_PHRASE,
    });
    const firstAddress = first.wallet.messenger
      .call('AccountsController:listAccounts')
      .map((account) => account.address)[0];
    await first.wallet.destroy();
    first.store.close();

    const second = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: TEST_PASSWORD,
      srp: TEST_PHRASE,
    });

    try {
      expect(second.wallet.state.KeyringController.isUnlocked).toBe(true);
      const accounts = second.wallet.messenger.call(
        'AccountsController:listAccounts',
      );
      expect(accounts.map((account) => account.address)).toStrictEqual([
        firstAddress,
      ]);
    } finally {
      await second.wallet.destroy();
      second.store.close();
    }
  });

  it('starts a subsequent run locked when no password is supplied, then unlocks via submitPassword', async () => {
    const databasePath = tempDbPath('subsequent-no-password');

    const first = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: TEST_PASSWORD,
      srp: TEST_PHRASE,
    });
    await first.wallet.destroy();
    first.store.close();

    const second = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      srp: TEST_PHRASE,
    });

    try {
      expect(second.wallet.state.KeyringController.isUnlocked).toBe(false);

      await second.wallet.messenger.call(
        'KeyringController:submitPassword',
        TEST_PASSWORD,
      );

      expect(second.wallet.state.KeyringController.isUnlocked).toBe(true);
      expect(
        second.wallet.messenger.call('AccountsController:listAccounts'),
      ).toHaveLength(1);
    } finally {
      await second.wallet.destroy();
      second.store.close();
    }
  });

  it('rejects subsequent-run startup with a wrong password and leaves the DB usable for a retry', async () => {
    const databasePath = tempDbPath('wrong-password');

    const first = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: TEST_PASSWORD,
      srp: TEST_PHRASE,
    });
    await first.wallet.destroy();
    first.store.close();

    await expect(
      createWallet({
        databasePath,
        infuraProjectId: INFURA_PROJECT_ID,
        password: 'definitely-not-the-right-password',
        srp: TEST_PHRASE,
      }),
    ).rejects.toThrow(/incorrect password|decrypt/iu);

    // The DB must be untouched: a retry with the real password still works.
    const retry = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: TEST_PASSWORD,
      srp: TEST_PHRASE,
    });

    try {
      expect(retry.wallet.state.KeyringController.isUnlocked).toBe(true);
      expect(
        retry.wallet.messenger.call('AccountsController:listAccounts'),
      ).toHaveLength(1);
    } finally {
      await retry.wallet.destroy();
      retry.store.close();
    }
  });
});
