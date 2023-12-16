import { ControllerMessenger } from '@metamask/base-controller';
import type {
  JsonRpcEngineReturnHandler,
  JsonRpcEngineNextCallback,
  JsonRpcMiddleware,
} from '@metamask/json-rpc-engine';
import {
  type PendingJsonRpcResponse,
  type JsonRpcParams,
  type Json,
  type JsonRpcRequest,
  PendingJsonRpcResponseStruct,
} from '@metamask/utils';
import { nanoid } from 'nanoid';

import { LOG_LIMIT, LOG_METHOD_TYPES } from '../src/enums';
import {
  type Permission,
  type JsonRpcRequestWithOrigin,
  type PermissionActivityLog,
  PermissionLogController,
} from '../src/PermissionLogController';
import { constants, getters, noop } from './helpers';

const { PERMS, RPC_REQUESTS } = getters;
const {
  ACCOUNTS,
  EXPECTED_HISTORIES,
  SUBJECTS,
  PERM_NAMES,
  REQUEST_IDS,
  RESTRICTED_METHODS,
} = constants;

class CustomError extends Error {
  code: number;

  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

const name = 'PermissionLogController';

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
function getMessenger() {
  return new ControllerMessenger().getRestricted<typeof name, never, never>({
    name,
  });
}

const initPermissionLogController = (state = {}): PermissionLogController => {
  const messenger = getMessenger();
  return new PermissionLogController({
    messenger,
    restrictedMethods: RESTRICTED_METHODS,
    state,
  });
};

const mockNext: JsonRpcEngineNextCallback = (handler) => {
  if (handler) {
    handler(noop);
  }
};

const initMiddleware = (
  controller: PermissionLogController,
): JsonRpcMiddleware<JsonRpcParams, Json> => {
  const middleware = controller.createMiddleware();
  return (req, res, next, end) => {
    middleware(req, res, next, end);
  };
};

const initClock = () => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date(1));
};

const tearDownClock = () => {
  jest.useRealTimers();
};

const getSavedMockNext =
  (
    arr: (JsonRpcEngineReturnHandler | undefined)[],
  ): JsonRpcEngineNextCallback =>
  (handler) => {
    arr.push(handler);
  };

/**
 * Validates an activity log entry with respect to a request, response, and
 * relevant metadata.
 *
 * @param entry - The activity log entry to validate.
 * @param req - The request that generated the entry.
 * @param res - The response for the request, if any.
 * @param methodType - The method log controller method type of the request.
 * @param success - Whether the request succeeded or not.
 */
function validateActivityEntry(
  entry: PermissionActivityLog,
  req: JsonRpcRequestWithOrigin,
  res: PendingJsonRpcResponse<Json> | null,
  methodType: LOG_METHOD_TYPES,
  success: boolean,
) {
  expect(entry).toBeDefined();

  expect(entry.id).toStrictEqual(req.id);
  expect(entry.method).toStrictEqual(req.method);
  expect(entry.origin).toStrictEqual(req.origin);
  expect(entry.methodType).toStrictEqual(methodType);

  expect(Number.isInteger(entry.requestTime)).toBe(true);
  if (res) {
    expect(Number.isInteger(entry.responseTime)).toBe(true);
    expect(entry.requestTime <= (entry.responseTime as number)).toBe(true);
    expect(entry.success).toStrictEqual(success);
  } else {
    expect(entry.requestTime > 0).toBe(true);
    expect(entry).toMatchObject({
      responseTime: null,
      success: null,
    });
  }
}

