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
            "lastCheckedAt": null,
            "walletComplianceStatusMap": {},
          }
        `);
      });
    });
  });

  describe('selectIsWalletBlocked', () => {
    it('returns true if the wallet was checked and found blocked', async () => {
      await withController(
        {
          options: {
            state: {
              walletComplianceStatusMap: {
                '0xBLOCKED': {
                  address: '0xBLOCKED',
                  blocked: true,
                  checkedAt: '2026-01-01T00:00:00.000Z',
                },
              },
            },
          },
        },
        ({ controller }) => {
          expect(selectIsWalletBlocked('0xBLOCKED')(controller.state)).toBe(
            true,
          );
        },
      );
    });

    it('returns false if the wallet is not in the status map', async () => {
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

    it('returns the cached result if the API call fails and a cached entry exists', async () => {
      const cached = {
        address: '0xABC123',
        blocked: true,
        checkedAt: '2026-01-01T00:00:00.000Z',
      };

      await withController(
        {
          options: {
            state: { walletComplianceStatusMap: { '0xABC123': cached } },
          },
        },
        async ({ rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'ComplianceService:checkWalletCompliance',
            async () => {
              throw new Error('API unavailable');
            },
          );

          const result = await rootMessenger.call(
            'ComplianceController:checkWalletCompliance',
            '0xABC123',
          );

          expect(result).toStrictEqual(cached);
        },
      );
    });

    it('re-throws the error if the API call fails and no cached entry exists', async () => {
      await withController(async ({ rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'ComplianceService:checkWalletCompliance',
          async () => {
            throw new Error('API unavailable');
          },
        );

        await expect(
          rootMessenger.call(
            'ComplianceController:checkWalletCompliance',
            '0xNEW',
          ),
        ).rejects.toThrow('API unavailable');
      });
    });
  });

  describe('checkWalletCompliance', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-01'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does the same thing as the messenger action', async () => {
      await withController(async ({ controller, rootMessenger }) => {
        rootMessenger.registerActionHandler(
          'ComplianceService:checkWalletCompliance',
          async (address) => ({
            address,
            blocked: false,
          }),
        );

        const result = await controller.checkWalletCompliance('0xABC123');

        expect(result).toStrictEqual({
          address: '0xABC123',
          blocked: false,
          checkedAt: '2026-02-01T00:00:00.000Z',
        });
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

    it('returns cached results for all addresses if the API call fails and all are cached', async () => {
      const cachedSafe = {
        address: '0xSAFE',
        blocked: false,
        checkedAt: '2026-01-01T00:00:00.000Z',
      };
      const cachedBlocked = {
        address: '0xBLOCKED',
        blocked: true,
        checkedAt: '2026-01-01T00:00:00.000Z',
      };

      await withController(
        {
          options: {
            state: {
              walletComplianceStatusMap: {
                '0xSAFE': cachedSafe,
                '0xBLOCKED': cachedBlocked,
              },
            },
          },
        },
        async ({ rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'ComplianceService:checkWalletsCompliance',
            async () => {
              throw new Error('API unavailable');
            },
          );

          const result = await rootMessenger.call(
            'ComplianceController:checkWalletsCompliance',
            ['0xSAFE', '0xBLOCKED'],
          );

          expect(result).toStrictEqual([cachedSafe, cachedBlocked]);
        },
      );
    });

    it('re-throws the error if the API call fails and any address has no cached entry', async () => {
      const cached = {
        address: '0xSAFE',
        blocked: false,
        checkedAt: '2026-01-01T00:00:00.000Z',
      };

      await withController(
        {
          options: {
            state: {
              walletComplianceStatusMap: { '0xSAFE': cached },
            },
          },
        },
        async ({ rootMessenger }) => {
          rootMessenger.registerActionHandler(
            'ComplianceService:checkWalletsCompliance',
            async () => {
              throw new Error('API unavailable');
            },
          );

          await expect(
            rootMessenger.call('ComplianceController:checkWalletsCompliance', [
              '0xSAFE',
              '0xNEW',
            ]),
          ).rejects.toThrow('API unavailable');
        },
      );
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
        lastCheckedAt: '2026-01-01T00:00:00.000Z',
      };

      await withController(
        { options: { state: givenState } },
        ({ controller, rootMessenger }) => {
          rootMessenger.call('ComplianceController:clearComplianceState');

          expect(controller.state).toStrictEqual({
            walletComplianceStatusMap: {},
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
        lastCheckedAt: '2026-01-01T00:00:00.000Z',
      };

      await withController(
        { options: { state: givenState } },
        ({ controller }) => {
          controller.clearComplianceState();

          expect(controller.state).toStrictEqual({
            walletComplianceStatusMap: {},
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
