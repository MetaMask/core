import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Password, Srp } from './secrets';
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
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_PASSWORD = 'integration-pass';
const INFURA_PROJECT_ID = 'fake-infura-project-id';

// SRP import runs a real KDF and SQLite writes; the default 5s jest timeout
// is occasionally tight on slower CI hardware.
jest.setTimeout(30_000);

const createdTempDbPaths: string[] = [];

/**
 * Build a unique on-disk SQLite path under the OS temp dir and remember it
 * for `afterAll` cleanup. Includes a random suffix so concurrent test runs
 * cannot collide.
 *
 * @param label - A short label that makes the resulting filename traceable.
 * @returns An absolute file path inside `os.tmpdir()`.
 */
function createTempDbPath(label: string): string {
  const path = join(
    tmpdir(),
    `wallet-cli-it-${label}-${process.pid}-${Date.now()}-${Math.random()}.db`,
  );
  createdTempDbPaths.push(path);
  return path;
}

describe('createWallet (real Wallet, in-memory)', () => {
  it('constructs an unlocked wallet on first run and dispatches messenger actions', async () => {
    const { wallet, dispose } = await createWallet({
      databasePath: ':memory:',
      password: Password.from(TEST_PASSWORD),
      srp: Srp.from(TEST_PHRASE),
      infuraProjectId: INFURA_PROJECT_ID,
      log: () => undefined,
    });

    try {
      expect(wallet.state.KeyringController?.isUnlocked).toBe(true);

      // `getState` resolves synchronously; awaiting a non-thenable trips
      // `@typescript-eslint/await-thenable`.
      const { keyrings } = wallet.messenger.call('KeyringController:getState');
      expect(keyrings[0]?.accounts[0]).toMatch(/^0x[0-9a-fA-F]{40}$/u);
    } finally {
      await dispose();
    }
  });
});

describe('createWallet (integration)', () => {
  afterAll(() => {
    while (createdTempDbPaths.length > 0) {
      const path = createdTempDbPaths.pop() as string;
      for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
        rmSync(candidate, { force: true });
      }
    }
  });

  it('imports the SRP on first run and lists accounts via the messenger', async () => {
    const databasePath = createTempDbPath('first-run');

    const { wallet, dispose } = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: Password.from(TEST_PASSWORD),
      srp: Srp.from(TEST_PHRASE),
    });

    try {
      expect(wallet.state.KeyringController.isUnlocked).toBe(true);
      const accounts = wallet.messenger.call('AccountsController:listAccounts');
      expect(accounts).toHaveLength(1);
    } finally {
      await dispose();
    }
  });

  it('auto-unlocks on a subsequent run when the password is supplied', async () => {
    const databasePath = createTempDbPath('subsequent-unlock');

    const first = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: Password.from(TEST_PASSWORD),
      srp: Srp.from(TEST_PHRASE),
    });
    const firstAddress = first.wallet.messenger
      .call('AccountsController:listAccounts')
      .map((account) => account.address)[0];
    await first.dispose();

    const second = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: Password.from(TEST_PASSWORD),
      srp: Srp.from(TEST_PHRASE),
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
      await second.dispose();
    }
  });

  it('starts a subsequent run locked when no password is supplied, then unlocks via submitPassword', async () => {
    const databasePath = createTempDbPath('subsequent-no-password');

    const first = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: Password.from(TEST_PASSWORD),
      srp: Srp.from(TEST_PHRASE),
    });
    await first.dispose();

    const second = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      srp: Srp.from(TEST_PHRASE),
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
      await second.dispose();
    }
  });

  it('rejects subsequent-run startup with a wrong password and leaves the DB usable for a retry', async () => {
    const databasePath = createTempDbPath('wrong-password');

    const first = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: Password.from(TEST_PASSWORD),
      srp: Srp.from(TEST_PHRASE),
    });
    await first.dispose();

    await expect(
      createWallet({
        databasePath,
        infuraProjectId: INFURA_PROJECT_ID,
        password: Password.from('definitely-not-the-right-password'),
        srp: Srp.from(TEST_PHRASE),
      }),
    ).rejects.toThrow(/incorrect password|decrypt/iu);

    // The DB must be untouched: a retry with the real password still works.
    const retry = await createWallet({
      databasePath,
      infuraProjectId: INFURA_PROJECT_ID,
      password: Password.from(TEST_PASSWORD),
      srp: Srp.from(TEST_PHRASE),
    });

    try {
      expect(retry.wallet.state.KeyringController.isUnlocked).toBe(true);
      expect(
        retry.wallet.messenger.call('AccountsController:listAccounts'),
      ).toHaveLength(1);
    } finally {
      await retry.dispose();
    }
  });
});
