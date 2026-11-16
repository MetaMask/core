import type {
  AuthenticatedUserStorageServiceGetUserAssetsAction,
  AuthenticatedUserStorageServiceHideTokensAction,
  AuthenticatedUserStorageServiceImportTokensAction,
  AuthenticatedUserStorageServiceSetUserAssetsAction,
  UserAssetsBlob,
} from '@metamask/authenticated-user-storage';
import type { Mock } from 'vitest';
import { describe, expect, it, vi } from 'vitest';

import { createMockMessengers } from './__fixtures__/MockAssetControllerMessenger.js';
import type { MockRootMessenger } from './__fixtures__/MockAssetControllerMessenger.js';
import { waitFor, waitUntilStable } from './__fixtures__/test-utils.js';
import type { AssetsControllerMessenger } from './AssetsController.js';
import { syncAusUserAssets } from './syncAusUserAssets.js';
import type { AccountId, Caip19AssetId } from './types.js';
import { normalizeAssetId } from './utils/index.js';

const MOCK_ACCOUNT_ID = 'mock-account-id' as AccountId;
const MOCK_ASSET_ID =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
const MOCK_ASSET_ID_LOWERCASE =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const OTHER_ASSET_ID =
  'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F' as Caip19AssetId;
const MALFORMED_ASSET_ID = 'not-a-caip19-asset-id' as Caip19AssetId;

const GET_USER_ASSETS = 'AuthenticatedUserStorageService:getUserAssets';
const SET_USER_ASSETS = 'AuthenticatedUserStorageService:setUserAssets';
const IMPORT_TOKENS = 'AuthenticatedUserStorageService:importTokens';
const HIDE_TOKENS = 'AuthenticatedUserStorageService:hideTokens';

type RecordedCall = Mock<
  (action: string, ...params: unknown[]) => Promise<unknown>
>;

type RecordedException = Mock<(error: Error) => void>;

type FixtureMessenger = Omit<
  AssetsControllerMessenger,
  'call' | 'captureException'
> & {
  call: RecordedCall;
  captureException: RecordedException;
};

type AusActionHandlers = {
  getUserAssets: Mock<
    AuthenticatedUserStorageServiceGetUserAssetsAction['handler']
  >;
  setUserAssets: Mock<
    AuthenticatedUserStorageServiceSetUserAssetsAction['handler']
  >;
  importTokens: Mock<
    AuthenticatedUserStorageServiceImportTokensAction['handler']
  >;
  hideTokens: Mock<AuthenticatedUserStorageServiceHideTokensAction['handler']>;
};

type AusMockOptions = {
  /** The blob `getUserAssets` serves (defaults to `null`, i.e. no blob). */
  blob?: UserAssetsBlob | null;
  /** Makes every AUS action reject, simulating AUS being unavailable. */
  rejectWith?: Error;
};

/**
 * Build a restricted assets messenger whose `call` is spied and whose
 * `captureException` is the given reporter.
 *
 * @param captureException - Reports a failed AUS sync.
 * @returns The root messenger, for action handlers, and the spied controller
 * messenger.
 */
function createFixtureMessenger(captureException: RecordedException): {
  rootMessenger: MockRootMessenger;
  messenger: FixtureMessenger;
} {
  const { rootMessenger, assetsControllerMessenger } = createMockMessengers({
    captureException,
  });
  const call = vi.spyOn(assetsControllerMessenger, 'call');

  return {
    rootMessenger,
    messenger: Object.assign(assetsControllerMessenger, {
      call: call as RecordedCall,
      captureException,
    }),
  };
}

/**
 * A minimal stand-in for AssetsController carrying the four decorated
 * methods, so the decorator can be tested in isolation from controller
 * state machinery. Like the real methods, each one validates its asset ID
 * first (a malformed ID throws before anything is applied locally), then
 * applies its local mutation synchronously, and only `addCustomAsset` has
 * post-mutation work — modeled by `pending` — that settles after it returns
 * control.
 */
class AusSyncFixture {
  readonly rootMessenger: MockRootMessenger;

  readonly messenger: FixtureMessenger;

  /** Handlers registered for the four AUS user-asset actions. */
  ausHandlers?: AusActionHandlers;

  /** When set, `addCustomAsset` resolves only when this promise does. */
  pending?: Promise<void>;

