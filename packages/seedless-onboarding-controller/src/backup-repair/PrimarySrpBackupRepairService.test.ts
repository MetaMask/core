import type {
  FetchedSecretDataItem,
  ToprfSecureBackup,
} from '@metamask/toprf-secure-backup';
import { EncAccountDataType } from '@metamask/toprf-secure-backup';
import { areUint8ArraysEqual, stringToBytes } from '@metamask/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  createFetchedSecretDataItem,
  ImportedPrivateKey1,
  ImportedPrivateKey2,
  ImportedSRP1,
  PrimarySRP2,
  PrivateKey1,
  PrivateKey2,
  SRP1,
  SRP2,
} from '../../tests/__fixtures__/secret-metadata.js';
import {
  SecretType,
  SeedlessPrimarySrpMismatchEventName,
  SeedlessPrimarySrpMissingEventName,
  SeedlessPrimarySrpRepairEventName,
} from '../constants.js';
import { SecretMetadata } from '../SecretMetadata.js';
import { parseSecretMetadata } from '../utils/secret-data-utils.js';
import { PrimarySrpBackupRepairService } from './PrimarySrpBackupRepairService.js';
import type {
  PrimarySrpBackupRepairServiceOptions,
  RepairVaultKeys,
} from './PrimarySrpBackupRepairService.js';

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

const OldestSRP = { data: 'oldest srp', timestamp: 10, itemId: 'srp-0' };
const ThirdSRP = { data: 'third srp', timestamp: 150, itemId: 'srp-3' };
const ImportedSRP2 = { ...SRP2, dataType: EncAccountDataType.ImportedSrp };

type ToprfClientMethods = Pick<
  ToprfSecureBackup,
  | 'addSecretDataItem'
  | 'updateSecretDataItem'
  | 'batchUpdateSecretDataItems'
  | 'fetchAllSecretDataItems'
>;

/**
 * Create an in-memory metadata service that applies the writes the way the
 * real one does:
 *
 * - at most one item has the `PrimarySrp` data type, and a request that makes
 * an item the primary is rejected while another item is the primary, even if
 * the same request demotes that other item;
 * - an update only changes the data type and stores the item as `v2`, and a
 * batch update is atomic;
 * - an update of an unknown item is rejected.
 *
 * @param initialItems - The items the service starts with.
 * @returns The service methods and its stored items.
 */
function createMetadataService(
  initialItems: FetchedSecretDataItem[],
): ToprfClientMethods & { items: FetchedSecretDataItem[] } {
  const items = initialItems.map((item) => ({ ...item }));
  let nextItemId = 1;

  const assertOnlyPrimary = (primaryItemIds: string[]): void => {
    const hasOtherPrimary = items.some(
      (item) =>
        item.dataType === EncAccountDataType.PrimarySrp &&
        !primaryItemIds.includes(item.itemId),
    );
    if (
      primaryItemIds.length > 1 ||
      (primaryItemIds.length === 1 && hasOtherPrimary)
    ) {
      throw new Error('Only one PRIMARY_SRP is allowed');
    }
  };

  const assertAllExist = (itemIds: string[]): void => {
    const missing = itemIds.filter(
      (itemId) => !items.some((item) => item.itemId === itemId),
    );
    if (missing.length > 0) {
      throw new Error(`Records not found for itemIds: ${missing.join(', ')}`);
    }
  };

  const retag = (itemId: string, dataType: EncAccountDataType): void => {
    const item = items.find((candidate) => candidate.itemId === itemId);
    if (item) {
      item.dataType = dataType;
      item.version = 'v2';
    }
  };

  return {
    items,
    fetchAllSecretDataItems: async () => items.map((item) => ({ ...item })),
    addSecretDataItem: async ({ secretData, dataType, version = 'v2' }) => {
      if (version === 'v2' && dataType === undefined) {
        throw new Error('A v2 item requires a data type');
      }
      if (dataType === EncAccountDataType.PrimarySrp) {
        assertOnlyPrimary([`new-item-${nextItemId}`]);
      }
      items.push({
        data: secretData,
        itemId: `new-item-${nextItemId}`,
        dataType,
        version,
      });
      nextItemId += 1;
    },
    updateSecretDataItem: async ({ itemId, dataType }) => {
      assertAllExist([itemId]);
      if (dataType === EncAccountDataType.PrimarySrp) {
        assertOnlyPrimary([itemId]);
      }
      retag(itemId, dataType);
    },
    batchUpdateSecretDataItems: async ({ updateItems }) => {
      assertAllExist(updateItems.map(({ itemId }) => itemId));
      assertOnlyPrimary(
        updateItems
          .filter(({ dataType }) => dataType === EncAccountDataType.PrimarySrp)
          .map(({ itemId }) => itemId),
      );
      for (const { itemId, dataType } of updateItems) {
        retag(itemId, dataType);
      }
    },
  };
}

