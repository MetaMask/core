import type { UserAssetsBlob } from '@metamask/authenticated-user-storage';

import { syncAusUserAssets } from './syncAusUserAssets.js';
import type { AccountId, Caip19AssetId } from './types.js';

const MOCK_ACCOUNT_ID = 'mock-account-id' as AccountId;
const MOCK_ASSET_ID =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Caip19AssetId;
const MOCK_ASSET_ID_LOWERCASE =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const OTHER_ASSET_ID =
  'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F' as Caip19AssetId;

const GET_USER_ASSETS = 'AuthenticatedUserStorageService:getUserAssets';
const SET_USER_ASSETS = 'AuthenticatedUserStorageService:setUserAssets';
const IMPORT_TOKENS = 'AuthenticatedUserStorageService:importTokens';
const HIDE_TOKENS = 'AuthenticatedUserStorageService:hideTokens';

/**
 * Flush pending microtasks and timers so fire-and-forget AUS syncs settle
 * before Jest tears down the test.
 */
async function flushPromises(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

type AusFixtureMessenger = { call: jest.Mock };

type AusMockOptions = {
  /** The blob `getUserAssets` serves (defaults to `null`, i.e. no blob). */
  blob?: UserAssetsBlob | null;
  /** Makes every AUS action reject, simulating AUS being unavailable. */
  rejectWith?: Error;
};

/**
 * Install a default AUS mock on the fixture messenger: `getUserAssets` serves
 * the given blob and every other action resolves.
 *
 * @param messenger - The fixture messenger to mock.
 * @param options - Options controlling the mock's behavior.
 * @param options.blob - The user-assets blob `getUserAssets` serves.
 * @param options.rejectWith - An error every AUS action rejects with.
 */
function installAusMock(
  messenger: AusFixtureMessenger,
  { blob = null, rejectWith }: AusMockOptions = {},
): void {
  messenger.call.mockImplementation(async (actionType: string) => {
    if (rejectWith) {
      throw rejectWith;
    }
    if (actionType === GET_USER_ASSETS) {
      return blob;
    }
    return { version: 1, importedAssets: [], hiddenAssets: [] };
  });
}

/**
 * A minimal stand-in for AssetsController carrying the four decorated
 * methods, so the decorator can be tested in isolation from controller
 * state machinery.
 */
class AusSyncFixture {
  readonly messenger: AusFixtureMessenger = { call: jest.fn() };

  /** Makes every decorated method fail locally when set. */
  shouldThrow = false;

  /** When set, `addCustomAsset` resolves only when this promise does. */
  pending?: Promise<void>;

  /** Records that a decorated method's local body ran. */
  localCalls: string[] = [];

  @syncAusUserAssets
  async addCustomAsset(
    _accountId: AccountId,
    _assetId: Caip19AssetId,
  ): Promise<void> {
    this.localCalls.push('addCustomAsset');
    if (this.shouldThrow) {
      throw new Error('local failure');
    }
    return this.pending;
  }

  @syncAusUserAssets
  removeCustomAsset(_accountId: AccountId, _assetId: Caip19AssetId): void {
    this.localCalls.push('removeCustomAsset');
    if (this.shouldThrow) {
      throw new Error('local failure');
    }
  }

  @syncAusUserAssets
  hideAsset(_assetId: Caip19AssetId): void {
    this.localCalls.push('hideAsset');
    if (this.shouldThrow) {
      throw new Error('local failure');
    }
  }

  @syncAusUserAssets
  unhideAsset(_assetId: Caip19AssetId): void {
    this.localCalls.push('unhideAsset');
    if (this.shouldThrow) {
      throw new Error('local failure');
    }
  }
}

type FixtureInvocation = (
  fixture: AusSyncFixture,
  assetId: Caip19AssetId,
) => void | Promise<void>;

describe('syncAusUserAssets', () => {
  describe('merge operations', () => {
    it.each<
      [
        methodName: string,
        actionType: string,
        invoke: FixtureInvocation,
      ]
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
        installAusMock(fixture.messenger);

        await invoke(fixture, MOCK_ASSET_ID_LOWERCASE);
        await flushPromises();

        // Exactly one high-level call, with the checksummed id — and, for the
        // account-first signatures, the account id is never mistaken for the
        // asset id.
        expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
        expect(fixture.messenger.call).toHaveBeenCalledWith(actionType, [
          MOCK_ASSET_ID,
        ]);
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
        installAusMock(fixture.messenger, { blob });

        await invoke(fixture, MOCK_ASSET_ID_LOWERCASE);
        await flushPromises();

        // Read-modify-write: GET the blob, then PUT it with the id filtered
        // from the target list, leaving every other entry untouched.
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
      },
    );

    it('skips the write when there is no stored blob', async () => {
      const fixture = new AusSyncFixture();
      installAusMock(fixture.messenger, { blob: null });

      fixture.removeCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
      await flushPromises();

      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
      expect(fixture.messenger.call).toHaveBeenCalledWith(GET_USER_ASSETS);
    });

    it('skips the write when the asset is already absent from the list', async () => {
      const fixture = new AusSyncFixture();
      installAusMock(fixture.messenger, {
        blob: {
          version: 1,
          importedAssets: [OTHER_ASSET_ID],
          hiddenAssets: [],
        },
      });

      fixture.removeCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
      await flushPromises();

      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
      expect(fixture.messenger.call).toHaveBeenCalledWith(GET_USER_ASSETS);
    });
  });

  describe('timing', () => {
    it('fires immediately when a sync method returns', () => {
      const fixture = new AusSyncFixture();
      installAusMock(fixture.messenger);

      fixture.hideAsset(MOCK_ASSET_ID);

      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
      expect(fixture.messenger.call).toHaveBeenCalledWith(HIDE_TOKENS, [
        MOCK_ASSET_ID,
      ]);
    });

    it('fires only when an async method resolves', async () => {
      const fixture = new AusSyncFixture();
      installAusMock(fixture.messenger);
      let resolvePending: () => void = () => undefined;
      fixture.pending = new Promise<void>((resolve) => {
        resolvePending = resolve;
      });

      const pending = fixture.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID);
      await flushPromises();
      expect(fixture.messenger.call).not.toHaveBeenCalled();

      resolvePending();
      await pending;

      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
      expect(fixture.messenger.call).toHaveBeenCalledWith(IMPORT_TOKENS, [
        MOCK_ASSET_ID,
      ]);
    });
  });

  describe('local failures', () => {
    it.each([
      [
        'hideAsset',
        (fixture: AusSyncFixture): void =>
          expect(() => fixture.hideAsset(MOCK_ASSET_ID)).toThrow('local failure'),
      ],
      [
        'unhideAsset',
        (fixture: AusSyncFixture): void =>
          expect(() => fixture.unhideAsset(MOCK_ASSET_ID)).toThrow(
            'local failure',
          ),
      ],
      [
        'removeCustomAsset',
        (fixture: AusSyncFixture): void =>
          expect(() =>
            fixture.removeCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID),
          ).toThrow('local failure'),
      ],
    ])('does not fire the AUS sync when %s throws', (methodName, assertThrows) => {
      const fixture = new AusSyncFixture();
      installAusMock(fixture.messenger);
      fixture.shouldThrow = true;

      assertThrows(fixture);

      expect(fixture.messenger.call).not.toHaveBeenCalled();
      expect(fixture.localCalls).toContain(methodName);
    });

    it('does not fire the AUS sync when an async method rejects', async () => {
      const fixture = new AusSyncFixture();
      installAusMock(fixture.messenger);
      fixture.shouldThrow = true;

      await expect(
        fixture.addCustomAsset(MOCK_ACCOUNT_ID, MOCK_ASSET_ID),
      ).rejects.toThrow('local failure');
      await flushPromises();

      expect(fixture.messenger.call).not.toHaveBeenCalled();
    });
  });

  describe('AUS failures', () => {
    it('swallows an AUS rejection without affecting the method result', async () => {
      const fixture = new AusSyncFixture();
      installAusMock(fixture.messenger, {
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
        await flushPromises();
      } finally {
        process.off('unhandledRejection', recordUnhandledRejection);
      }

      // The local method ran and its result was unaffected; the AUS failure
      // was swallowed (no unhandled rejection) and debug-logged.
      expect(fixture.localCalls).toContain('addCustomAsset');
      expect(fixture.messenger.call).toHaveBeenCalledTimes(1);
      expect(unhandledRejections).toStrictEqual([]);
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
