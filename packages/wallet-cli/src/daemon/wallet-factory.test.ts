import { ClientConfigApiService } from '@metamask/remote-feature-flag-controller';
import { InMemoryStorageAdapter } from '@metamask/storage-service';
import {
  AlwaysOnlineAdapter,
  importSecretRecoveryPhrase,
  Wallet,
} from '@metamask/wallet';
import { rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { KeyValueStore } from '../persistence/KeyValueStore';
import * as persistenceModule from '../persistence/persistence';
import { Password, Srp } from './secrets';
import { createWallet } from './wallet-factory';

jest.mock('@metamask/wallet');
jest.mock('@metamask/remote-feature-flag-controller');
jest.mock('node:fs/promises');

const MockWallet = jest.mocked(Wallet);
const mockImportSrp = jest.mocked(importSecretRecoveryPhrase);
const mockRm = jest.mocked(rm);

const createdTempDbPaths: string[] = [];

const SRP =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const CONFIG = {
  databasePath: ':memory:',
  password: Password.from('test-pass'),
  srp: Srp.from(SRP),
  infuraProjectId: 'test-infura-id',
};

/**
 * Build a mock `Wallet` with a fresh messenger, metadata, and destroy mock.
 * Each `Wallet` construction (the metadata probe, then the real wallet) gets
 * its own instance so the two can be told apart in assertions.
 *
 * @returns A mock `Wallet`.
 */
function makeMockWallet(): Wallet {
  return {
    messenger: {
      call: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    },
    controllerMetadata: {},
    state: {},
    init: jest.fn().mockResolvedValue([]),
    destroy: jest.fn().mockResolvedValue(undefined),
  } as unknown as Wallet;
}

/**
 * Build a unique on-disk path under the OS temp dir so SQLite can create the
 * file, while keeping the test isolated from concurrent runs. The path is
 * tracked and cleaned up after each test (the production `rm` is mocked, so
 * the factory never deletes it during the test itself).
 *
 * @param label - A short label that makes the resulting filename traceable.
 * @returns An absolute file path inside `os.tmpdir()`.
 */
function tempDbPath(label: string): string {
  const path = join(
    tmpdir(),
    `wallet-cli-${label}-${Date.now()}-${Math.random()}.db`,
  );
  createdTempDbPaths.push(path);
  return path;
}

describe('createWallet', () => {
  beforeEach(() => {
    MockWallet.mockImplementation(makeMockWallet);
    mockRm.mockResolvedValue(undefined);
  });

  afterEach(() => {
    while (createdTempDbPaths.length > 0) {
      const path = createdTempDbPaths.pop() as string;
      for (const candidate of [path, `${path}-wal`, `${path}-shm`]) {
        rmSync(candidate, { force: true });
      }
    }
  });

  it('constructs the wallet with the wired instance options', async () => {
    const { dispose } = await createWallet(CONFIG);

    // The wallet is constructed twice: a short-lived metadata probe, then the
    // real wallet.
    expect(MockWallet).toHaveBeenCalledTimes(2);
    const { instanceOptions } = MockWallet.mock.calls[1][0];

    expect(
      instanceOptions.approvalController?.showApprovalRequest?.(),
    ).toBeUndefined();
    expect(
      instanceOptions.connectivityController.connectivityAdapter,
    ).toBeInstanceOf(AlwaysOnlineAdapter);
    expect(instanceOptions.networkController.infuraProjectId).toBe(
      'test-infura-id',
    );
    expect(
      instanceOptions.remoteFeatureFlagController.clientConfigApiService,
    ).toBeInstanceOf(ClientConfigApiService);
    expect(
      instanceOptions.remoteFeatureFlagController.getMetaMetricsId?.(),
    ).toBe('cli');
    expect(instanceOptions.remoteFeatureFlagController.clientVersion).toBe(
      '0.0.0',
    );
    expect(instanceOptions.storageService.storage).toBeInstanceOf(
      InMemoryStorageAdapter,
    );
    expect(ClientConfigApiService).toHaveBeenCalled();

    await dispose();
  });

  it('reads metadata from a throwaway probe wallet and destroys it', async () => {
    const loadStateSpy = jest
      .spyOn(persistenceModule, 'loadState')
      .mockReturnValue({});

    const { dispose } = await createWallet(CONFIG);

    const probe = MockWallet.mock.results[0]?.value as Wallet;
    expect(loadStateSpy).toHaveBeenCalledWith(
      expect.any(KeyValueStore),
      probe.controllerMetadata,
    );
    expect(probe.destroy).toHaveBeenCalledTimes(1);

    await dispose();
  });

  it('logs but tolerates the metadata probe failing to destroy', async () => {
    MockWallet.mockImplementationOnce(
      () =>
        ({
          ...makeMockWallet(),
          destroy: jest.fn().mockRejectedValue(new Error('probe destroy boom')),
        }) as unknown as Wallet,
    );
    const log = jest.fn();

    const { wallet, dispose } = await createWallet({ ...CONFIG, log });

    expect(wallet).toBe(MockWallet.mock.results[1]?.value);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('Metadata probe destroy failed'),
    );
    await dispose();
  });

  it('seeds the real wallet with the state loaded from the store', async () => {
    jest.spyOn(persistenceModule, 'loadState').mockReturnValue({
      AccountsController: {
        internalAccounts: { accounts: {}, selectedAccount: '' },
      },
    });

    const { dispose } = await createWallet(CONFIG);

    expect(MockWallet.mock.calls[1][0].state).toStrictEqual({
      AccountsController: {
        internalAccounts: { accounts: {}, selectedAccount: '' },
      },
    });

    await dispose();
  });

  it('imports the secret recovery phrase on first run', async () => {
    const { wallet, dispose } = await createWallet(CONFIG);

    expect(mockImportSrp).toHaveBeenCalledWith(wallet, 'test-pass', SRP);

    await dispose();
  });

  it('skips importing the SRP when the store already contains a keyring vault', async () => {
    jest.spyOn(persistenceModule, 'loadState').mockReturnValue({
      KeyringController: { vault: 'encrypted-vault-blob' },
    });

    const { dispose } = await createWallet(CONFIG);

    expect(mockImportSrp).not.toHaveBeenCalled();

    await dispose();
  });

  it('returns the real wallet and a dispose function', async () => {
    const { wallet, dispose } = await createWallet(CONFIG);

    expect(wallet).toBe(MockWallet.mock.results[1]?.value);
    expect(typeof dispose).toBe('function');

    await dispose();
  });

  it('subscribes the store to the real wallet state changes', async () => {
    const subscribeSpy = jest
      .spyOn(persistenceModule, 'subscribeToChanges')
      .mockReturnValue(() => undefined);

    const { wallet, dispose } = await createWallet(CONFIG);

    expect(subscribeSpy).toHaveBeenCalledWith(
      wallet.messenger,
      wallet.controllerMetadata,
      expect.any(KeyValueStore),
      expect.any(Function),
    );

    await dispose();
  });

  it('forwards the supplied log callback to subscribeToChanges', async () => {
    const subscribeSpy = jest
      .spyOn(persistenceModule, 'subscribeToChanges')
      .mockReturnValue(() => undefined);
    const log = jest.fn();

    const { dispose } = await createWallet({ ...CONFIG, log });

    expect(subscribeSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      log,
    );

    await dispose();
  });

  it('initializes the real wallet but not the throwaway metadata probe', async () => {
    const { wallet, dispose } = await createWallet(CONFIG);

    const probe = MockWallet.mock.results[0]?.value as Wallet;
    expect(wallet.init).toHaveBeenCalledTimes(1);
    expect(probe.init).not.toHaveBeenCalled();

    await dispose();
  });

  it('subscribes persistence, then initializes, then imports the SRP, in order', async () => {
    const subscribeSpy = jest
      .spyOn(persistenceModule, 'subscribeToChanges')
      .mockReturnValue(() => undefined);

    const { wallet, dispose } = await createWallet(CONFIG);

    const initMock = wallet.init as jest.Mock;
    expect(subscribeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      initMock.mock.invocationCallOrder[0],
    );
    expect(initMock.mock.invocationCallOrder[0]).toBeLessThan(
      mockImportSrp.mock.invocationCallOrder[0],
    );

    await dispose();
  });

  it('skips importing the SRP and unlocks the persisted vault on subsequent runs', async () => {
    jest.spyOn(persistenceModule, 'loadState').mockReturnValue({
      KeyringController: { vault: 'encrypted-vault-blob' },
    });

    const { wallet, dispose } = await createWallet(CONFIG);

    expect(mockImportSrp).not.toHaveBeenCalled();
    expect(wallet.messenger.call).toHaveBeenCalledWith(
      'KeyringController:submitPassword',
      'test-pass',
    );

    await dispose();
  });

  it('does not call submitPassword on first run', async () => {
    const { wallet, dispose } = await createWallet(CONFIG);

    expect(wallet.messenger.call).not.toHaveBeenCalledWith(
      'KeyringController:submitPassword',
      expect.anything(),
    );

    await dispose();
  });

  it('throws a clear error when first-run startup has no password', async () => {
    const { password: _password, ...configWithoutPassword } = CONFIG;

    await expect(createWallet(configWithoutPassword)).rejects.toThrow(
      /password is required on first run/iu,
    );

    expect(mockImportSrp).not.toHaveBeenCalled();
  });

  it('starts subsequent runs with a locked keyring when no password is supplied', async () => {
    jest.spyOn(persistenceModule, 'loadState').mockReturnValue({
      KeyringController: { vault: 'encrypted-vault-blob' },
    });
    const { password: _password, ...configWithoutPassword } = CONFIG;

    const { wallet, dispose } = await createWallet(configWithoutPassword);

    expect(mockImportSrp).not.toHaveBeenCalled();
    expect(wallet.messenger.call).not.toHaveBeenCalledWith(
      'KeyringController:submitPassword',
      expect.anything(),
    );

    await dispose();
  });

  it('destroys the wallet and rethrows when submitPassword rejects on a subsequent run', async () => {
    jest.spyOn(persistenceModule, 'loadState').mockReturnValue({
      KeyringController: { vault: 'encrypted-vault-blob' },
    });
    const failure = new Error('wrong password');
    MockWallet.mockImplementationOnce(makeMockWallet).mockImplementationOnce(
      () =>
        ({
          ...makeMockWallet(),
          messenger: {
            call: jest.fn().mockImplementation((action: string) => {
              if (action === 'KeyringController:submitPassword') {
                return Promise.reject(failure);
              }
              return undefined;
            }),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
          },
        }) as unknown as Wallet,
    );
    const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

    await expect(createWallet(CONFIG)).rejects.toThrow(
      'Failed to unlock the persisted vault',
    );

    const realWallet = MockWallet.mock.results[1]?.value as Wallet;
    expect(realWallet.destroy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('does not remove the database when submitPassword rejects on a subsequent run', async () => {
    jest.spyOn(persistenceModule, 'loadState').mockReturnValue({
      KeyringController: { vault: 'encrypted-vault-blob' },
    });
    MockWallet.mockImplementationOnce(makeMockWallet).mockImplementationOnce(
      () =>
        ({
          ...makeMockWallet(),
          messenger: {
            call: jest.fn().mockImplementation((action: string) => {
              if (action === 'KeyringController:submitPassword') {
                return Promise.reject(new Error('wrong password'));
              }
              return undefined;
            }),
            subscribe: jest.fn(),
            unsubscribe: jest.fn(),
          },
        }) as unknown as Wallet,
    );

    await expect(
      createWallet({
        ...CONFIG,
        databasePath: tempDbPath('subsequent-unlock-failure'),
      }),
    ).rejects.toThrow('wrong password');

    expect(mockRm).not.toHaveBeenCalled();
  });

  it('logs each failed init step, then aborts startup and tears down', async () => {
    const log = jest.fn();
    const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');
    MockWallet.mockImplementationOnce(makeMockWallet).mockImplementationOnce(
      () =>
        ({
          ...makeMockWallet(),
          init: jest.fn().mockResolvedValue([
            { status: 'fulfilled', value: undefined },
            { status: 'rejected', reason: new Error('network init boom') },
          ]),
        }) as unknown as Wallet,
    );

    await expect(createWallet({ ...CONFIG, log })).rejects.toThrow(
      'Wallet initialization failed (1 step(s))',
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining(
        'Wallet init step failed: Error: network init boom',
      ),
    );
    // The SRP is not imported once init has failed, and the wallet/store are
    // torn down rather than left open.
    expect(mockImportSrp).not.toHaveBeenCalled();
    const realWallet = MockWallet.mock.results[1]?.value as Wallet;
    expect(realWallet.destroy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalled();
  });

  describe('dispose', () => {
    it('unsubscribes, destroys the wallet, then closes the store, in order', async () => {
      const unsubscribe = jest.fn();
      jest
        .spyOn(persistenceModule, 'subscribeToChanges')
        .mockReturnValue(unsubscribe);
      const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

      const { wallet, dispose } = await createWallet(CONFIG);
      await dispose();

      const destroyMock = wallet.destroy as jest.Mock;
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(destroyMock).toHaveBeenCalledTimes(1);
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
        destroyMock.mock.invocationCallOrder[0],
      );
      expect(destroyMock.mock.invocationCallOrder[0]).toBeLessThan(
        closeSpy.mock.invocationCallOrder[0],
      );
    });

    it('coalesces repeat calls onto a single teardown', async () => {
      const unsubscribe = jest.fn();
      jest
        .spyOn(persistenceModule, 'subscribeToChanges')
        .mockReturnValue(unsubscribe);
      const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

      const { wallet, dispose } = await createWallet(CONFIG);
      await Promise.all([dispose(), dispose()]);
      await dispose();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(wallet.destroy).toHaveBeenCalledTimes(1);
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it('coalesces repeat calls even when a teardown step throws', async () => {
      const unsubscribe = jest.fn();
      jest
        .spyOn(persistenceModule, 'subscribeToChanges')
        .mockReturnValue(unsubscribe);
      const closeSpy = jest
        .spyOn(KeyValueStore.prototype, 'close')
        .mockImplementation(() => {
          throw new Error('close boom');
        });

      const { wallet, dispose } = await createWallet({
        ...CONFIG,
        log: jest.fn(),
      });
      await dispose();
      await dispose();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(wallet.destroy).toHaveBeenCalledTimes(1);
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it('logs and continues when unsubscribe throws', async () => {
      jest
        .spyOn(persistenceModule, 'subscribeToChanges')
        .mockReturnValue(() => {
          throw new Error('unsub boom');
        });
      const log = jest.fn();
      const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

      const { dispose } = await createWallet({ ...CONFIG, log });
      await dispose();

      expect(log).toHaveBeenCalledWith(
        expect.stringContaining(
          'Persistence unsubscribe failed during teardown',
        ),
      );
      expect(closeSpy).toHaveBeenCalled();
    });

    it('logs and still closes the store when wallet.destroy rejects', async () => {
      const log = jest.fn();
      const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

      const { wallet, dispose } = await createWallet({ ...CONFIG, log });
      (wallet.destroy as jest.Mock).mockRejectedValue(
        new Error('destroy boom'),
      );
      await dispose();

      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('wallet.destroy() failed during teardown'),
      );
      expect(closeSpy).toHaveBeenCalled();
    });

    it('logs when store.close throws', async () => {
      const log = jest.fn();

      const { dispose } = await createWallet({ ...CONFIG, log });
      jest.spyOn(KeyValueStore.prototype, 'close').mockImplementation(() => {
        throw new Error('close boom');
      });
      await dispose();

      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('store.close() failed during teardown'),
      );
    });

    it('falls back to console.error when no logger is supplied', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      jest
        .spyOn(persistenceModule, 'subscribeToChanges')
        .mockReturnValue(() => {
          throw new Error('unsub boom');
        });

      const { dispose } = await createWallet(CONFIG);
      await dispose();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Persistence unsubscribe failed during teardown',
        ),
      );
    });
  });

  describe('startup failure cleanup', () => {
    it('closes the store and rethrows when state hydration fails', async () => {
      const failure = new Error('corrupt store');
      jest.spyOn(persistenceModule, 'loadState').mockImplementation(() => {
        throw failure;
      });
      const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

      await expect(createWallet(CONFIG)).rejects.toThrow(failure);
      expect(closeSpy).toHaveBeenCalled();
      // The probe is still torn down even though loadState threw.
      expect(MockWallet.mock.results[0]?.value.destroy).toHaveBeenCalled();
    });

    it('closes the store and rethrows when the real wallet construction fails', async () => {
      const ctorError = new Error('wallet ctor failed');
      MockWallet.mockImplementationOnce(makeMockWallet).mockImplementationOnce(
        () => {
          throw ctorError;
        },
      );
      const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

      await expect(createWallet(CONFIG)).rejects.toThrow(ctorError);
      expect(closeSpy).toHaveBeenCalled();
    });

    it('destroys the wallet and closes the store when wallet.init rejects', async () => {
      const failure = new Error('init threw');
      MockWallet.mockImplementationOnce(makeMockWallet).mockImplementationOnce(
        () =>
          ({
            ...makeMockWallet(),
            init: jest.fn().mockRejectedValue(failure),
          }) as unknown as Wallet,
      );
      const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

      await expect(createWallet(CONFIG)).rejects.toThrow(failure);
      const realWallet = MockWallet.mock.results[1]?.value as Wallet;
      expect(realWallet.destroy).toHaveBeenCalledTimes(1);
      expect(closeSpy).toHaveBeenCalled();
    });

    it('destroys the wallet and closes the store when subscribeToChanges throws', async () => {
      jest
        .spyOn(persistenceModule, 'subscribeToChanges')
        .mockImplementation(() => {
          throw new Error('subscribe failed');
        });
      const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

      await expect(createWallet(CONFIG)).rejects.toThrow('subscribe failed');
      const realWallet = MockWallet.mock.results[1]?.value as Wallet;
      expect(realWallet.destroy).toHaveBeenCalledTimes(1);
      expect(closeSpy).toHaveBeenCalled();
    });

    it('unsubscribes, destroys the wallet, and closes the store when SRP import rejects on first run', async () => {
      const failure = new Error('bad SRP');
      mockImportSrp.mockRejectedValue(failure);
      const unsubscribe = jest.fn();
      jest
        .spyOn(persistenceModule, 'subscribeToChanges')
        .mockReturnValue(unsubscribe);
      const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

      await expect(createWallet(CONFIG)).rejects.toThrow(failure);
      const realWallet = MockWallet.mock.results[1]?.value as Wallet;
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(realWallet.destroy).toHaveBeenCalledTimes(1);
      expect(closeSpy).toHaveBeenCalled();
    });

    it('removes the on-disk database files when first-run SRP import rejects, after closing the store', async () => {
      mockImportSrp.mockRejectedValue(new Error('bad SRP'));
      const databasePath = tempDbPath('rm-on-failure');
      const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

      await expect(createWallet({ ...CONFIG, databasePath })).rejects.toThrow(
        'bad SRP',
      );

      expect(mockRm).toHaveBeenCalledWith(databasePath, { force: true });
      expect(mockRm).toHaveBeenCalledWith(`${databasePath}-wal`, {
        force: true,
      });
      expect(mockRm).toHaveBeenCalledWith(`${databasePath}-shm`, {
        force: true,
      });
      // The store must be closed before the files are removed.
      expect(closeSpy.mock.invocationCallOrder[0]).toBeLessThan(
        mockRm.mock.invocationCallOrder[0],
      );
    });

    it('does not remove an in-memory database when first-run SRP import rejects', async () => {
      mockImportSrp.mockRejectedValue(new Error('bad SRP'));

      await expect(createWallet(CONFIG)).rejects.toThrow('bad SRP');

      expect(mockRm).not.toHaveBeenCalled();
    });

    it('does not remove the database when SRP import succeeds on first run', async () => {
      const databasePath = tempDbPath('success');

      const { dispose } = await createWallet({ ...CONFIG, databasePath });

      expect(mockRm).not.toHaveBeenCalled();
      await dispose();
    });

    it('does not remove the database when failure occurs on a subsequent run', async () => {
      jest.spyOn(persistenceModule, 'loadState').mockReturnValue({
        KeyringController: { vault: 'encrypted-vault-blob' },
      });
      jest
        .spyOn(persistenceModule, 'subscribeToChanges')
        .mockImplementation(() => {
          throw new Error('subscribe failed');
        });

      await expect(
        createWallet({ ...CONFIG, databasePath: tempDbPath('subsequent-run') }),
      ).rejects.toThrow('subscribe failed');

      expect(mockRm).not.toHaveBeenCalled();
    });

    it('logs rm rejection during first-run cleanup and still rethrows the original error', async () => {
      const original = new Error('bad SRP');
      mockImportSrp.mockRejectedValue(original);
      mockRm.mockRejectedValue(new Error('disk gone'));
      const log = jest.fn();

      await expect(
        createWallet({
          ...CONFIG,
          databasePath: tempDbPath('rm-rejection'),
          log,
        }),
      ).rejects.toThrow(original);
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('during first-run cleanup'),
      );
    });

    it('tolerates wallet.destroy rejection during cleanup and still rethrows', async () => {
      const original = new Error('bad SRP');
      mockImportSrp.mockRejectedValue(original);
      MockWallet.mockImplementationOnce(makeMockWallet).mockImplementationOnce(
        () =>
          ({
            ...makeMockWallet(),
            destroy: jest.fn().mockRejectedValue(new Error('destroy failed')),
          }) as unknown as Wallet,
      );

      await expect(createWallet({ ...CONFIG, log: jest.fn() })).rejects.toThrow(
        original,
      );
    });
  });
});