  constructor() {
    const captureException = vi.fn<(error: Error) => void>();
    const created = createFixtureMessenger(captureException);
    this.rootMessenger = created.rootMessenger;
    this.messenger = created.messenger;
  }

  /** Records that a decorated method applied its local mutation. */
  localCalls: string[] = [];

  @syncAusUserAssets
  async addCustomAsset(
    _accountId: AccountId,
    assetId: Caip19AssetId,
  ): Promise<void> {
    normalizeAssetId(assetId);
    this.localCalls.push('addCustomAsset');
    return this.pending;
  }

  @syncAusUserAssets
  removeCustomAsset(_accountId: AccountId, assetId: Caip19AssetId): void {
    normalizeAssetId(assetId);
    this.localCalls.push('removeCustomAsset');
  }

  @syncAusUserAssets
  hideAsset(assetId: Caip19AssetId): void {
    normalizeAssetId(assetId);
    this.localCalls.push('hideAsset');
  }

  @syncAusUserAssets
  unhideAsset(assetId: Caip19AssetId): void {
    normalizeAssetId(assetId);
    this.localCalls.push('unhideAsset');
  }
}

/**
 * Register AUS user-asset handlers that serve `blob` or reject.
 *
 * @param fixture - The fixture whose root messenger receives the handlers.
 * @param options - Options controlling the handlers' behavior.
 * @param options.blob - The user-assets blob `getUserAssets` serves.
 * @param options.rejectWith - An error every AUS action rejects with.
 */
function registerAusHandlers(
  fixture: AusSyncFixture,
  { blob = null, rejectWith }: AusMockOptions = {},
): void {
  const emptyBlob: UserAssetsBlob = {
    version: 1,
    importedAssets: [],
    hiddenAssets: [],
  };

  const getUserAssets = vi.fn<
    AuthenticatedUserStorageServiceGetUserAssetsAction['handler']
  >(async () => {
    if (rejectWith) {
      throw rejectWith;
    }
    return blob;
  });
  const setUserAssets = vi.fn<
    AuthenticatedUserStorageServiceSetUserAssetsAction['handler']
  >(async () => {
    if (rejectWith) {
      throw rejectWith;
    }
  });
  const importTokens = vi.fn<
    AuthenticatedUserStorageServiceImportTokensAction['handler']
  >(async () => {
    if (rejectWith) {
      throw rejectWith;
    }
    return emptyBlob;
  });
  const hideTokens = vi.fn<
    AuthenticatedUserStorageServiceHideTokensAction['handler']
  >(async () => {
    if (rejectWith) {
      throw rejectWith;
    }
    return emptyBlob;
  });

  fixture.rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:getUserAssets',
    getUserAssets,
  );
  fixture.rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:setUserAssets',
    setUserAssets,
  );
  fixture.rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:importTokens',
    importTokens,
  );
  fixture.rootMessenger.registerActionHandler(
    'AuthenticatedUserStorageService:hideTokens',
    hideTokens,
  );

  fixture.ausHandlers = {
    getUserAssets,
    setUserAssets,
    importTokens,
    hideTokens,
  };
}

type FixtureInvocation = (
  fixture: AusSyncFixture,
  assetId: Caip19AssetId,
) => void | Promise<void>;

