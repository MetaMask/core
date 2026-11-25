import type {
  FetchedSecretDataItem,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import { stringToBytes } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  createFetchedSecretDataItem,
  ImportedPrivateKey1,
  ImportedSRP1,
  PrimarySRP2,
  PrivateKey1,
  SRP1,
  SRP2,
} from '../../tests/__fixtures__/secret-metadata.js';
import {
  SeedlessPrimarySrpMismatchEventName,
  SeedlessPrimarySrpMissingEventName,
} from '../constants.js';
import { SecretMetadata } from '../SecretMetadata.js';
import { PrimarySrpBackupRepair } from './PrimarySrpBackupRepair.js';
import type {
  PrimarySrpBackupRepairOptions,
  RepairVaultKeys,
} from './PrimarySrpBackupRepair.js';

const { logMock } = vi.hoisted(() => ({ logMock: vi.fn() }));

vi.mock('../logger.js', () => ({
  projectLogger: {},
  createModuleLogger: (): Mock => logMock,
}));

const PASSWORD = 'password';
const LOCAL_PRIMARY_SRP = stringToBytes(SRP1.data);
const VAULT_KEYS = {
  toprfEncryptionKey: new Uint8Array(32).fill(1),
  toprfAuthKeyPair: { sk: 1n, pk: new Uint8Array(33).fill(2) },
} as RepairVaultKeys;
const IDENTITY = { userId: 'user-id', authConnectionId: 'auth-connection-id' };

/**
 * Build a repair with mocked dependencies.
 *
 * @param options - The options.
 * @param options.remoteItems - The remote secret data items to return.
 * @returns The repair and its mocked dependencies.
 */
function setup({
  remoteItems = [],
}: { remoteItems?: FetchedSecretDataItem[] } = {}): {
  repair: PrimarySrpBackupRepair;
  identity: { userId?: string; authConnectionId?: string };
  addSecretDataItem: Mock<ToprfSecureBackup['addSecretDataItem']>;
  updateSecretDataItem: Mock<ToprfSecureBackup['updateSecretDataItem']>;
  batchUpdateSecretDataItems: Mock<
    ToprfSecureBackup['batchUpdateSecretDataItems']
  >;
  fetchAllSecretData: Mock<PrimarySrpBackupRepairOptions['fetchAllSecretData']>;
  exportPrimarySeedPhrase: Mock<
    PrimarySrpBackupRepairOptions['exportPrimarySeedPhrase']
  >;
  trackEvent: Mock<PrimarySrpBackupRepairOptions['trackEvent']>;
  withRepairContext: Mock<PrimarySrpBackupRepairOptions['withRepairContext']>;
} {
  const identity = { ...IDENTITY };
  const addSecretDataItem = vi
    .fn<ToprfSecureBackup['addSecretDataItem']>()
    .mockResolvedValue(undefined);
  const updateSecretDataItem = vi
    .fn<ToprfSecureBackup['updateSecretDataItem']>()
    .mockResolvedValue(undefined);
  const batchUpdateSecretDataItems = vi
    .fn<ToprfSecureBackup['batchUpdateSecretDataItems']>()
    .mockResolvedValue(undefined);
  const fetchAllSecretData = vi
    .fn<PrimarySrpBackupRepairOptions['fetchAllSecretData']>()
    .mockResolvedValue(remoteItems);
  const exportPrimarySeedPhrase = vi
    .fn<PrimarySrpBackupRepairOptions['exportPrimarySeedPhrase']>()
    .mockResolvedValue(LOCAL_PRIMARY_SRP);
  const trackEvent = vi.fn<PrimarySrpBackupRepairOptions['trackEvent']>();
  const withRepairContext = vi.fn<
    PrimarySrpBackupRepairOptions['withRepairContext']
  >(async (fn) => fn(VAULT_KEYS));

  const repair = new PrimarySrpBackupRepair({
    getToprfClient: (): ToprfSecureBackup =>
      ({
        addSecretDataItem,
        updateSecretDataItem,
        batchUpdateSecretDataItems,
      }) as unknown as ToprfSecureBackup,
    fetchAllSecretData,
    exportPrimarySeedPhrase,
    trackEvent,
    getIdentity: (): { userId?: string; authConnectionId?: string } => ({
      ...identity,
    }),
    withRepairContext,
  });

  return {
    repair,
    identity,
    addSecretDataItem,
    updateSecretDataItem,
    batchUpdateSecretDataItems,
    fetchAllSecretData,
    exportPrimarySeedPhrase,
    trackEvent,
    withRepairContext,
  };
}

