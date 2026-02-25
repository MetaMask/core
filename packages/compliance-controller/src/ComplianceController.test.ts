import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import { ComplianceController } from './ComplianceController';
import type { ComplianceControllerMessenger } from './ComplianceController';
import { selectIsWalletBlocked } from './selectors';

const MOCK_BLOCKED_WALLETS_RESPONSE = {
  addresses: ['0xBLOCKED_A', '0xBLOCKED_B'],
  sources: { ofac: 100, remote: 5 },
  lastUpdated: '2026-01-15T00:00:00.000Z',
};

describe('ComplianceController', () => {
  describe('constructor', () => {
    it('accepts initial state', async () => {
      const givenState = {
        walletComplianceStatusMap: {
          '0xABC123': {
            address: '0xABC123',
            blocked: true,
            checkedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        blockedWallets: null,
        blockedWalletsLastFetched: 0,
        lastCheckedAt: '2026-01-01T00:00:00.000Z',
      };

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(givenState);
        },
      );
    });

    it('fills in missing initial state with defaults', async () => {
      await withController(({ controller }) => {
        expect(controller.state).toMatchInlineSnapshot(`
          {
            "blockedWallets": null,
            "blockedWalletsLastFetched": 0,
            "lastCheckedAt": null,
            "walletComplianceStatusMap": {},
          }
        `);
      });
    });
  });

  describe('init', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('fetches the blocked wallets list when it has never been fetched', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        const updateBlockedWallets = jest.fn(
          async () => MOCK_BLOCKED_WALLETS_RESPONSE,
        );
        rootMessenger.registerActionHandler(
          'ComplianceService:updateBlockedWallets',
          updateBlockedWallets,
        );

        await controller.init();

        expect(updateBlockedWallets).toHaveBeenCalledTimes(1);
        expect(controller.state.blockedWallets).toStrictEqual({
          ...MOCK_BLOCKED_WALLETS_RESPONSE,
          fetchedAt: '2026-02-01T00:00:00.000Z',
        });
      });
    });

    it('fetches the blocked wallets list when the cache is stale', async () => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000 - 1;
      await withController(
        {
          options: {
            state: { blockedWalletsLastFetched: oneHourAgo },
          },
        },
        async ({ controller, rootMessenger }) => {
          const updateBlockedWallets = jest.fn(
            async () => MOCK_BLOCKED_WALLETS_RESPONSE,
          );
          rootMessenger.registerActionHandler(
            'ComplianceService:updateBlockedWallets',
            updateBlockedWallets,
          );

          await controller.init();

          expect(updateBlockedWallets).toHaveBeenCalledTimes(1);
        },
      );
    });

    it('does not fetch when the cache is fresh', async () => {
      await withController(
        {
          options: {
            state: { blockedWalletsLastFetched: Date.now() },
          },
        },
        async ({ controller, rootMessenger }) => {
          const updateBlockedWallets = jest.fn(
            async () => MOCK_BLOCKED_WALLETS_RESPONSE,
          );
          rootMessenger.registerActionHandler(
            'ComplianceService:updateBlockedWallets',
            updateBlockedWallets,
          );

          await controller.init();

          expect(updateBlockedWallets).not.toHaveBeenCalled();
        },
      );
    });

    it('respects a custom blockedWalletsRefreshInterval', async () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000 - 1;
      await withController(
        {
          options: {
            state: { blockedWalletsLastFetched: fiveMinutesAgo },
            blockedWalletsRefreshInterval: 5 * 60 * 1000,
          },
        },
        async ({ controller, rootMessenger }) => {
          const updateBlockedWallets = jest.fn(
            async () => MOCK_BLOCKED_WALLETS_RESPONSE,
          );
          rootMessenger.registerActionHandler(
            'ComplianceService:updateBlockedWallets',
            updateBlockedWallets,
          );

          await controller.init();

          expect(updateBlockedWallets).toHaveBeenCalledTimes(1);
        },
      );
    });
  });

  describe('ComplianceController:init', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does the same thing as the direct method', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'ComplianceService:updateBlockedWallets',
          async () => MOCK_BLOCKED_WALLETS_RESPONSE,
        );

        await rootMessenger.call('ComplianceController:init');

        expect(controller.state.blockedWallets).toStrictEqual({
          ...MOCK_BLOCKED_WALLETS_RESPONSE,
          fetchedAt: '2026-02-01T00:00:00.000Z',
        });
      });
    });
  });

  describe('selectIsWalletBlocked', () => {
    it('returns true if the wallet is in the cached blocklist', async () => {
      await withController(
        {
          options: {
            state: {
              blockedWallets: {
                addresses: ['0xBLOCKED_A', '0xBLOCKED_B'],
                sources: { ofac: 2, remote: 0 },
                lastUpdated: '2026-01-01T00:00:00.000Z',
                fetchedAt: '2026-01-01T00:00:00.000Z',
              },
            },
          },
        },
        ({ controller }) => {
          expect(selectIsWalletBlocked('0xBLOCKED_A')(controller.state)).toBe(
            true,
          );
        },
      );
    });

    it('returns true if the wallet was checked on-demand and found blocked', async () => {
      await withController(
        {
          options: {
            state: {
              walletComplianceStatusMap: {
                '0xON_DEMAND': {
                  address: '0xON_DEMAND',
                  blocked: true,
                  checkedAt: '2026-01-01T00:00:00.000Z',
                },
              },
            },
          },
        },
        ({ controller }) => {
          expect(selectIsWalletBlocked('0xON_DEMAND')(controller.state)).toBe(
            true,
          );
        },
      );
    });

    it('returns false if the wallet is not in the blocklist or status map', async () => {
      await withController(({ controller }) => {
        expect(selectIsWalletBlocked('0xUNKNOWN')(controller.state)).toBe(
          false,
        );
      });
    });

    it('returns false if the wallet is in the status map but not blocked', async () => {
      await withController(
        {
          options: {
            state: {
              walletComplianceStatusMap: {
                '0xSAFE': {
                  address: '0xSAFE',
                  blocked: false,
                  checkedAt: '2026-01-01T00:00:00.000Z',
                },
              },
            },
          },
        },
        ({ controller }) => {
          expect(selectIsWalletBlocked('0xSAFE')(controller.state)).toBe(false);
        },
      );
    });

    it('returns false if the blocklist is null and the address is unknown', async () => {
      await withController(({ controller }) => {
        expect(selectIsWalletBlocked('0xANYTHING')(controller.state)).toBe(
          false,
        );
      });
    });

    it('performs case-sensitive lookup', async () => {
      await withController(
        {
          options: {
            state: {
              blockedWallets: {
                addresses: ['0xABC'],
                sources: { ofac: 1, remote: 0 },
                lastUpdated: '2026-01-01T00:00:00.000Z',
                fetchedAt: '2026-01-01T00:00:00.000Z',
              },
            },
          },
        },
        ({ controller }) => {
          expect(selectIsWalletBlocked('0xAbC')(controller.state)).toBe(false);
        },
      );
    });
  });

  describe('ComplianceController:checkWalletCompliance', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls the service, persists the result to state, and returns the status', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'ComplianceService:checkWalletCompliance',
          async (address) => ({
            address,
            blocked: true,
          }),
        );

        const result = await rootMessenger.call(
          'ComplianceController:checkWalletCompliance',
          '0xABC123',
        );

        expect(result).toStrictEqual({
          address: '0xABC123',
          blocked: true,
          checkedAt: '2026-02-01T00:00:00.000Z',
        });
        expect(controller.state.walletComplianceStatusMap).toStrictEqual({
          '0xABC123': {
            address: '0xABC123',
            blocked: true,
            checkedAt: '2026-02-01T00:00:00.000Z',
          },
        });
        expect(controller.state.lastCheckedAt).toBe('2026-02-01T00:00:00.000Z');
      });
    });
  });

  describe('ComplianceController:checkWalletsCompliance', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls the service, persists all results to state, and returns statuses', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'ComplianceService:checkWalletsCompliance',
          async (addresses) =>
            addresses.map((addr) => ({
              address: addr,
              blocked: addr === '0xBLOCKED',
            })),
        );

        const result = await rootMessenger.call(
          'ComplianceController:checkWalletsCompliance',
          ['0xSAFE', '0xBLOCKED'],
        );

        expect(result).toStrictEqual([
          {
            address: '0xSAFE',
            blocked: false,
            checkedAt: '2026-02-01T00:00:00.000Z',
          },
          {
            address: '0xBLOCKED',
            blocked: true,
            checkedAt: '2026-02-01T00:00:00.000Z',
          },
        ]);
        expect(controller.state.walletComplianceStatusMap).toStrictEqual({
          '0xSAFE': {
            address: '0xSAFE',
            blocked: false,
            checkedAt: '2026-02-01T00:00:00.000Z',
          },
          '0xBLOCKED': {
            address: '0xBLOCKED',
            blocked: true,
            checkedAt: '2026-02-01T00:00:00.000Z',
          },
        });
      });
    });
  });

  describe('ComplianceController:updateBlockedWallets', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls the service, persists data to state, and updates the lastFetched timestamp', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'ComplianceService:updateBlockedWallets',
          async () => MOCK_BLOCKED_WALLETS_RESPONSE,
        );

        const result = await rootMessenger.call(
          'ComplianceController:updateBlockedWallets',
        );

        expect(result).toStrictEqual({
          ...MOCK_BLOCKED_WALLETS_RESPONSE,
          fetchedAt: '2026-02-01T00:00:00.000Z',
        });
        expect(controller.state.blockedWallets).toStrictEqual({
          ...MOCK_BLOCKED_WALLETS_RESPONSE,
          fetchedAt: '2026-02-01T00:00:00.000Z',
        });
        expect(controller.state.blockedWalletsLastFetched).toBeGreaterThan(0);
        expect(controller.state.lastCheckedAt).toBe('2026-02-01T00:00:00.000Z');
      });
    });
  });

  describe('ComplianceController:clearComplianceState', () => {
    it('resets all compliance data to defaults', async () => {
      const givenState = {
        walletComplianceStatusMap: {
          '0xABC': {
            address: '0xABC',
            blocked: true,
            checkedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        blockedWallets: {
          addresses: ['0xABC'],
          sources: { ofac: 10, remote: 1 },
          lastUpdated: '2026-01-01T00:00:00.000Z',
          fetchedAt: '2026-01-01T00:00:00.000Z',
        },
        blockedWalletsLastFetched: 1000,
        lastCheckedAt: '2026-01-01T00:00:00.000Z',
      };

      await withController(
        { options: { state: givenState } },
        ({ controller, rootMessenger }) => {
          rootMessenger.call('ComplianceController:clearComplianceState');

          expect(controller.state).toStrictEqual({
            walletComplianceStatusMap: {},
            blockedWallets: null,
            blockedWalletsLastFetched: 0,
            lastCheckedAt: null,
          });
        },
      );
    });
  });

  describe('clearComplianceState', () => {
    it('does the same thing as the messenger action', async () => {
      const givenState = {
        walletComplianceStatusMap: {
          '0xABC': {
            address: '0xABC',
            blocked: true,
            checkedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        blockedWalletsLastFetched: 1000,
        lastCheckedAt: '2026-01-01T00:00:00.000Z',
      };

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          controller.clearComplianceState();

          expect(controller.state).toStrictEqual({
            walletComplianceStatusMap: {},
            blockedWallets: null,
            blockedWalletsLastFetched: 0,
            lastCheckedAt: null,
          });
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`{}`);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          {
            "blockedWalletsLastFetched": 0,
            "lastCheckedAt": null,
          }
        `);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`
          {
            "blockedWallets": null,
            "blockedWalletsLastFetched": 0,
            "lastCheckedAt": null,
            "walletComplianceStatusMap": {},
          }
        `);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          {
            "walletComplianceStatusMap": {},
          }
        `);
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ComplianceControllerMessenger>,
  MessengerEvents<ComplianceControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: ComplianceController;
  rootMessenger: RootMessenger;
  messenger: ComplianceControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options bag that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof ComplianceController>[0]>;
};

/**
 * Constructs the messenger populated with all external actions and events
 * required by the controller under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
    captureException: jest.fn(),
  });
}

/**
 * Constructs the messenger for the controller under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The controller-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): ComplianceControllerMessenger {
  const messenger: ComplianceControllerMessenger = new Messenger({
    namespace: 'ComplianceController',
    parent: rootMessenger,
  });
  rootMessenger.delegate({
    actions: [
      'ComplianceService:checkWalletCompliance',
      'ComplianceService:checkWalletsCompliance',
      'ComplianceService:updateBlockedWallets',
    ],
    events: [],
    messenger,
  });
  return messenger;
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor. All constructor
 * arguments are optional and will be filled in with defaults as needed
 * (including `messenger`). The function is called with the new
 * controller, root messenger, and controller messenger.
 * @returns The same return value as the given function.
 */
async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();
  const messenger = getMessenger(rootMessenger);
  const controller = new ComplianceController({
    messenger,
    ...options,
  });
  return await testFunction({ controller, rootMessenger, messenger });
}
