import { importSecretRecoveryPhrase, Wallet } from '@metamask/wallet';
import { rmSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { KeyValueStore } from '../persistence/KeyValueStore';
import * as persistenceModule from '../persistence/persistence';
import { createWallet } from './wallet-factory';

jest.mock('@metamask/wallet');
jest.mock('@metamask/remote-feature-flag-controller');
jest.mock('node:fs/promises');

const mockRm = jest.mocked(rm);

const createdTempDbPaths: string[] = [];

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

const MockWallet = jest.mocked(Wallet);
const mockImportSrp = jest.mocked(importSecretRecoveryPhrase);

const CONFIG = {
  databasePath: ':memory:',
  infuraProjectId: 'test-key',
  password: 'test-pass',
  srp: 'test test test test test test test test test test test ball',
};

describe('createWallet', () => {
  let mockMessenger: {
    call: jest.Mock;
    subscribe: jest.Mock;
    unsubscribe: jest.Mock;
  };
  let mockControllerMetadata: Record<string, unknown>;

  beforeEach(() => {
    mockMessenger = {
      call: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
    };
    mockControllerMetadata = {};
    MockWallet.mockImplementation(
      () =>
        ({
          messenger: mockMessenger,
          controllerMetadata: mockControllerMetadata,
          state: {},
          destroy: jest.fn().mockResolvedValue(undefined),
        }) as unknown as Wallet,
    );
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

  it('instantiates Wallet with the given infuraProjectId', async () => {
    await createWallet(CONFIG);

    expect(MockWallet).toHaveBeenCalledTimes(1);
    const args = MockWallet.mock.calls[0][0];
    expect(args.infuraProjectId).toBe('test-key');
  });

  it('uses expected default options', async () => {
    await createWallet(CONFIG);

    const args = MockWallet.mock.calls[0][0];
    expect(args.clientVersion).toBe('0.0.0');
    expect(args.showApprovalRequest()).toBeUndefined();
    expect(args.getMetaMetricsId()).toBe('cli');
    expect(args.clientConfigApiService).toBeDefined();
  });

  it('imports the secret recovery phrase with the given password on first run', async () => {
    await createWallet(CONFIG);

    expect(mockImportSrp).toHaveBeenCalledWith(
      expect.objectContaining({ messenger: mockMessenger }),
      'test-pass',
      'test test test test test test test test test test test ball',
    );
  });

  it('returns the wallet and its backing KeyValueStore', async () => {
    const { wallet, store } = await createWallet(CONFIG);
    expect(wallet.messenger).toBe(mockMessenger);
    expect(store).toBeInstanceOf(KeyValueStore);
    store.close();
  });

  it('hydrates the Wallet with state loaded from the store', async () => {
    const tempStore = new KeyValueStore(':memory:');
    tempStore.set('AccountsController.internalAccounts', {
      accounts: { 'a-id': { id: 'a-id' } },
      selectedAccount: 'a-id',
    });
    const snapshot = tempStore.getAll();
    tempStore.close();

    const loadStateSpy = jest
      .spyOn(persistenceModule, 'loadState')
      .mockReturnValue({
        AccountsController: {
          internalAccounts: snapshot['AccountsController.internalAccounts'] as
            | Record<string, never>
            | never,
        },
      });

    const { store } = await createWallet(CONFIG);

    const args = MockWallet.mock.calls[0][0];
    expect(args.state).toStrictEqual({
      AccountsController: {
        internalAccounts: {
          accounts: { 'a-id': { id: 'a-id' } },
          selectedAccount: 'a-id',
        },
      },
    });

    loadStateSpy.mockRestore();
    store.close();
  });

  it('subscribes the store to controller state changes', async () => {
    const subscribeSpy = jest
      .spyOn(persistenceModule, 'subscribeToChanges')
      .mockReturnValue(() => undefined);

    const { wallet, store } = await createWallet(CONFIG);

    expect(subscribeSpy).toHaveBeenCalledWith(
      wallet.messenger,
      wallet.controllerMetadata,
      store,
      undefined,
    );

    subscribeSpy.mockRestore();
    store.close();
  });

  it('forwards the supplied log callback to subscribeToChanges', async () => {
    const subscribeSpy = jest
      .spyOn(persistenceModule, 'subscribeToChanges')
      .mockReturnValue(() => undefined);
    const log = jest.fn();

    const { store } = await createWallet({ ...CONFIG, log });

    expect(subscribeSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      log,
    );

    subscribeSpy.mockRestore();
    store.close();
  });

  it('skips importing the SRP when the store already contains a KeyringController vault', async () => {
    jest.spyOn(persistenceModule, 'loadState').mockReturnValue({
      KeyringController: { vault: 'encrypted-vault-blob' },
    });

    const { store } = await createWallet(CONFIG);

    expect(mockImportSrp).not.toHaveBeenCalled();

    store.close();
  });

  it('closes the store and rethrows when state hydration fails', async () => {
    const failure = new Error('corrupt store');
    jest.spyOn(persistenceModule, 'loadState').mockImplementation(() => {
      throw failure;
    });

    const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

    await expect(createWallet(CONFIG)).rejects.toThrow(failure);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('destroys the wallet and closes the store when SRP import rejects on first run', async () => {
    const failure = new Error('bad SRP');
    mockImportSrp.mockRejectedValue(failure);

    const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

    await expect(createWallet(CONFIG)).rejects.toThrow(failure);

    const constructedWallet = MockWallet.mock.results[0]?.value as Wallet;
    expect(constructedWallet.destroy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('removes the on-disk database files when first-run SRP import rejects', async () => {
    mockImportSrp.mockRejectedValue(new Error('bad SRP'));
    const databasePath = tempDbPath('rm-on-failure');

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
  });

  it('does not remove an in-memory database when first-run SRP import rejects', async () => {
    mockImportSrp.mockRejectedValue(new Error('bad SRP'));

    await expect(createWallet(CONFIG)).rejects.toThrow('bad SRP');

    expect(mockRm).not.toHaveBeenCalled();
  });

  it('does not remove the database when SRP import succeeds on first run', async () => {
    const databasePath = tempDbPath('success');
    const { store } = await createWallet({ ...CONFIG, databasePath });

    expect(mockRm).not.toHaveBeenCalled();
    store.close();
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

  it('tolerates rm rejection during first-run cleanup and still rethrows the original error', async () => {
    const original = new Error('bad SRP');
    mockImportSrp.mockRejectedValue(original);
    mockRm.mockRejectedValue(new Error('disk gone'));

    await expect(
      createWallet({ ...CONFIG, databasePath: tempDbPath('rm-rejection') }),
    ).rejects.toThrow(original);
  });

  it('tolerates wallet.destroy rejection during cleanup and still rethrows the original error', async () => {
    const original = new Error('bad SRP');
    mockImportSrp.mockRejectedValue(original);

    const destroyError = new Error('destroy failed');
    const destroy = jest.fn().mockRejectedValue(destroyError);
    MockWallet.mockImplementation(
      () =>
        ({
          messenger: mockMessenger,
          controllerMetadata: mockControllerMetadata,
          state: {},
          destroy,
        }) as unknown as Wallet,
    );

    await expect(createWallet(CONFIG)).rejects.toThrow(original);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('destroys the wallet when subscribeToChanges throws', async () => {
    const subscribeSpy = jest
      .spyOn(persistenceModule, 'subscribeToChanges')
      .mockImplementation(() => {
        throw new Error('subscribe failed');
      });

    await expect(createWallet(CONFIG)).rejects.toThrow('subscribe failed');

    const constructedWallet = MockWallet.mock.results[0]?.value as Wallet;
    expect(constructedWallet.destroy).toHaveBeenCalledTimes(1);

    subscribeSpy.mockRestore();
  });

  it('closes the store without destroying when Wallet construction throws', async () => {
    const ctorError = new Error('wallet ctor failed');
    MockWallet.mockImplementation(() => {
      throw ctorError;
    });
    const closeSpy = jest.spyOn(KeyValueStore.prototype, 'close');

    await expect(createWallet(CONFIG)).rejects.toThrow(ctorError);
    expect(closeSpy).toHaveBeenCalled();
  });
});