describe('PrimarySrpBackupRepair', () => {
  beforeEach(() => {
    logMock.mockClear();
  });

  describe('run', () => {
    it('exports the local primary SRP with the given password', async () => {
      const { repair, exportPrimarySeedPhrase } = setup();

      await repair.run(PASSWORD);

      expect(exportPrimarySeedPhrase).toHaveBeenCalledWith(PASSWORD);
    });

    describe('when the primary SRP is missing', () => {
      it('tracks and adds the local primary SRP as v2 when the remote backup is empty', async () => {
        const {
          repair,
          trackEvent,
          withRepairContext,
          addSecretDataItem,
          updateSecretDataItem,
          batchUpdateSecretDataItems,
        } = setup();

        await repair.run(PASSWORD);

        expect(trackEvent).toHaveBeenCalledWith(
          expect.objectContaining({ name: SeedlessPrimarySrpMissingEventName }),
        );
        expect(withRepairContext).toHaveBeenCalledTimes(1);
        expect(updateSecretDataItem).not.toHaveBeenCalled();
        expect(batchUpdateSecretDataItems).not.toHaveBeenCalled();
        expect(addSecretDataItem).toHaveBeenCalledWith({
          encKey: VAULT_KEYS.toprfEncryptionKey,
          secretData: expect.any(Uint8Array),
          authKeyPair: VAULT_KEYS.toprfAuthKeyPair,
          dataType: EncAccountDataType.PrimarySrp,
          version: 'v2',
        });
        const { secretData } = addSecretDataItem.mock.calls[0][0];
        const metadata = SecretMetadata.fromRawMetadata(secretData, {
          dataType: EncAccountDataType.PrimarySrp,
        });
        expect(metadata.data).toStrictEqual(LOCAL_PRIMARY_SRP);
        expect(metadata.dataType).toBe(EncAccountDataType.PrimarySrp);
      });

      it('migrates a legacy private key to v2 before adding the local primary SRP', async () => {
        const { repair, addSecretDataItem, updateSecretDataItem } = setup({
          remoteItems: [createFetchedSecretDataItem(PrivateKey1)],
        });

        await repair.run(PASSWORD);

        expect(updateSecretDataItem).toHaveBeenCalledTimes(1);
        expect(updateSecretDataItem).toHaveBeenCalledWith({
          itemId: PrivateKey1.itemId,
          dataType: EncAccountDataType.ImportedPrivateKey,
          authKeyPair: VAULT_KEYS.toprfAuthKeyPair,
        });
        expect(addSecretDataItem).toHaveBeenCalledWith(
          expect.objectContaining({
            dataType: EncAccountDataType.PrimarySrp,
            version: 'v2',
          }),
        );
        expect(updateSecretDataItem.mock.invocationCallOrder[0]).toBeLessThan(
          addSecretDataItem.mock.invocationCallOrder[0],
        );
      });

      it('promotes the remote imported copy of the local primary SRP instead of adding it', async () => {
        const { repair, addSecretDataItem, updateSecretDataItem } = setup({
          remoteItems: [createFetchedSecretDataItem(ImportedSRP1)],
        });

        await repair.run(PASSWORD);

        expect(addSecretDataItem).not.toHaveBeenCalled();
        expect(updateSecretDataItem).toHaveBeenCalledTimes(1);
        expect(updateSecretDataItem).toHaveBeenCalledWith({
          itemId: SRP1.itemId,
          dataType: EncAccountDataType.PrimarySrp,
          authKeyPair: VAULT_KEYS.toprfAuthKeyPair,
        });
      });
    });

    describe('when the primary SRP mismatches', () => {
      it('tracks, demotes the remote primary SRP and adds the local one', async () => {
        const {
          repair,
          trackEvent,
          addSecretDataItem,
          updateSecretDataItem,
          batchUpdateSecretDataItems,
        } = setup({ remoteItems: [createFetchedSecretDataItem(PrimarySRP2)] });

        await repair.run(PASSWORD);

        expect(trackEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            name: SeedlessPrimarySrpMismatchEventName,
          }),
        );
        expect(batchUpdateSecretDataItems).not.toHaveBeenCalled();
        expect(updateSecretDataItem).toHaveBeenCalledTimes(1);
        expect(updateSecretDataItem).toHaveBeenCalledWith({
          itemId: SRP2.itemId,
          dataType: EncAccountDataType.ImportedSrp,
          authKeyPair: VAULT_KEYS.toprfAuthKeyPair,
        });
        expect(addSecretDataItem).toHaveBeenCalledWith(
          expect.objectContaining({
            dataType: EncAccountDataType.PrimarySrp,
            version: 'v2',
          }),
        );
        expect(updateSecretDataItem.mock.invocationCallOrder[0]).toBeLessThan(
          addSecretDataItem.mock.invocationCallOrder[0],
        );
      });

      it('retags several items in one batch and then promotes the remote copy of the local primary SRP', async () => {
        const {
          repair,
          addSecretDataItem,
          updateSecretDataItem,
          batchUpdateSecretDataItems,
        } = setup({
          remoteItems: [
            createFetchedSecretDataItem(PrimarySRP2),
            createFetchedSecretDataItem(ImportedSRP1),
            createFetchedSecretDataItem(PrivateKey1),
          ],
        });

        await repair.run(PASSWORD);

        expect(addSecretDataItem).not.toHaveBeenCalled();
        expect(batchUpdateSecretDataItems).toHaveBeenCalledTimes(1);
        expect(batchUpdateSecretDataItems).toHaveBeenCalledWith({
          updateItems: [
            {
              itemId: SRP2.itemId,
              dataType: EncAccountDataType.ImportedSrp,
            },
            {
              itemId: PrivateKey1.itemId,
              dataType: EncAccountDataType.ImportedPrivateKey,
            },
          ],
          authKeyPair: VAULT_KEYS.toprfAuthKeyPair,
        });
        expect(updateSecretDataItem).toHaveBeenCalledTimes(1);
        expect(updateSecretDataItem).toHaveBeenCalledWith({
          itemId: SRP1.itemId,
          dataType: EncAccountDataType.PrimarySrp,
          authKeyPair: VAULT_KEYS.toprfAuthKeyPair,
        });
        expect(
          batchUpdateSecretDataItems.mock.invocationCallOrder[0],
        ).toBeLessThan(updateSecretDataItem.mock.invocationCallOrder[0]);
      });

      it('does not set the primary SRP when the retag fails', async () => {
        const { repair, addSecretDataItem, updateSecretDataItem } = setup({
          remoteItems: [createFetchedSecretDataItem(PrimarySRP2)],
        });
        const error = new Error('update failed');
        updateSecretDataItem.mockRejectedValue(error);

        expect(await repair.run(PASSWORD)).toBeUndefined();

        expect(addSecretDataItem).not.toHaveBeenCalled();
        expect(logMock).toHaveBeenCalledWith(
          'Error repairing primary SRP backup',
          error,
        );
      });
    });

    it('does nothing when the remote primary SRP matches the local one', async () => {
      const { repair, trackEvent, withRepairContext } = setup({
        remoteItems: [
          createFetchedSecretDataItem({
            ...SRP1,
            dataType: EncAccountDataType.PrimarySrp,
          }),
        ],
      });

      await repair.run(PASSWORD);

      expect(trackEvent).not.toHaveBeenCalled();
      expect(withRepairContext).not.toHaveBeenCalled();
    });

    it('does nothing when the remote backup cannot be fetched', async () => {
      const { repair, fetchAllSecretData, trackEvent, withRepairContext } =
        setup();
      fetchAllSecretData.mockRejectedValue(new Error('fetch failed'));

      expect(await repair.run(PASSWORD)).toBeUndefined();

      expect(trackEvent).not.toHaveBeenCalled();
      expect(withRepairContext).not.toHaveBeenCalled();
    });

    it('does not write anything when the identity changed after planning', async () => {
      const {
        repair,
        identity,
        addSecretDataItem,
        updateSecretDataItem,
        exportPrimarySeedPhrase,
      } = setup({ remoteItems: [createFetchedSecretDataItem(PrimarySRP2)] });
      exportPrimarySeedPhrase.mockImplementation(async () => {
        identity.userId = 'another-user-id';
        return LOCAL_PRIMARY_SRP;
      });

      expect(await repair.run(PASSWORD)).toBeUndefined();

      expect(updateSecretDataItem).not.toHaveBeenCalled();
      expect(addSecretDataItem).not.toHaveBeenCalled();
      expect(logMock).toHaveBeenCalledWith(
        'Error repairing primary SRP backup',
        expect.any(Error),
      );
    });

    it('logs and resolves when the repair context fails', async () => {
      const { repair, withRepairContext, addSecretDataItem } = setup();
      const error = new Error('locked');
      withRepairContext.mockRejectedValue(error);

      expect(await repair.run(PASSWORD)).toBeUndefined();

      expect(addSecretDataItem).not.toHaveBeenCalled();
      expect(logMock).toHaveBeenCalledWith(
        'Error repairing primary SRP backup',
        error,
      );
    });

    it('logs and resolves when the write fails', async () => {
      const { repair, addSecretDataItem } = setup({
        remoteItems: [createFetchedSecretDataItem(ImportedPrivateKey1)],
      });
      const error = new Error('write failed');
      addSecretDataItem.mockRejectedValue(error);

      expect(await repair.run(PASSWORD)).toBeUndefined();

      expect(logMock).toHaveBeenCalledWith(
        'Error repairing primary SRP backup',
        error,
      );
    });
  });
});