/**
 * Build a repair service whose remote backup is an in-memory metadata
 * service.
 *
 * @param options - The options.
 * @param options.remoteItems - The items the metadata service starts with.
 * @returns The service, its mocked dependencies and the metadata service.
 */
function setup({
  remoteItems = [],
}: { remoteItems?: FetchedSecretDataItem[] } = {}): {
  service: PrimarySrpBackupRepairService;
  metadataService: ReturnType<typeof createMetadataService>;
  identity: { userId?: string; authConnectionId?: string };
  addSecretDataItem: Mock<ToprfSecureBackup['addSecretDataItem']>;
  updateSecretDataItem: Mock<ToprfSecureBackup['updateSecretDataItem']>;
  batchUpdateSecretDataItems: Mock<
    ToprfSecureBackup['batchUpdateSecretDataItems']
  >;
  fetchAllSecretData: Mock<
    PrimarySrpBackupRepairServiceOptions['fetchAllSecretData']
  >;
  exportPrimarySeedPhrase: Mock<
    PrimarySrpBackupRepairServiceOptions['exportPrimarySeedPhrase']
  >;
  trackEvent: Mock<PrimarySrpBackupRepairServiceOptions['trackEvent']>;
  withRepairContext: Mock<
    PrimarySrpBackupRepairServiceOptions['withRepairContext']
  >;
} {
  const identity = { ...IDENTITY };
  const metadataService = createMetadataService(remoteItems);
  const addSecretDataItem = vi.fn<ToprfSecureBackup['addSecretDataItem']>(
    metadataService.addSecretDataItem,
  );
  const updateSecretDataItem = vi.fn<ToprfSecureBackup['updateSecretDataItem']>(
    metadataService.updateSecretDataItem,
  );
  const batchUpdateSecretDataItems = vi.fn<
    ToprfSecureBackup['batchUpdateSecretDataItems']
  >(metadataService.batchUpdateSecretDataItems);
  const fetchAllSecretData = vi.fn<
    PrimarySrpBackupRepairServiceOptions['fetchAllSecretData']
  >(async () => metadataService.items.map((item) => ({ ...item })));
  const exportPrimarySeedPhrase = vi
    .fn<PrimarySrpBackupRepairServiceOptions['exportPrimarySeedPhrase']>()
    .mockResolvedValue(LOCAL_PRIMARY_SRP);
  const trackEvent =
    vi.fn<PrimarySrpBackupRepairServiceOptions['trackEvent']>();
  const withRepairContext = vi.fn<
    PrimarySrpBackupRepairServiceOptions['withRepairContext']
  >(async (fn) => await fn(VAULT_KEYS));

  const service = new PrimarySrpBackupRepairService({
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
    service,
    metadataService,
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

/**
 * Assert that nothing was written to the metadata service.
 *
 * @param writes - The write mocks of the metadata service.
 * @param writes.addSecretDataItem - The add mock.
 * @param writes.updateSecretDataItem - The update mock.
 * @param writes.batchUpdateSecretDataItems - The batch update mock.
 */
function expectNoWrites({
  addSecretDataItem,
  updateSecretDataItem,
  batchUpdateSecretDataItems,
}: {
  addSecretDataItem: Mock;
  updateSecretDataItem: Mock;
  batchUpdateSecretDataItems: Mock;
}): void {
  expect(addSecretDataItem).not.toHaveBeenCalled();
  expect(updateSecretDataItem).not.toHaveBeenCalled();
  expect(batchUpdateSecretDataItems).not.toHaveBeenCalled();
}

/**
 * Assert the acceptance criteria of a repaired remote backup.
 *
 * @param params - The expectations.
 * @param params.items - The items stored by the metadata service.
 * @param params.originalItems - The items the metadata service started with.
 * @param params.expectedItemCount - The number of items after the repair.
 */
function expectRepairedBackup({
  items,
  originalItems,
  expectedItemCount,
}: {
  items: FetchedSecretDataItem[];
  originalItems: FetchedSecretDataItem[];
  expectedItemCount: number;
}): void {
  const secrets = parseSecretMetadata(items);
  const primaries = secrets.filter(
    (secret) => secret.dataType === EncAccountDataType.PrimarySrp,
  );
  const localCopies = secrets.filter(
    (secret) =>
      SecretMetadata.matchesType(secret, SecretType.Mnemonic) &&
      areUint8ArraysEqual(secret.data, LOCAL_PRIMARY_SRP),
  );

  expect(secrets).toHaveLength(expectedItemCount);
  // Exactly one primary SRP, it is the only copy of the local primary SRP, and
  // it sorts first.
  expect(primaries).toHaveLength(1);
  expect(localCopies).toHaveLength(1);
  expect(localCopies[0].itemId).toBe(primaries[0].itemId);
  expect(secrets[0]).toBe(primaries[0]);
  // No item is lost or rewritten, and nothing stays legacy.
  for (const original of originalItems) {
    const kept = items.find((item) => item.itemId === original.itemId);
    expect(kept?.data).toStrictEqual(original.data);
  }
  expect(secrets.map((secret) => secret.storageVersion)).toStrictEqual(
    secrets.map(() => 'v2'),
  );
  // The other items are imported.
  expect(
    secrets
      .filter((secret) => secret !== primaries[0])
      .map((secret) => secret.dataType),
  ).not.toContain(EncAccountDataType.PrimarySrp);
}

describe('PrimarySrpBackupRepairService', () => {
  beforeEach(() => {
    logMock.mockClear();
  });

  describe('run', () => {
    it('exports the local primary SRP with the given password', async () => {
      const { service, exportPrimarySeedPhrase } = setup();

      await service.run(PASSWORD);

      expect(exportPrimarySeedPhrase).toHaveBeenCalledWith(PASSWORD);
    });

    describe('when the primary SRP is missing', () => {
      it('tracks and adds the local primary SRP as v2 when the remote backup is empty', async () => {
        const {
          service,
          trackEvent,
          withRepairContext,
          addSecretDataItem,
          updateSecretDataItem,
          batchUpdateSecretDataItems,
        } = setup();

        await service.run(PASSWORD);

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
        expect(metadata.type).toBe(SecretType.Mnemonic);
      });

      it('migrates a legacy private key to v2 before adding the local primary SRP', async () => {
        const { service, addSecretDataItem, updateSecretDataItem } = setup({
          remoteItems: [createFetchedSecretDataItem(PrivateKey1)],
        });

        await service.run(PASSWORD);

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

      it('does not retag items that are already imported v2 items', async () => {
        const { service, updateSecretDataItem, batchUpdateSecretDataItems } =
          setup({
            remoteItems: [
              createFetchedSecretDataItem(ImportedPrivateKey1),
              createFetchedSecretDataItem(ImportedSRP2),
            ],
          });

        await service.run(PASSWORD);

        expect(updateSecretDataItem).not.toHaveBeenCalled();
        expect(batchUpdateSecretDataItems).not.toHaveBeenCalled();
      });

      it('promotes the remote imported copy of the local primary SRP instead of adding it', async () => {
        const { service, addSecretDataItem, updateSecretDataItem } = setup({
          remoteItems: [createFetchedSecretDataItem(ImportedSRP1)],
        });

        await service.run(PASSWORD);

        expect(addSecretDataItem).not.toHaveBeenCalled();
        expect(updateSecretDataItem).toHaveBeenCalledTimes(1);
        expect(updateSecretDataItem).toHaveBeenCalledWith({
          itemId: SRP1.itemId,
          dataType: EncAccountDataType.PrimarySrp,
          authKeyPair: VAULT_KEYS.toprfAuthKeyPair,
        });
      });

      it('adds the local primary SRP when its imported copy has no item id', async () => {
        const {
          service,
          addSecretDataItem,
          updateSecretDataItem,
          fetchAllSecretData,
        } = setup();
        fetchAllSecretData.mockResolvedValue([
          { ...createFetchedSecretDataItem(ImportedSRP1), itemId: undefined },
        ] as unknown as FetchedSecretDataItem[]);

        await service.run(PASSWORD);

        expect(updateSecretDataItem).not.toHaveBeenCalled();
        expect(addSecretDataItem).toHaveBeenCalledTimes(1);
      });
    });

    describe('when the primary SRP mismatches', () => {
      it('tracks, demotes the remote primary SRP and adds the local one', async () => {
        const {
          service,
          trackEvent,
          addSecretDataItem,
          updateSecretDataItem,
          batchUpdateSecretDataItems,
        } = setup({ remoteItems: [createFetchedSecretDataItem(PrimarySRP2)] });

        await service.run(PASSWORD);

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
          service,
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

        await service.run(PASSWORD);

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

      it('never demotes the old primary and promotes the new one in the same request', async () => {
        // The metadata service rejects that request, so it must be two steps.
        const { service, batchUpdateSecretDataItems, metadataService } = setup({
          remoteItems: [
            createFetchedSecretDataItem(PrimarySRP2),
            createFetchedSecretDataItem(ImportedSRP1),
            createFetchedSecretDataItem(PrivateKey1),
          ],
        });

        await service.run(PASSWORD);

        const updateItems = batchUpdateSecretDataItems.mock.calls.flatMap(
          ([{ updateItems: batch }]) => batch,
        );
        expect(updateItems.map(({ dataType }) => dataType)).not.toContain(
          EncAccountDataType.PrimarySrp,
        );
        expect(logMock).not.toHaveBeenCalled();
        expect(
          metadataService.items.filter(
            ({ dataType }) => dataType === EncAccountDataType.PrimarySrp,
          ),
        ).toHaveLength(1);
      });

      it('does not set the primary SRP when the retag fails', async () => {
        const { service, addSecretDataItem, updateSecretDataItem } = setup({
          remoteItems: [createFetchedSecretDataItem(PrimarySRP2)],
        });
        const error = new Error('update failed');
        updateSecretDataItem.mockRejectedValue(error);

        expect(await service.run(PASSWORD)).toBeUndefined();

        expect(addSecretDataItem).not.toHaveBeenCalled();
        expect(logMock).toHaveBeenCalledWith(
          'Error repairing primary SRP backup',
          error,
        );
      });
    });

    describe('remote backup shapes of the remediation plan', () => {
      const scenarios = [
        {
          description: 'only has legacy private keys',
          remoteItems: [
            createFetchedSecretDataItem(PrivateKey1),
            createFetchedSecretDataItem(PrivateKey2),
          ],
          // The local primary SRP is added.
          expectedItemCount: 3,
        },
        {
          description:
            'has legacy imported SRPs and private keys and none is the local primary SRP',
          remoteItems: [
            createFetchedSecretDataItem(SRP2),
            createFetchedSecretDataItem(ThirdSRP),
            createFetchedSecretDataItem(PrivateKey1),
          ],
          expectedItemCount: 4,
        },
        {
          description: 'labels the wrong v2 item as the primary SRP',
          remoteItems: [
            createFetchedSecretDataItem(PrimarySRP2),
            createFetchedSecretDataItem(ImportedPrivateKey1),
          ],
          expectedItemCount: 3,
        },
        {
          description:
            'labels the wrong v2 item as the primary SRP and has the local primary SRP imported',
          remoteItems: [
            createFetchedSecretDataItem(PrimarySRP2),
            createFetchedSecretDataItem(ImportedSRP1),
            createFetchedSecretDataItem(ImportedPrivateKey1),
          ],
          // The local primary SRP is promoted, not duplicated.
          expectedItemCount: 3,
        },
        {
          description:
            'has the local primary SRP as a legacy mnemonic that is not the earliest',
          remoteItems: [
            createFetchedSecretDataItem(OldestSRP),
            createFetchedSecretDataItem(SRP1),
            createFetchedSecretDataItem(PrivateKey1),
          ],
          expectedItemCount: 3,
        },
        {
          description: 'mixes legacy and v2 items and has no primary SRP',
          remoteItems: [
            createFetchedSecretDataItem(PrivateKey1),
            createFetchedSecretDataItem(ImportedPrivateKey2),
          ],
          expectedItemCount: 3,
        },
        {
          description: 'only has v2 imported SRPs',
          remoteItems: [createFetchedSecretDataItem(ImportedSRP2)],
          expectedItemCount: 2,
        },
      ];

      it.each(scenarios)(
        'repairs a backup that $description',
        async ({ remoteItems, expectedItemCount }) => {
          const { service, metadataService } = setup({ remoteItems });
          const originalItems = structuredClone(metadataService.items);

          await service.run(PASSWORD);

          expectRepairedBackup({
            items: metadataService.items,
            originalItems,
            expectedItemCount,
          });
          expect(logMock).not.toHaveBeenCalled();
        },
      );

      it.each(scenarios)(
        'writes nothing when run again on a backup that $description',
        async ({ remoteItems }) => {
          const { service, metadataService, ...mocks } = setup({ remoteItems });
          await service.run(PASSWORD);
          const repairedItems = structuredClone(metadataService.items);
          mocks.addSecretDataItem.mockClear();
          mocks.updateSecretDataItem.mockClear();
          mocks.batchUpdateSecretDataItems.mockClear();
          mocks.trackEvent.mockClear();

          await service.run(PASSWORD);

          expectNoWrites(mocks);
          expect(mocks.trackEvent).not.toHaveBeenCalled();
          expect(metadataService.items).toStrictEqual(repairedItems);
        },
      );

      it('finishes the repair on the next run when the primary SRP could not be written', async () => {
        const { service, metadataService, addSecretDataItem, trackEvent } =
          setup({
            remoteItems: [
              createFetchedSecretDataItem(PrimarySRP2),
              createFetchedSecretDataItem(ImportedPrivateKey1),
            ],
          });
        const originalItems = structuredClone(metadataService.items);
        addSecretDataItem.mockRejectedValueOnce(new Error('write failed'));

        await service.run(PASSWORD);

        // The old primary is demoted and no primary is left.
        expect(
          metadataService.items.map(({ dataType }) => dataType),
        ).not.toContain(EncAccountDataType.PrimarySrp);
        expect(logMock).toHaveBeenCalledTimes(1);

        trackEvent.mockClear();
        await service.run(PASSWORD);

        expect(trackEvent).toHaveBeenCalledWith(
          expect.objectContaining({ name: SeedlessPrimarySrpMissingEventName }),
        );
        expectRepairedBackup({
          items: metadataService.items,
          originalItems,
          expectedItemCount: 3,
        });
      });

      it('leaves the remote backup unchanged when the retag fails, and finishes on the next run', async () => {
        const { service, metadataService, batchUpdateSecretDataItems } = setup({
          remoteItems: [
            createFetchedSecretDataItem(SRP2),
            createFetchedSecretDataItem(ThirdSRP),
            createFetchedSecretDataItem(PrivateKey1),
          ],
        });
        const originalItems = structuredClone(metadataService.items);
        batchUpdateSecretDataItems.mockRejectedValueOnce(
          new Error('batch failed'),
        );

        await service.run(PASSWORD);

        expect(metadataService.items).toStrictEqual(originalItems);

        await service.run(PASSWORD);

        expectRepairedBackup({
          items: metadataService.items,
          originalItems,
          expectedItemCount: 4,
        });
      });
    });

    describe('when the repair runs twice at the same time', () => {
      it.each([
        {
          description: 'the primary SRP is missing',
          remoteItems: [createFetchedSecretDataItem(ImportedPrivateKey1)],
          expectedItemCount: 2,
        },
        {
          description: 'the primary SRP mismatches and must be added',
          remoteItems: [
            createFetchedSecretDataItem(PrimarySRP2),
            createFetchedSecretDataItem(ImportedPrivateKey1),
          ],
          expectedItemCount: 3,
        },
        {
          description: 'the primary SRP mismatches and must be promoted',
          remoteItems: [
            createFetchedSecretDataItem(PrimarySRP2),
            createFetchedSecretDataItem(ImportedSRP1),
          ],
          expectedItemCount: 2,
        },
      ])(
        'coalesces onto the in-flight run when $description',
        async ({ remoteItems, expectedItemCount }) => {
          const {
            service,
            metadataService,
            fetchAllSecretData,
            exportPrimarySeedPhrase,
            trackEvent,
          } = setup({ remoteItems });
          const originalItems = structuredClone(metadataService.items);

          await Promise.all([service.run(PASSWORD), service.run(PASSWORD)]);

          expectRepairedBackup({
            items: metadataService.items,
            originalItems,
            expectedItemCount,
          });
          expect(fetchAllSecretData).toHaveBeenCalledTimes(1);
          expect(exportPrimarySeedPhrase).toHaveBeenCalledTimes(1);
          // One set of events: the Missing or Mismatch event, then started and
          // succeeded.
          expect(trackEvent).toHaveBeenCalledTimes(3);
          expect(logMock).not.toHaveBeenCalled();
        },
      );

      it('starts a fresh run instead of coalescing when the identity changed in flight', async () => {
        const {
          service,
          identity,
          fetchAllSecretData,
          addSecretDataItem,
          metadataService,
        } = setup();

        let finishFirstFetch!: (items: FetchedSecretDataItem[]) => void;
        fetchAllSecretData.mockImplementationOnce(
          async () =>
            await new Promise<FetchedSecretDataItem[]>((resolve) => {
              finishFirstFetch = resolve;
            }),
        );

        const firstRun = service.run(PASSWORD);

        // Switch identity while the first run is still fetching, then start a
        // second run for the new identity.
        identity.userId = 'second-user-id';
        const secondRun = service.run(PASSWORD);

        // Let the first run finish after the second run has already claimed
        // `#pendingRun` — the first run must abort on the identity mismatch and
        // must not clear the second run's pending state.
        finishFirstFetch([]);
        await Promise.all([firstRun, secondRun]);

        expect(fetchAllSecretData).toHaveBeenCalledTimes(2);
        // Only the second run's write went through; the first run aborted.
        expect(addSecretDataItem).toHaveBeenCalledTimes(1);
        expect(metadataService.items).toHaveLength(1);
        expect(logMock).toHaveBeenCalledTimes(1);
        expect(logMock).toHaveBeenCalledWith(
          'Error repairing primary SRP backup',
          expect.any(Error),
        );

        // A third call while the second run is settled must also start cleanly
        // (proving `#pendingRun` was cleared when the second run finished).
        fetchAllSecretData.mockClear();
        await service.run(PASSWORD);
        expect(fetchAllSecretData).toHaveBeenCalledTimes(1);
      });
    });

    describe('when the backup does not need a repair', () => {
      it.each([
        {
          description: 'the remote primary SRP is the local one',
          remoteItems: [
            createFetchedSecretDataItem({
              ...SRP1,
              dataType: EncAccountDataType.PrimarySrp,
            }),
            createFetchedSecretDataItem(ImportedPrivateKey1),
          ],
        },
        {
          description: 'the earliest legacy SRP is the local primary SRP',
          remoteItems: [
            createFetchedSecretDataItem(PrivateKey1),
            createFetchedSecretDataItem(SRP1),
            createFetchedSecretDataItem(SRP2),
          ],
        },
      ])(
        'does not change the remote backup when $description',
        async ({ remoteItems }) => {
          const { service, metadataService, trackEvent, ...mocks } = setup({
            remoteItems,
          });
          const originalItems = structuredClone(metadataService.items);

          await service.run(PASSWORD);

          expect(trackEvent).not.toHaveBeenCalled();
          expectNoWrites(mocks);
          expect(mocks.withRepairContext).not.toHaveBeenCalled();
          expect(metadataService.items).toStrictEqual(originalItems);
        },
      );
    });

    describe('when the backup cannot be read', () => {
      it('reports a failed plan and writes nothing when the remote backup cannot be fetched', async () => {
        const { service, fetchAllSecretData, trackEvent, ...mocks } = setup();
        const error = new Error('fetch failed');
        fetchAllSecretData.mockRejectedValue(error);

        expect(await service.run(PASSWORD)).toBeUndefined();

        expect(trackEvent).toHaveBeenCalledTimes(1);
        expect(trackEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            name: SeedlessPrimarySrpRepairEventName,
            properties: {
              status: 'failed',
              failure_stage: 'plan',
              failure_reason: 'backup_unreadable',
            },
          }),
        );
        expect(mocks.withRepairContext).not.toHaveBeenCalled();
        expectNoWrites(mocks);
        expect(logMock).toHaveBeenCalledWith(
          'Error planning primary SRP repair',
          error,
        );
      });

      it('reports a failed plan and writes nothing when a remote item cannot be parsed', async () => {
        const { service, fetchAllSecretData, trackEvent, ...mocks } = setup();
        fetchAllSecretData.mockResolvedValue([
          {
            data: stringToBytes('not valid metadata'),
            itemId: 'invalid',
            version: 'v2',
          },
        ]);

        expect(await service.run(PASSWORD)).toBeUndefined();

        expect(trackEvent).toHaveBeenCalledTimes(1);
        expect(trackEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            name: SeedlessPrimarySrpRepairEventName,
            properties: {
              status: 'failed',
              failure_stage: 'plan',
              failure_reason: 'backup_unreadable',
            },
          }),
        );
        expectNoWrites(mocks);
        expect(logMock).toHaveBeenCalledWith(
          'Error planning primary SRP repair',
          expect.any(Error),
        );
      });

      it.each([
        { description: 'missing', remoteItems: [] },
        {
          description: 'present',
          remoteItems: [createFetchedSecretDataItem(SRP1)],
        },
      ])(
        'reports a failed plan and writes nothing when the local primary SRP cannot be exported and the remote primary SRP is $description',
        async ({ remoteItems }) => {
          const { service, exportPrimarySeedPhrase, trackEvent, ...mocks } =
            setup({ remoteItems });
          const error = new Error('export failed');
          exportPrimarySeedPhrase.mockRejectedValue(error);

          expect(await service.run(PASSWORD)).toBeUndefined();

          expect(trackEvent).toHaveBeenCalledTimes(1);
          expect(trackEvent).toHaveBeenCalledWith(
            expect.objectContaining({
              name: SeedlessPrimarySrpRepairEventName,
              properties: {
                status: 'failed',
                failure_stage: 'plan',
                failure_reason: 'export_failed',
              },
            }),
          );
          expectNoWrites(mocks);
          expect(logMock).toHaveBeenCalledWith(
            'Error planning primary SRP repair',
            error,
          );
        },
      );
    });

    describe('when the repair cannot be applied', () => {
      it('does not write anything when the identity changed after planning', async () => {
        const { service, identity, exportPrimarySeedPhrase, ...mocks } = setup({
          remoteItems: [createFetchedSecretDataItem(PrimarySRP2)],
        });
        exportPrimarySeedPhrase.mockImplementation(async () => {
          identity.userId = 'another-user-id';
          return LOCAL_PRIMARY_SRP;
        });

        expect(await service.run(PASSWORD)).toBeUndefined();

        expectNoWrites(mocks);
        expect(logMock).toHaveBeenCalledWith(
          'Error repairing primary SRP backup',
          expect.any(Error),
        );
      });

      it('logs and resolves when the repair context fails', async () => {
        const { service, withRepairContext, ...mocks } = setup();
        const error = new Error('locked');
        withRepairContext.mockRejectedValue(error);

        expect(await service.run(PASSWORD)).toBeUndefined();

        expectNoWrites(mocks);
        expect(logMock).toHaveBeenCalledWith(
          'Error repairing primary SRP backup',
          error,
        );
      });

      it('logs and resolves when the write fails', async () => {
        const { service, addSecretDataItem } = setup({
          remoteItems: [createFetchedSecretDataItem(ImportedPrivateKey1)],
        });
        const error = new Error('write failed');
        addSecretDataItem.mockRejectedValue(error);

        expect(await service.run(PASSWORD)).toBeUndefined();

        expect(logMock).toHaveBeenCalledWith(
          'Error repairing primary SRP backup',
          error,
        );
      });
    });
  });
});
