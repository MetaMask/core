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
  type PermissionHistory,
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

const initController = (
  permissionHistory?: PermissionHistory,
): PermissionLogController => {
  return new PermissionLogController({
    messenger: new ControllerMessenger().getRestricted<
      typeof name,
      never,
      never
    >({
      name,
    }),
    restrictedMethods: RESTRICTED_METHODS,
    state: {
      permissionHistory: permissionHistory || {},
    },
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
  expect(entry).toMatchObject({
    id: req.id,
    method: req.method,
    origin: req.origin,
    methodType,
    success: res ? success : null,
    requestTime: expect.any(Number),
    responseTime: res ? expect.any(Number) : null,
  });

  if (res) {
    expect(entry.requestTime).toBeLessThanOrEqual(entry.responseTime as number);
  }
}

describe('PermissionLogController', () => {
  describe('createMiddleware', () => {
    describe('restricted method activity log', () => {
      describe('recording Activity for restricted methods', () => {
        it('records activity for a successful restricted method request', () => {
          const controller = initController();
          const logMiddleware = initMiddleware(controller);
          const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
          const res = {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: ['bar'],
          };

          logMiddleware(req, res, mockNext, noop);

          expect(controller.state.permissionActivityLog).toHaveLength(1);
          const entry = controller.state.permissionActivityLog[0];
          validateActivityEntry(
            entry,
            req,
            res,
            LOG_METHOD_TYPES.restricted,
            true,
          );
        });

        it('records activity for a failed restricted method request', () => {
          const controller = initController();
          const logMiddleware = initMiddleware(controller);
          const req = RPC_REQUESTS.eth_accounts(SUBJECTS.b.origin);
          const res: PendingJsonRpcResponse<Json> = {
            id: REQUEST_IDS.a,
            jsonrpc: '2.0',
            error: new CustomError('Unauthorized.', 1),
          };

          logMiddleware(req, res, mockNext, noop);

          expect(controller.state.permissionActivityLog).toHaveLength(1);
          const entry = controller.state.permissionActivityLog[0];
          validateActivityEntry(
            entry,
            req,
            res,
            LOG_METHOD_TYPES.restricted,
            false,
          );
        });

        it('records activity for a restricted method request with successful eth_requestAccounts', () => {
          const controller = initController();
          const logMiddleware = initMiddleware(controller);
          const req = RPC_REQUESTS.eth_requestAccounts(SUBJECTS.c.origin);
          const res = {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: ACCOUNTS.c.permitted,
          };

          logMiddleware(req, res, mockNext, noop);

          expect(controller.state.permissionActivityLog).toHaveLength(1);
          const entry = controller.state.permissionActivityLog[0];
          validateActivityEntry(
            entry,
            req,
            res,
            LOG_METHOD_TYPES.restricted,
            true,
          );
        });

        it('handles a restricted method request without a response', () => {
          const controller = initController();
          const logMiddleware = initMiddleware(controller);
          const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
          // Simulating a scenario where no response is received
          // @ts-expect-error We are intentionally passing bad input.
          const res: PendingJsonRpcResponse<Json> = null;

          logMiddleware(req, res, mockNext, noop);

          expect(controller.state.permissionActivityLog).toHaveLength(1);
          const entry = controller.state.permissionActivityLog[0];
          // Since there's no response, success is marked as false to indicate an unresolved request
          validateActivityEntry(
            entry,
            req,
            null,
            LOG_METHOD_TYPES.restricted,
            false,
          );
        });

        it('ensures that "request" and "response" properties are not present in log entries', () => {
          const controller = initController();
          const logMiddleware = initMiddleware(controller);
          const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
          const res = {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: ['bar'],
          };

          logMiddleware(req, res, mockNext, noop);

          controller.state.permissionActivityLog.forEach((entry) => {
            expect(entry).not.toHaveProperty('request');
            expect(entry).not.toHaveProperty('response');
          });
        });
      });

      it('handles responses added out of order', () => {
        const controller = initController();
        const logMiddleware = initMiddleware(controller);
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
        const controller = initController();
        const logMiddleware = initMiddleware(controller);
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

      it('ignores activity for expected methods', () => {
        const controller = initController();
        const logMiddleware = initMiddleware(controller);
        expect(controller.state.permissionActivityLog).toHaveLength(0);

        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: ['bar'],
        };

        const ignoredMethods = [
          RPC_REQUESTS.metamask_sendDomainMetadata(SUBJECTS.c.origin, 'foobar'),
          RPC_REQUESTS.custom(SUBJECTS.b.origin, 'eth_getBlockNumber'),
          RPC_REQUESTS.custom(SUBJECTS.b.origin, 'net_version'),
        ];

        ignoredMethods.forEach((req) => {
          logMiddleware(req, res, mockNext, noop);
        });

        expect(controller.state.permissionActivityLog).toHaveLength(0);
      });

      describe('log limit enforcement', () => {
        it('fills up the log to its limit without exceeding', () => {
          const controller = initController();
          const logMiddleware = initMiddleware(controller);
          const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
          const res = { ...PendingJsonRpcResponseStruct.TYPE, result: ['bar'] };

          for (let i = 0; i < LOG_LIMIT; i++) {
            logMiddleware({ ...req, id: nanoid() }, res, mockNext, noop);
          }

          expect(controller.state.permissionActivityLog).toHaveLength(
            LOG_LIMIT,
          );
        });

        it('removes the oldest log entry when a new one is added after reaching the limit', () => {
          const controller = initController();
          const logMiddleware = initMiddleware(controller);
          const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
          const res = { ...PendingJsonRpcResponseStruct.TYPE, result: ['bar'] };

          // Initially fill the log to its limit
          for (let i = 0; i < LOG_LIMIT; i++) {
            logMiddleware({ ...req, id: nanoid() }, res, mockNext, noop);
          }

          // Record the ID of the first log entry after filling the log
          const firstLogIdAfterFilling =
            controller.state.permissionActivityLog[0].id;

          // Add one more entry to exceed the limit
          const newLogId = nanoid();
          logMiddleware({ ...req, id: newLogId }, res, mockNext, noop);

          // Expect the log to still have the same length as the limit
          expect(controller.state.permissionActivityLog).toHaveLength(
            LOG_LIMIT,
          );
          // Ensure the first log entry after filling is no longer present
          expect(controller.state.permissionActivityLog[0].id).not.toBe(
            firstLogIdAfterFilling,
          );
          // Check that the new log entry is present
          expect(
            controller.state.permissionActivityLog.find(
              (log) => log.id === newLogId,
            ),
          ).toBeDefined();
        });

        it('ensures the log does not exceed the limit when adding multiple entries', () => {
          const controller = initController();
          const logMiddleware = initMiddleware(controller);
          const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
          const res = { ...PendingJsonRpcResponseStruct.TYPE, result: ['bar'] };

          // Attempt to add more entries than the log limit
          for (let i = 0; i < LOG_LIMIT + 5; i++) {
            logMiddleware({ ...req, id: nanoid() }, res, mockNext, noop);
          }

          // The log should not exceed the limit
          expect(controller.state.permissionActivityLog).toHaveLength(
            LOG_LIMIT,
          );
        });
      });
    });

    describe('permission history log', () => {
      beforeEach(() => {
        initClock();
      });

      afterEach(() => {
        tearDownClock();
      });

      it('only updates history on responses', () => {
        const controller = initController();
        const logMiddleware = initMiddleware(controller);
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

        expect(controller.state.permissionHistory).toStrictEqual({});

        // response => records granted permissions
        logMiddleware(req, res, mockNext, noop);

        const { permissionHistory } = controller.state;
        expect(Object.keys(permissionHistory)).toHaveLength(1);
        expect(permissionHistory[SUBJECTS.a.origin]).toBeDefined();
      });

      it('ignores malformed permissions requests', () => {
        const controller = initController();
        const logMiddleware = initMiddleware(controller);
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

        expect(controller.state.permissionHistory).toStrictEqual({});
      });

      it('records and updates account history as expected', async () => {
        const controller = initController();
        const logMiddleware = initMiddleware(controller);
        const req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.eth_accounts,
        );
        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
        };

        logMiddleware(req, res, mockNext, noop);

        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );

        // mock permission requested again, with another approved account
        jest.advanceTimersByTime(1);
        res.result = [PERMS.granted.eth_accounts([ACCOUNTS.a.permitted[0]])];

        logMiddleware(req, res, mockNext, noop);

        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[1],
        );
      });

      it('handles eth_accounts response without caveats', async () => {
        const controller = initController();
        const logMiddleware = initMiddleware(controller);
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

        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case2[0],
        );
      });

      it('handles extra caveats for eth_accounts', async () => {
        const controller = initController();
        const logMiddleware = initMiddleware(controller);
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

        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );
      });

      // wallet_requestPermissions returns all permissions approved for the
      // requesting origin, including old ones
      it('handles unrequested permissions on the response', async () => {
        const controller = initController();
        const logMiddleware = initMiddleware(controller);
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

        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );
      });

      it('does not update history if no new permissions are approved', async () => {
        const controller = initController();
        const logMiddleware = initMiddleware(controller);
        let req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.test_method,
        );
        let res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.test_method()],
        };

        logMiddleware(req, res, mockNext, noop);

        expect(controller.state.permissionHistory).toStrictEqual(
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
        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case4[0],
        );
      });

      it('records and updates history for multiple origins, regardless of response order', async () => {
        const controller = initController();
        const logMiddleware = initMiddleware(controller);

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

        expect(controller.state.permissionHistory).toStrictEqual(
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

        expect(controller.state.permissionHistory).toStrictEqual(
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
      const controller = initController();

      controller.updateAccountsHistory('foo.com', []);

      expect(controller.state.permissionHistory).toStrictEqual({});
    });

    it('updates the account history', () => {
      const controller = initController({
        'foo.com': {
          [PERM_NAMES.eth_accounts]: {
            accounts: {
              '0x1': 1,
            },
            lastApproved: 1,
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