describe('syncAusUserAssets', () => {
  describe('merge operations', () => {
    it.each<
      [methodName: string, actionType: string, invoke: FixtureInvocation]
    >([
      [
        'addCustomAsset',
        IMPORT_TOKENS,
        (fixture, assetId): Promise<void> =>
          fixture.addCustomAsset(MOCK_ACCOUNT_ID, assetId),
      ],
      [
        'hideAsset',
        HIDE_TOKENS,
        (fixture, assetId): void => fixture.hideAsset(assetId),
      ],
    ])(
      'mirrors %s to AUS via a single %s call with a normalized id',
      async (_methodName, actionType, invoke) => {
        const fixture = new AusSyncFixture();
        registerAusHandlers(fixture);

        await invoke(fixture, MOCK_ASSET_ID_LOWERCASE);

        // Exactly one high-level call, with the checksummed id — and, for the
        // account-first signatures, the account id is never mistaken for the
        // asset id.
        await waitFor(() => {
          expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
          expect(fixture.messenger.call).toHaveBeenCalledWith(actionType, [
            MOCK_ASSET_ID,
          ]);
        });
      },
    );
  });

  describe('strip operations', () => {
    it.each<
      [
        methodName: string,
        blob: UserAssetsBlob,
        expectedBlob: UserAssetsBlob,
        invoke: FixtureInvocation,
      ]
    >([
      [
        'removeCustomAsset',
        {
          version: 1,
          importedAssets: [MOCK_ASSET_ID, OTHER_ASSET_ID],
          hiddenAssets: [OTHER_ASSET_ID],
        },
        {
          version: 1,
          importedAssets: [OTHER_ASSET_ID],
          hiddenAssets: [OTHER_ASSET_ID],
        },
        (fixture, assetId): void =>
          fixture.removeCustomAsset(MOCK_ACCOUNT_ID, assetId),
      ],
      [
        'unhideAsset',
        {
          version: 1,
          importedAssets: [OTHER_ASSET_ID],
          hiddenAssets: [MOCK_ASSET_ID, OTHER_ASSET_ID],
        },
        {
          version: 1,
          importedAssets: [OTHER_ASSET_ID],
          hiddenAssets: [OTHER_ASSET_ID],
        },
        (fixture, assetId): void => fixture.unhideAsset(assetId),
      ],
    ])(
      'strips the asset from the correct AUS list for %s',
      async (_methodName, blob, expectedBlob, invoke) => {
        const fixture = new AusSyncFixture();
        registerAusHandlers(fixture, { blob });

        await invoke(fixture, MOCK_ASSET_ID_LOWERCASE);

        // Read-modify-write: GET the blob, then PUT it with the id filtered
        // from the target list, leaving every other entry untouched.
        await waitFor(() => {
          expect(fixture.messenger.call).toHaveBeenCalledTimes(2);
          expect(fixture.messenger.call).toHaveBeenNthCalledWith(
            1,
            GET_USER_ASSETS,
          );
          expect(fixture.messenger.call).toHaveBeenNthCalledWith(
            2,
            SET_USER_ASSETS,
            expectedBlob,
          );
        });
      },
    );

    it('skips the write when there is no stored blob', async () => {
      const fixture = new AusSyncFixture();
      registerAusHandlers(fixture, { blob: null });

      fixture.removeCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
      await waitUntilStable(() => fixture.messenger.call.mock.calls.length);

      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
      expect(fixture.messenger.call).toHaveBeenCalledWith(GET_USER_ASSETS);
    });

    it('skips the write when the asset is already absent from the list', async () => {
      const fixture = new AusSyncFixture();
      registerAusHandlers(fixture, {
        blob: {
          version: 1,
          importedAssets: [OTHER_ASSET_ID],
          hiddenAssets: [],
        },
      });

      fixture.removeCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
      await waitUntilStable(() => fixture.messenger.call.mock.calls.length);

      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
      expect(fixture.messenger.call).toHaveBeenCalledWith(GET_USER_ASSETS);
    });
  });

  describe('timing', () => {
    it('fires immediately when a sync method returns', () => {
      const fixture = new AusSyncFixture();
      registerAusHandlers(fixture);

      fixture.hideAsset(MOCK_ASSET_ID);

      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
      expect(fixture.messenger.call).toHaveBeenCalledWith(HIDE_TOKENS, [
        MOCK_ASSET_ID,
      ]);
    });

    it('fires when an async method is invoked, before its post-mutation work settles', async () => {
      const fixture = new AusSyncFixture();
      registerAusHandlers(fixture);
      let resolvePending: () => void = () => undefined;
      fixture.pending = new Promise<void>((resolve) => {
        resolvePending = resolve;
      });

      const pendingAdd = fixture.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

      // The local mutation is applied before the method returns control, so
      // the mirror fires without waiting for the method to settle — a later
      // failure in the post-mutation work can no longer skip it.
      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
      expect(fixture.messenger.call).toHaveBeenCalledWith(IMPORT_TOKENS, [
        MOCK_ASSET_ID,
      ]);

      resolvePending();
      await pendingAdd;
    });

    it('does not write back over a later remove when a pending add settles', async () => {
      const fixture = new AusSyncFixture();
      registerAusHandlers(fixture, {
        blob: {
          version: 1,
          importedAssets: [MOCK_ASSET_ID, OTHER_ASSET_ID],
          hiddenAssets: [],
        },
      });
      let resolvePending: () => void = () => undefined;
      fixture.pending = new Promise<void>((resolve) => {
        resolvePending = resolve;
      });

      // The add's post-mutation work is still in flight when the remove
      // lands.
      const pendingAdd = fixture.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
      fixture.removeCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);

      // The import fired at add time and the strip applied after it; the
      // final blob reflects the removal.
      await waitFor(() => {
        expect(fixture.messenger.call).toHaveBeenCalledTimes(3);
        expect(fixture.messenger.call).toHaveBeenNthCalledWith(
          1,
          IMPORT_TOKENS,
          [MOCK_ASSET_ID],
        );
        expect(fixture.messenger.call).toHaveBeenNthCalledWith(
          2,
          GET_USER_ASSETS,
        );
        expect(fixture.messenger.call).toHaveBeenNthCalledWith(
          3,
          SET_USER_ASSETS,
          {
            version: 1,
            importedAssets: [OTHER_ASSET_ID],
            hiddenAssets: [],
          },
        );
      });

      resolvePending();
      await pendingAdd;
      await waitUntilStable(() => fixture.messenger.call.mock.calls.length);

      // The add settling late fires no further AUS write.
      expect(fixture.messenger.call).toHaveBeenCalledTimes(3);
    });
    it('does not let an in-flight import undo a later strip', async () => {
      const fixture = new AusSyncFixture();
      // A stateful AUS: the import only lands when released, like a slow PUT.
      let blob: UserAssetsBlob = {
        version: 1,
        importedAssets: [OTHER_ASSET_ID],
        hiddenAssets: [],
      };
      let releaseImport: () => void = () => undefined;
      fixture.rootMessenger.registerActionHandler(
        'AuthenticatedUserStorageService:importTokens',
        async (ids): Promise<UserAssetsBlob> => {
          await new Promise<void>((resolve) => {
            releaseImport = resolve;
          });
          blob = {
            ...blob,
            importedAssets: [...blob.importedAssets, ...ids],
          };
          return blob;
        },
      );
      fixture.rootMessenger.registerActionHandler(
        'AuthenticatedUserStorageService:getUserAssets',
        async (): Promise<UserAssetsBlob | null> => blob,
      );
      fixture.rootMessenger.registerActionHandler(
        'AuthenticatedUserStorageService:setUserAssets',
        async (nextBlob): Promise<void> => {
          blob = nextBlob;
        },
      );

      await fixture.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
      fixture.removeCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
      await waitUntilStable(() => fixture.messenger.call.mock.calls.length);

      // The strip waits for the in-flight import instead of reading the
      // stale blob and skipping its write.
      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);

      releaseImport();
      await waitFor(() => {
        expect(fixture.messenger.call).toHaveBeenNthCalledWith(
          2,
          GET_USER_ASSETS,
        );
        expect(blob.importedAssets).toStrictEqual([OTHER_ASSET_ID]);
      });
    });

    it('keeps serializing syncs after one of them fails', async () => {
      const fixture = new AusSyncFixture();
      fixture.rootMessenger.registerActionHandler(
        'AuthenticatedUserStorageService:hideTokens',
        async (): Promise<UserAssetsBlob> => {
          throw new Error('AUS unavailable');
        },
      );
      fixture.rootMessenger.registerActionHandler(
        'AuthenticatedUserStorageService:getUserAssets',
        async (): Promise<UserAssetsBlob | null> => null,
      );

      fixture.hideAsset(MOCK_ASSET_ID);
      fixture.unhideAsset(MOCK_ASSET_ID);
      await waitFor(() => {
        expect(fixture.messenger.captureException).toHaveBeenCalledTimes(1);
        expect(fixture.messenger.call).toHaveBeenNthCalledWith(
          2,
          GET_USER_ASSETS,
        );
      });
    });
  });

  describe('local failures', () => {
    it.each([
      [
        'hideAsset',
        (fixture: AusSyncFixture): void =>
          expect(() => fixture.hideAsset(MALFORMED_ASSET_ID)).toThrow(
            'Invalid CAIP asset type.',
          ),
      ],
      [
        'unhideAsset',
        (fixture: AusSyncFixture): void =>
          expect(() => fixture.unhideAsset(MALFORMED_ASSET_ID)).toThrow(
            'Invalid CAIP asset type.',
          ),
      ],
      [
        'removeCustomAsset',
        (fixture: AusSyncFixture): void =>
          expect(() =>
            fixture.removeCustomAsset(MOCK_ACCOUNT_ID, MALFORMED_ASSET_ID),
          ).toThrow('Invalid CAIP asset type.'),
      ],
    ])(
      'never writes to AUS when %s fails validation',
      (methodName, assertThrows) => {
        const fixture = new AusSyncFixture();
        registerAusHandlers(fixture);

        assertThrows(fixture);

        expect(fixture.messenger.call).not.toHaveBeenCalled();
        expect(fixture.localCalls).not.toContain(methodName);
      },
    );

    it('never writes to AUS when an async method fails validation', async () => {
      const fixture = new AusSyncFixture();
      registerAusHandlers(fixture);

      await expect(
        fixture.addCustomAsset(MOCK_ACCOUNT_ID, MALFORMED_ASSET_ID),
      ).rejects.toThrow('Invalid CAIP asset type.');

      await waitUntilStable(() => [fixture.messenger.call.mock.calls.length]);

      expect(fixture.messenger.call).not.toHaveBeenCalled();
      expect(fixture.localCalls).not.toContain('addCustomAsset');
    });

    it('still mirrors an async method whose post-mutation work later rejects', async () => {
      const fixture = new AusSyncFixture();
      registerAusHandlers(fixture);
      fixture.pending = Promise.reject(new Error('post-mutation fetch failed'));

      await expect(
        fixture.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID),
      ).rejects.toThrow('post-mutation fetch failed');

      // The local mutation was applied before the failure, so the mirror
      // still fires — local state and AUS stay in sync.
      expect(fixture.localCalls).toContain('addCustomAsset');
      await waitUntilStable(() => [fixture.messenger.call.mock.calls.length]);
      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
      expect(fixture.messenger.call).toHaveBeenCalledWith(IMPORT_TOKENS, [
        MOCK_ASSET_ID,
      ]);
    });
  });

  describe('AUS failures', () => {
    it('swallows an AUS rejection without affecting the method result', async () => {
      const fixture = new AusSyncFixture();
      registerAusHandlers(fixture, {
        rejectWith: new Error('AUS unavailable'),
      });
      const unhandledRejections: unknown[] = [];
      const recordUnhandledRejection = (reason: unknown): void => {
        unhandledRejections.push(reason);
      };
      process.on('unhandledRejection', recordUnhandledRejection);

      try {
        expect(
          await fixture.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID),
        ).toBeUndefined();
        await waitUntilStable(() => [
          fixture.messenger.call.mock.calls.length,
          fixture.messenger.captureException.mock.calls.length,
          unhandledRejections.length,
        ]);
      } finally {
        process.off('unhandledRejection', recordUnhandledRejection);
      }

      // The local method ran and its result was unaffected; the AUS failure
      // was swallowed (no unhandled rejection) and reported.
      expect(fixture.localCalls).toContain('addCustomAsset');
      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
      expect(unhandledRejections).toStrictEqual([]);
      expect(fixture.messenger.captureException).toHaveBeenCalledTimes(1);
      expect(fixture.messenger.captureException).toHaveBeenCalledWith(
        new Error('Failed to sync user assets to AUS', {
          cause: new Error('AUS unavailable'),
        }),
      );
    });

    it('swallows a throwing error reporter', async () => {
      const fixture = new AusSyncFixture();
      registerAusHandlers(fixture, {
        rejectWith: new Error('AUS unavailable'),
      });
      fixture.messenger.captureException.mockImplementation(() => {
        throw new Error('reporter broke');
      });

      fixture.hideAsset(MOCK_ASSET_ID);
      await waitUntilStable(() => [
        fixture.messenger.captureException.mock.calls.length,
      ]);

      expect(fixture.messenger.captureException).toHaveBeenCalledTimes(1);
    });
  });

  describe('misapplication', () => {
    it('throws at class-definition time for an unconfigured method', () => {
      expect(() => {
        class Misapplied {
          @syncAusUserAssets
          unrelatedMethod(): void {
            throw new Error('never called');
          }
        }
        return Misapplied;
      }).toThrow(
        "@syncAusUserAssets applied to unconfigured method 'unrelatedMethod'",
      );
    });
  });
});