describe('PermissionLogController', () => {
  describe('createMiddleware', () => {
    describe('restricted method activity log', () => {
      let controller: PermissionLogController;
      let logMiddleware: JsonRpcMiddleware<JsonRpcParams, Json>;

      beforeEach(() => {
        controller = initPermissionLogController();
        logMiddleware = initMiddleware(controller);
      });

      it('records activity for restricted methods', () => {
        let req: JsonRpcRequestWithOrigin, res: PendingJsonRpcResponse<Json>;

        // test_method, success
        req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
        req.id = REQUEST_IDS.a;
        res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: ['bar'],
        };

        logMiddleware(req, res, mockNext, noop);

        expect(controller.state.permissionActivityLog).toHaveLength(1);
        const entry1 = controller.state.permissionActivityLog[0];
        validateActivityEntry(
          entry1,
          req,
          res,
          LOG_METHOD_TYPES.restricted,
          true,
        );

        // eth_accounts, failure
        req = RPC_REQUESTS.eth_accounts(SUBJECTS.b.origin);
        req.id = REQUEST_IDS.b;
        res = {
          id: REQUEST_IDS.a,
          jsonrpc: '2.0',
          error: new CustomError('Unauthorized.', 1),
        };

        logMiddleware(req, res, mockNext, noop);

        expect(controller.state.permissionActivityLog).toHaveLength(2);
        const entry2 = controller.state.permissionActivityLog[1];
        validateActivityEntry(
          entry2,
          req,
          res,
          LOG_METHOD_TYPES.restricted,
          false,
        );

        // eth_requestAccounts, success
        req = RPC_REQUESTS.eth_requestAccounts(SUBJECTS.c.origin);
        req.id = REQUEST_IDS.c;
        res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: ACCOUNTS.c.permitted,
        };

        logMiddleware(req, res, mockNext, noop);

        expect(controller.state.permissionActivityLog).toHaveLength(3);
        const entry3 = controller.state.permissionActivityLog[2];
        validateActivityEntry(
          entry3,
          req,
          res,
          LOG_METHOD_TYPES.restricted,
          true,
        );

        // test_method, no response
        req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
        req.id = REQUEST_IDS.a;
        // @ts-expect-error We are intentionally passing bad input.
        res = null;

        logMiddleware(req, res, mockNext, noop);

        expect(controller.state.permissionActivityLog).toHaveLength(4);
        const entry4 = controller.state.permissionActivityLog[3];
        validateActivityEntry(
          entry4,
          { ...req },
          null,
          LOG_METHOD_TYPES.restricted,
          false,
        );

        // Validate final state
        expect(entry1).toStrictEqual(controller.state.permissionActivityLog[0]);
        expect(entry2).toStrictEqual(controller.state.permissionActivityLog[1]);
        expect(entry3).toStrictEqual(controller.state.permissionActivityLog[2]);
        expect(entry4).toStrictEqual(controller.state.permissionActivityLog[3]);

        // Regression test: ensure "response" and "request" properties
        // are not present
        controller.state.permissionActivityLog.forEach((entry) =>
          expect('request' in entry && 'response' in entry).toBe(false),
        );
      });

      it('handles responses added out of order', () => {
        const handlerArray: JsonRpcEngineReturnHandler[] = [];
        const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);

        // get make requests
        const id1 = nanoid();
        req.id = id1;
        const res1 = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [id1],
        };

        logMiddleware(
          {
            ...req,
          },
          {
            ...PendingJsonRpcResponseStruct.TYPE,
            ...res1,
          },
          getSavedMockNext(handlerArray),
          noop,
        );

        const id2 = nanoid();
        req.id = id2;
        const res2 = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [id2],
        };
        logMiddleware(req, res2, getSavedMockNext(handlerArray), noop);

        const id3 = nanoid();
        req.id = id3;
        const res3 = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [id3],
        };
        logMiddleware(req, res3, getSavedMockNext(handlerArray), noop);

        // verify log state
        expect(controller.state.permissionActivityLog).toHaveLength(3);
        const entry1 = controller.state.permissionActivityLog[0];
        const entry2 = controller.state.permissionActivityLog[1];
        const entry3 = controller.state.permissionActivityLog[2];

        // all entries should be in correct order
        expect(entry1).toMatchObject({ id: id1, responseTime: null });
        expect(entry2).toMatchObject({ id: id2, responseTime: null });
        expect(entry3).toMatchObject({ id: id3, responseTime: null });

        // call response handlers
        for (const i of [1, 2, 0]) {
          handlerArray[i](noop);
        }

        // verify log state again
        expect(controller.state.permissionActivityLog).toHaveLength(3);
        // verify all entries
        validateActivityEntry(
          controller.state.permissionActivityLog[0],
          { ...req, id: id1 },
          { ...res1 },
          LOG_METHOD_TYPES.restricted,
          true,
        );
        validateActivityEntry(
          controller.state.permissionActivityLog[1],
          { ...req, id: id2 },
          { ...res2 },
          LOG_METHOD_TYPES.restricted,
          true,
        );
        validateActivityEntry(
          controller.state.permissionActivityLog[2],
          { ...req, id: id3 },
          { ...res3 },
          LOG_METHOD_TYPES.restricted,
          true,
        );
      });

      it('handles a lack of response', () => {
        let req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
        req.id = REQUEST_IDS.a;
        let res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: ['bar'],
        };

        // noop for next handler prevents recording of response
        logMiddleware(req, res, noop, noop);

        expect(controller.state.permissionActivityLog).toHaveLength(1);
        const entry1 = controller.state.permissionActivityLog[0];
        validateActivityEntry(
          entry1,
          req,
          null,
          LOG_METHOD_TYPES.restricted,
          true,
        );

        // next request should be handled as normal
        req = RPC_REQUESTS.eth_accounts(SUBJECTS.b.origin);
        req.id = REQUEST_IDS.b;
        res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: ACCOUNTS.b.permitted,
        };

        logMiddleware(req, res, mockNext, noop);

        expect(controller.state.permissionActivityLog).toHaveLength(2);
        const entry2 = controller.state.permissionActivityLog[1];
        validateActivityEntry(
          entry2,
          req,
          res,
          LOG_METHOD_TYPES.restricted,
          true,
        );
        // validate final state
        expect(entry1).toStrictEqual(controller.state.permissionActivityLog[0]);
        expect(entry2).toStrictEqual(controller.state.permissionActivityLog[1]);
      });

      it('ignores expected methods', () => {
        expect(controller.state.permissionActivityLog).toHaveLength(0);

        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: ['bar'],
        };

        logMiddleware(
          RPC_REQUESTS.metamask_sendDomainMetadata(SUBJECTS.c.origin, 'foobar'),
          res,
          mockNext,
          noop,
        );
        logMiddleware(
          RPC_REQUESTS.custom(SUBJECTS.b.origin, 'eth_getBlockNumber'),
          res,
          mockNext,
          noop,
        );
        logMiddleware(
          RPC_REQUESTS.custom(SUBJECTS.b.origin, 'net_version'),
          res,
          mockNext,
          noop,
        );

        expect(controller.state.permissionActivityLog).toHaveLength(0);
      });

      it('enforces log limit', () => {
        const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: ['bar'],
        };

        // max out log
        let lastId;
        for (let i = 0; i < LOG_LIMIT; i++) {
          lastId = nanoid();
          logMiddleware({ ...req, id: lastId }, res, mockNext, noop);
        }

        // check last entry valid
        expect(controller.state.permissionActivityLog).toHaveLength(LOG_LIMIT);

        validateActivityEntry(
          controller.state.permissionActivityLog[LOG_LIMIT - 1],
          { ...req, id: lastId ?? null },
          res,
          LOG_METHOD_TYPES.restricted,
          true,
        );

        // store the id of the current second entry
        const nextFirstId = controller.state.permissionActivityLog[1].id;
        // add one more entry to log, putting it over the limit
        lastId = nanoid();

        logMiddleware({ ...req, id: lastId }, res, mockNext, noop);

        // check log length
        expect(controller.state.permissionActivityLog).toHaveLength(LOG_LIMIT);

        // check first and last entries
        validateActivityEntry(
          controller.state.permissionActivityLog[0],
          { ...req, id: nextFirstId },
          res,
          LOG_METHOD_TYPES.restricted,
          true,
        );

        validateActivityEntry(
          controller.state.permissionActivityLog[LOG_LIMIT - 1],
          { ...req, id: lastId },
          res,
          LOG_METHOD_TYPES.restricted,
          true,
        );
      });
    });

    describe('permission history log', () => {
      let permissionLogController: PermissionLogController;
      let logMiddleware: JsonRpcMiddleware<JsonRpcParams, Json>;

      beforeEach(() => {
        permissionLogController = initPermissionLogController();
        logMiddleware = initMiddleware(permissionLogController);
        initClock();
      });

      afterEach(() => {
        tearDownClock();
      });

      it('only updates history on responses', () => {
        const req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.test_method,
        );
        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.test_method()],
        };

        // noop => no response
        logMiddleware(req, res, noop, noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          {},
        );

        // response => records granted permissions
        logMiddleware(req, res, mockNext, noop);

        const permHistory = permissionLogController.state.permissionHistory;
        expect(Object.keys(permHistory)).toHaveLength(1);
        expect(permHistory[SUBJECTS.a.origin]).toBeDefined();
      });

      it('ignores malformed permissions requests', () => {
        const req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.test_method,
        );
        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.test_method()],
        };

        // no params => no response
        logMiddleware(
          {
            ...req,
            params: undefined,
          },
          res,
          mockNext,
          noop,
        );

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          {},
        );
      });

      it('records and updates account history as expected', async () => {
        const req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.eth_accounts,
        );
        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
        };

        logMiddleware(req, res, mockNext, noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );

        // mock permission requested again, with another approved account
        jest.advanceTimersByTime(1);
        res.result = [PERMS.granted.eth_accounts([ACCOUNTS.a.permitted[0]])];

        logMiddleware(req, res, mockNext, noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[1],
        );
      });

      it('handles eth_accounts response without caveats', async () => {
        const req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.eth_accounts,
        );
        const res: PendingJsonRpcResponse<Permission[]> = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
        };
        delete res.result?.[0].caveats;

        logMiddleware(req, res, mockNext, noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case2[0],
        );
      });

      it('handles extra caveats for eth_accounts', async () => {
        const req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.eth_accounts,
        );
        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
        };
        // @ts-expect-error We are intentionally passing bad input.
        res.result[0].caveats.push({ foo: 'bar' });

        logMiddleware(req, res, mockNext, noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );
      });

      // wallet_requestPermissions returns all permissions approved for the
      // requesting origin, including old ones
      it('handles unrequested permissions on the response', async () => {
        const req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.eth_accounts,
        );
        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [
            PERMS.granted.eth_accounts(ACCOUNTS.a.permitted),
            PERMS.granted.test_method(),
          ],
        };

        logMiddleware(req, res, mockNext, noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );
      });

      it('does not update history if no new permissions are approved', async () => {
        let req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.test_method,
        );
        let res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.test_method()],
        };

        logMiddleware(req, res, mockNext, noop);

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case4[0],
        );

        // new permission requested, but not approved

        jest.advanceTimersByTime(1);

        req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.eth_accounts,
        );
        res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.test_method()],
        };

        logMiddleware(req, res, mockNext, noop);

        // history should be unmodified
        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case4[0],
        );
      });

      it('records and updates history for multiple origins, regardless of response order', async () => {
        // make first round of requests

        const round1: {
          req: JsonRpcRequest;
          res: PendingJsonRpcResponse<Permission[]>;
        }[] = [];
        const handlers1: JsonRpcEngineReturnHandler[] = [];

        // first origin
        round1.push({
          req: RPC_REQUESTS.requestPermission(
            SUBJECTS.a.origin,
            PERM_NAMES.test_method,
          ),
          res: {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: [PERMS.granted.test_method()],
          },
        });

        // second origin
        round1.push({
          req: RPC_REQUESTS.requestPermission(
            SUBJECTS.b.origin,
            PERM_NAMES.eth_accounts,
          ),
          res: {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: [PERMS.granted.eth_accounts(ACCOUNTS.b.permitted)],
          },
        });

        // third origin
        round1.push({
          req: RPC_REQUESTS.requestPermissions(SUBJECTS.c.origin, {
            [PERM_NAMES.test_method]: {},
            [PERM_NAMES.eth_accounts]: {},
          }),
          res: {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: [
              PERMS.granted.test_method(),
              PERMS.granted.eth_accounts(ACCOUNTS.c.permitted),
            ],
          },
        });

        // make requests and process responses out of order
        round1.forEach((x) => {
          logMiddleware(x.req, x.res, getSavedMockNext(handlers1), noop);
        });

        for (const i of [1, 2, 0]) {
          handlers1[i](noop);
        }

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case3[0],
        );

        // make next round of requests

        jest.advanceTimersByTime(1);

        const round2: {
          req: JsonRpcRequest;
          res: PendingJsonRpcResponse<Permission[]>;
        }[] = [];
        // we're just gonna process these in order

        // first origin
        round2.push({
          req: RPC_REQUESTS.requestPermission(
            SUBJECTS.a.origin,
            PERM_NAMES.test_method,
          ),
          res: {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: [PERMS.granted.test_method()],
          },
        });

        // nothing for second origin

        // third origin
        round2.push({
          req: RPC_REQUESTS.requestPermissions(SUBJECTS.c.origin, {
            [PERM_NAMES.eth_accounts]: {},
          }),
          res: {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: [PERMS.granted.eth_accounts(ACCOUNTS.b.permitted)],
          },
        });

        // make requests
        round2.forEach((x) => {
          logMiddleware(x.req, x.res, mockNext, noop);
        });

        expect(permissionLogController.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case3[1],
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

    it('does nothing if the list of accounts is empty', () => {
      const controller = initPermissionLogController();

      controller.updateAccountsHistory('foo.com', []);

      expect(controller.state.permissionHistory).toStrictEqual({});
    });

    it('updates the account history', () => {
      const controller = initPermissionLogController({
        permissionHistory: {
          'foo.com': {
            [PERM_NAMES.eth_accounts]: {
              accounts: {
                '0x1': 1,
              },
              lastApproved: 1,
            },
          },
        },
      });

      jest.advanceTimersByTime(1);
      controller.updateAccountsHistory('foo.com', ['0x1', '0x2']);

      expect(controller.state.permissionHistory).toStrictEqual({
        'foo.com': {
          [PERM_NAMES.eth_accounts]: {
            accounts: {
              '0x1': 2,
              '0x2': 2,
            },
            lastApproved: 1,
          },
        },
      });
    });
  });
});
