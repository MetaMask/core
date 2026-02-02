import { deriveStateFromMetadata } from '@metamask/base-controller';
import type {
  JsonRpcEngineReturnHandler,
  JsonRpcEngineNextCallback,
} from '@metamask/json-rpc-engine';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import { PendingJsonRpcResponseStruct } from '@metamask/utils';
import type { PendingJsonRpcResponse, JsonRpcRequest } from '@metamask/utils';
import { nanoid } from 'nanoid';

import { constants, getters, noop } from './helpers';
import { LOG_LIMIT, LOG_METHOD_TYPES } from '../src/enums';
import { PermissionLogController } from '../src/PermissionLogController';
import type {
  Permission,
  PermissionLogControllerState,
  PermissionLogControllerMessenger,
} from '../src/PermissionLogController';

const { PERMS, RPC_REQUESTS } = getters;
const { ACCOUNTS, EXPECTED_HISTORIES, SUBJECTS, PERM_NAMES, REQUEST_IDS } =
  constants;

class CustomError extends Error {
  code: number;

  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

const name = 'PermissionLogController';

type AllPermissionLogControllerActions =
  MessengerActions<PermissionLogControllerMessenger>;

type AllPermissionLogControllerEvents =
  MessengerEvents<PermissionLogControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllPermissionLogControllerActions,
  AllPermissionLogControllerEvents
>;

/**
 * Creates and returns a root messenger for testing
 *
 * @returns A messenger instance
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

const initController = ({
  restrictedMethods,
  state,
}: {
  restrictedMethods: Set<string>;
  state?: Partial<PermissionLogControllerState>;
}): PermissionLogController => {
  const rootMessenger = getRootMessenger();
  const messenger = new Messenger<
    typeof name,
    AllPermissionLogControllerActions,
    AllPermissionLogControllerEvents,
    RootMessenger
  >({
    namespace: name,
    parent: rootMessenger,
  });
  return new PermissionLogController({
    messenger,
    restrictedMethods,
    state,
  });
};

const mockNext =
  (advanceTime: boolean): JsonRpcEngineNextCallback =>
  (handler) => {
    if (advanceTime) {
      jest.advanceTimersByTime(1);
    }
    handler?.(noop);
  };

const initClock = (): void => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(1));
};

const tearDownClock = (): void => {
  jest.useRealTimers();
};

const getSavedMockNext =
  (
    arr: (JsonRpcEngineReturnHandler | undefined)[],
    advanceTime: boolean,
  ): JsonRpcEngineNextCallback =>
  (handler) => {
    if (advanceTime) {
      jest.advanceTimersByTime(1);
    }
    arr.push(handler);
  };

describe('PermissionLogController', () => {
  describe('createMiddleware', () => {
    describe('restricted method activity log', () => {
      beforeEach(() => {
        initClock();
      });

      afterEach(() => {
        tearDownClock();
      });

      it('records activity for a successful restricted method request', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });

        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        let request = RPC_REQUESTS.eth_accounts(SUBJECTS.a.origin);
        const expectedResponse: PendingJsonRpcResponse<string[]> = {
          id: request.id,
          jsonrpc: '2.0',
          result: ACCOUNTS.a.permitted,
        };

        logMiddleware(request, expectedResponse, mockNext(false), noop);

        expect(
          permissionLogController.state.permissionActivityLog,
        ).toHaveLength(1);
        expect(
          permissionLogController.state.permissionActivityLog,
        ).toStrictEqual([
          {
            id: REQUEST_IDS.a,
            method: 'eth_accounts',
            origin: SUBJECTS.a.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            requestTime: 1,
            responseTime: 1,
            success: true,
          },
        ]);

        // test response with empty accounts
        request = RPC_REQUESTS.eth_accounts(SUBJECTS.a.origin);
        expectedResponse.result = [];
        expectedResponse.id = request.id;

        logMiddleware(request, expectedResponse, mockNext(true), noop);

        expect(
          permissionLogController.state.permissionActivityLog,
        ).toHaveLength(2);
      });

      it('records activity for a failed restricted method request', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        const request = RPC_REQUESTS.eth_accounts(SUBJECTS.a.origin);
        const expectedResponse: PendingJsonRpcResponse<string[]> = {
          id: request.id,
          jsonrpc: '2.0',
          error: new CustomError('test error', 1),
        };

        logMiddleware(request, expectedResponse, mockNext(false), noop);

        expect(
          permissionLogController.state.permissionActivityLog,
        ).toHaveLength(1);
        expect(
          permissionLogController.state.permissionActivityLog,
        ).toStrictEqual([
          {
            id: REQUEST_IDS.a,
            method: 'eth_accounts',
            origin: SUBJECTS.a.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            requestTime: 1,
            responseTime: 1,
            success: false,
          },
        ]);
      });

      it('records activity for eth_requestAccounts', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        const request = RPC_REQUESTS.eth_requestAccounts(SUBJECTS.a.origin);
        const expectedResponse: PendingJsonRpcResponse<string[]> = {
          id: request.id,
          jsonrpc: '2.0',
          result: ACCOUNTS.a.permitted,
        };

        logMiddleware(request, expectedResponse, mockNext(false), noop);

        expect(
          permissionLogController.state.permissionActivityLog,
        ).toHaveLength(1);
        expect(
          permissionLogController.state.permissionActivityLog,
        ).toStrictEqual([
          {
            id: REQUEST_IDS.a,
            method: 'eth_requestAccounts',
            origin: SUBJECTS.a.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            requestTime: 1,
            responseTime: 1,
            success: true,
          },
        ]);
      });

      it('records activity for wallet_requestPermissions', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        const request = RPC_REQUESTS.wallet_requestPermissions(
          SUBJECTS.a.origin,
        );
        const expectedResponse: PendingJsonRpcResponse<Permission[]> = {
          id: request.id,
          jsonrpc: '2.0',
          result: [PERMS.finalizedEthAccounts(ACCOUNTS.a.permitted)],
        };

        logMiddleware(request, expectedResponse, mockNext(false), noop);

        expect(
          permissionLogController.state.permissionActivityLog,
        ).toHaveLength(1);
        expect(
          permissionLogController.state.permissionActivityLog,
        ).toStrictEqual([
          {
            id: REQUEST_IDS.a,
            method: 'wallet_requestPermissions',
            origin: SUBJECTS.a.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            requestTime: 1,
            responseTime: 1,
            success: true,
          },
        ]);
      });

      it('ignores unrestricted methods', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        const request = RPC_REQUESTS.net_version(SUBJECTS.a.origin);
        const expectedResponse: PendingJsonRpcResponse<string> = {
          id: request.id,
          jsonrpc: '2.0',
          result: '1',
        };

        logMiddleware(request, expectedResponse, mockNext(false), noop);

        expect(
          permissionLogController.state.permissionActivityLog,
        ).toHaveLength(0);
      });

      it('handles internal methods correctly', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set([
            'eth_accounts',
            'eth_requestAccounts',
            'wallet_requestPermissions',
          ]),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        const request: JsonRpcRequest = {
          id: nanoid(),
          jsonrpc: '2.0',
          method: 'metamask_getProviderState',
        };
        const expectedResponse: PendingJsonRpcResponse<
          Record<string, unknown>
        > = {
          id: request.id,
          jsonrpc: '2.0',
          result: {},
        };

        logMiddleware(request, expectedResponse, mockNext(false), noop);

        expect(
          permissionLogController.state.permissionActivityLog,
        ).toHaveLength(0);
      });

      it('enforces log limit', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        // add LOG_LIMIT + 1 entries
        for (let i = 0; i < LOG_LIMIT + 1; i++) {
          const request = RPC_REQUESTS.eth_accounts(SUBJECTS.a.origin);
          const expectedResponse: PendingJsonRpcResponse<string[]> = {
            id: request.id,
            jsonrpc: '2.0',
            result: ACCOUNTS.a.permitted,
          };

          logMiddleware(request, expectedResponse, mockNext(false), noop);
        }

        expect(
          permissionLogController.state.permissionActivityLog,
        ).toHaveLength(LOG_LIMIT);
      });
    });

    describe('permission history log', () => {
      beforeEach(() => {
        initClock();
      });

      afterEach(() => {
        tearDownClock();
      });

      it('adds expected history entry when eth_accounts return accounts', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        const request = RPC_REQUESTS.eth_accounts(SUBJECTS.a.origin);
        const expectedResponse: PendingJsonRpcResponse<string[]> = {
          id: request.id,
          jsonrpc: '2.0',
          result: ACCOUNTS.a.permitted,
        };

        logMiddleware(request, expectedResponse, mockNext(false), noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );
      });

      it('creates eth_accounts entry when eth_requestAccounts is called', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        const request = RPC_REQUESTS.eth_requestAccounts(SUBJECTS.a.origin);
        const expectedResponse: PendingJsonRpcResponse<string[]> = {
          id: request.id,
          jsonrpc: '2.0',
          result: ACCOUNTS.a.permitted,
        };

        logMiddleware(request, expectedResponse, mockNext(false), noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );
      });

      it('does not update history if eth_accounts return empty', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        const request = RPC_REQUESTS.eth_accounts(SUBJECTS.a.origin);
        const expectedResponse: PendingJsonRpcResponse<string[]> = {
          id: request.id,
          jsonrpc: '2.0',
          result: [],
        };

        logMiddleware(request, expectedResponse, mockNext(false), noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          {},
        );
      });

      it('updates history if wallet_requestPermissions returns permissions', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        const request = RPC_REQUESTS.wallet_requestPermissions(
          SUBJECTS.a.origin,
        );
        const expectedResponse: PendingJsonRpcResponse<Permission[]> = {
          id: request.id,
          jsonrpc: '2.0',
          result: [PERMS.finalizedEthAccounts(ACCOUNTS.a.permitted)],
        };

        logMiddleware(request, expectedResponse, mockNext(false), noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );
      });

      it('handles multiple origins correctly', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware: logMiddlewareA } =
          permissionLogController.createMiddleware({
            origin: SUBJECTS.a.origin,
          });
        const { logMiddleware: logMiddlewareB } =
          permissionLogController.createMiddleware({
            origin: SUBJECTS.b.origin,
          });

        // subject a requests
        let request = RPC_REQUESTS.eth_accounts(SUBJECTS.a.origin);
        let expectedResponse: PendingJsonRpcResponse<string[]> = {
          id: request.id,
          jsonrpc: '2.0',
          result: ACCOUNTS.a.permitted,
        };

        logMiddlewareA(request, expectedResponse, mockNext(false), noop);

        // subject b requests
        request = RPC_REQUESTS.eth_accounts(SUBJECTS.b.origin);
        expectedResponse = {
          id: request.id,
          jsonrpc: '2.0',
          result: ACCOUNTS.b.permitted,
        };

        logMiddlewareB(request, expectedResponse, mockNext(true), noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case2[0],
        );
      });

      it('updates history if accounts changed', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        const request1 = RPC_REQUESTS.eth_accounts(SUBJECTS.a.origin);
        const expectedResponse1: PendingJsonRpcResponse<string[]> = {
          id: request1.id,
          jsonrpc: '2.0',
          result: ACCOUNTS.a.permitted,
        };

        logMiddleware(request1, expectedResponse1, mockNext(false), noop);

        const request2 = RPC_REQUESTS.eth_accounts(SUBJECTS.a.origin);
        const expectedResponse2: PendingJsonRpcResponse<string[]> = {
          id: request2.id,
          jsonrpc: '2.0',
          result: ACCOUNTS.b.permitted,
        };

        logMiddleware(request2, expectedResponse2, mockNext(true), noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case3[0],
        );
      });

      it('does not update history if result is not an array', () => {
        const permissionLogController = initController({
          restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        });
        const { logMiddleware } = permissionLogController.createMiddleware({
          origin: SUBJECTS.a.origin,
        });

        const request = RPC_REQUESTS.eth_accounts(SUBJECTS.a.origin);
        const expectedResponse: PendingJsonRpcResponse<null> = {
          id: request.id,
          jsonrpc: '2.0',
          result: null,
        };

        logMiddleware(
          request,
          expectedResponse as unknown as PendingJsonRpcResponse<string[]>,
          mockNext(false),
          noop,
        );

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          {},
        );
      });
    });
  });

  describe('updateAccountsHistory', () => {
    beforeEach(() => {
      initClock();
    });

    afterEach(() => {
      tearDownClock();
    });

    it('updates history if origin and accounts are provided', () => {
      const permissionLogController = initController({
        restrictedMethods: new Set(PERM_NAMES.eth_accounts),
      });

      permissionLogController.updateAccountsHistory(
        SUBJECTS.a.origin,
        ACCOUNTS.a.permitted,
      );

      expect(permissionLogController.state.permissionHistory).toStrictEqual(
        EXPECTED_HISTORIES.case1[0],
      );
    });

    it('does not update history if accounts is empty', () => {
      const permissionLogController = initController({
        restrictedMethods: new Set(PERM_NAMES.eth_accounts),
      });

      permissionLogController.updateAccountsHistory(SUBJECTS.a.origin, []);

      expect(permissionLogController.state.permissionHistory).toStrictEqual({});
    });

    it('updates existing history entry', () => {
      const permissionLogController = initController({
        restrictedMethods: new Set(PERM_NAMES.eth_accounts),
        state: { permissionHistory: EXPECTED_HISTORIES.case1[0] },
      });

      jest.advanceTimersByTime(1);

      permissionLogController.updateAccountsHistory(
        SUBJECTS.a.origin,
        ACCOUNTS.b.permitted,
      );

      expect(permissionLogController.state.permissionHistory).toStrictEqual(
        EXPECTED_HISTORIES.case3[0],
      );
    });
  });

  describe('state derivation', () => {
    it('derives state from metadata correctly', () => {
      const permissionLogController = initController({
        restrictedMethods: new Set(PERM_NAMES.eth_accounts),
      });

      const derivedState = deriveStateFromMetadata(
        permissionLogController.state,
        permissionLogController.metadata,
      );

      expect(derivedState.permissionHistory).toStrictEqual(
        permissionLogController.state.permissionHistory,
      );
      expect(derivedState.permissionActivityLog).toStrictEqual(
        permissionLogController.state.permissionActivityLog,
      );
    });
  });

  describe('createRpcMethodMiddleware', () => {
    beforeEach(() => {
      initClock();
    });

    afterEach(() => {
      tearDownClock();
    });

    it('calls handler when middleware processes request', () => {
      const permissionLogController = initController({
        restrictedMethods: new Set(PERM_NAMES.eth_accounts),
      });
      const handlers: (JsonRpcEngineReturnHandler | undefined)[] = [];
      const { logMiddleware } = permissionLogController.createMiddleware({
        origin: SUBJECTS.a.origin,
      });

      const request = RPC_REQUESTS.eth_accounts(SUBJECTS.a.origin);
      const expectedResponse: PendingJsonRpcResponse<string[]> = {
        id: request.id,
        jsonrpc: '2.0',
        result: ACCOUNTS.a.permitted,
      };

      logMiddleware(
        request,
        expectedResponse,
        getSavedMockNext(handlers, false),
        noop,
      );

      expect(handlers).toHaveLength(1);
      expect(PendingJsonRpcResponseStruct.is(expectedResponse)).toBe(true);
    });
  });
});
