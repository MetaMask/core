import { ControllerMessenger } from '@metamask/base-controller';
import type {
  JsonRpcEngineReturnHandler,
  JsonRpcEngineNextCallback,
} from '@metamask/json-rpc-engine';
import {
  type PendingJsonRpcResponse,
  type Json,
  type JsonRpcRequest,
  PendingJsonRpcResponseStruct,
} from '@metamask/utils';
import { nanoid } from 'nanoid';

import { LOG_LIMIT, LOG_METHOD_TYPES } from '../src/enums';
import {
  type Permission,
  type PermissionLogControllerState,
  PermissionLogController,
} from '../src/PermissionLogController';
import { constants, getters, noop } from './helpers';

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

const initController = ({
  restrictedMethods,
  state,
}: {
  restrictedMethods: Set<string>;
  state?: Partial<PermissionLogControllerState>;
}): PermissionLogController => {
  const messenger = new ControllerMessenger().getRestricted({
    name,
    allowedActions: [],
    allowedEvents: [],
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

      afterAll(() => {
        tearDownClock();
      });

      it('records activity for a successful restricted method request', () => {
        const controller = initController({
          restrictedMethods: new Set(['test_method']),
        });
        const logMiddleware = controller.createMiddleware();
        const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: ['bar'],
        };

        logMiddleware(req, res, mockNext(true), noop);

        expect(controller.state.permissionActivityLog).toStrictEqual([
          {
            id: req.id,
            method: req.method,
            origin: req.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            success: true,
            requestTime: 1,
            responseTime: 2,
          },
        ]);
      });

      it('records activity for a failed restricted method request', () => {
        const controller = initController({
          restrictedMethods: new Set(['eth_accounts']),
        });
        const logMiddleware = controller.createMiddleware();
        const req = RPC_REQUESTS.eth_accounts(SUBJECTS.b.origin);
        const res: PendingJsonRpcResponse<Json> = {
          id: REQUEST_IDS.a,
          jsonrpc: '2.0',
          error: new CustomError('Unauthorized.', 1),
        };

        logMiddleware(req, res, mockNext(true), noop);

        expect(controller.state.permissionActivityLog).toStrictEqual([
          {
            id: req.id,
            method: req.method,
            origin: req.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            success: false,
            requestTime: 1,
            responseTime: 2,
          },
        ]);
      });

      it('records activity for a restricted method request with successful eth_requestAccounts', () => {
        const controller = initController({
          restrictedMethods: new Set([]),
        });
        const logMiddleware = controller.createMiddleware();
        const req = RPC_REQUESTS.eth_requestAccounts(SUBJECTS.c.origin);
        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: ACCOUNTS.c.permitted,
        };

        logMiddleware(req, res, mockNext(true), noop);

        expect(controller.state.permissionActivityLog).toStrictEqual([
          {
            id: req.id,
            method: req.method,
            origin: req.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            success: true,
            requestTime: 1,
            responseTime: 2,
          },
        ]);
      });

      it('handles a restricted method request without a response', () => {
        const controller = initController({
          restrictedMethods: new Set(['test_method']),
        });
        const logMiddleware = controller.createMiddleware();
        const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
        // @ts-expect-error We are intentionally passing bad input.
        const res: PendingJsonRpcResponse<Json> = null;

        logMiddleware(req, res, mockNext(true), noop);

        expect(controller.state.permissionActivityLog).toStrictEqual([
          {
            id: req.id,
            method: req.method,
            origin: req.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            success: null,
            requestTime: 1,
            responseTime: null,
          },
        ]);
      });

      it('ensures that "request" and "response" properties are not present in log entries', () => {
        const controller = initController({
          restrictedMethods: new Set([]),
        });
        const logMiddleware = controller.createMiddleware();
        const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: ['bar'],
        };

        logMiddleware(req, res, mockNext(false), noop);

        controller.state.permissionActivityLog.forEach((entry) => {
          expect(entry).not.toHaveProperty('request');
          expect(entry).not.toHaveProperty('response');
        });
      });

      it('handles responses added out of order', () => {
        const controller = initController({
          restrictedMethods: new Set(['test_method']),
        });
        const logMiddleware = controller.createMiddleware();
        const handlerArray: JsonRpcEngineReturnHandler[] = [];
        const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);

        // get make requests
        const id1 = nanoid();
        req.id = id1;
        const res1 = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [id1],
        };

        logMiddleware(req, res1, getSavedMockNext(handlerArray, true), noop);

        const id2 = nanoid();
        req.id = id2;
        const res2 = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [id2],
        };
        logMiddleware(req, res2, getSavedMockNext(handlerArray, true), noop);

        const id3 = nanoid();
        req.id = id3;
        const res3 = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [id3],
        };
        logMiddleware(req, res3, getSavedMockNext(handlerArray, true), noop);

        // all entries should be in correct order
        expect(controller.state.permissionActivityLog).toMatchObject([
          {
            id: id1,
            responseTime: null,
          },
          {
            id: id2,
            responseTime: null,
          },
          {
            id: id3,
            responseTime: null,
          },
        ]);

        for (const i of [1, 2, 0]) {
          handlerArray[i](noop);
        }

        expect(controller.state.permissionActivityLog).toStrictEqual([
          {
            id: id1,
            method: req.method,
            origin: req.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            success: true,
            requestTime: 1,
            responseTime: 4,
          },
          {
            id: id2,
            method: req.method,
            origin: req.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            success: true,
            requestTime: 2,
            responseTime: 4,
          },
          {
            id: id3,
            method: req.method,
            origin: req.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            success: true,
            requestTime: 3,
            responseTime: 4,
          },
        ]);
      });

      it('handles a lack of response', () => {
        const controller = initController({
          restrictedMethods: new Set(['test_method']),
        });
        const logMiddleware = controller.createMiddleware();
        const req1 = {
          ...RPC_REQUESTS.test_method(SUBJECTS.a.origin),
          id: REQUEST_IDS.a,
        };

        // noop for next handler prevents recording of response
        logMiddleware(
          req1,
          {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: ['bar'],
          },
          noop,
          noop,
        );

        expect(controller.state.permissionActivityLog).toStrictEqual([
          {
            id: req1.id,
            method: req1.method,
            origin: req1.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            success: null,
            requestTime: 1,
            responseTime: null,
          },
        ]);

        // next request should be handled as normal
        const req2 = {
          ...RPC_REQUESTS.test_method(SUBJECTS.b.origin),
          id: REQUEST_IDS.b,
        };

        logMiddleware(
          req2,
          {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: ACCOUNTS.b.permitted,
          },
          mockNext(true),
          noop,
        );

        expect(controller.state.permissionActivityLog).toStrictEqual([
          {
            id: req1.id,
            method: req1.method,
            origin: req1.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            success: null,
            requestTime: 1,
            responseTime: null,
          },
          {
            id: req2.id,
            method: req2.method,
            origin: req2.origin,
            methodType: LOG_METHOD_TYPES.restricted,
            success: true,
            requestTime: 1,
            responseTime: 2,
          },
        ]);
      });

      it('ignores activity for expected methods', () => {
        const controller = initController({
          restrictedMethods: new Set([]),
        });
        const logMiddleware = controller.createMiddleware();
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
          logMiddleware(req, res, mockNext(false), noop);
        });

        expect(controller.state.permissionActivityLog).toHaveLength(0);
      });

      it('fills up the log to its limit without exceeding', () => {
        const controller = initController({
          restrictedMethods: new Set(['test_method']),
        });
        const logMiddleware = controller.createMiddleware();
        const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
        const res = { ...PendingJsonRpcResponseStruct.TYPE, result: ['bar'] };

        for (let i = 0; i < LOG_LIMIT; i++) {
          logMiddleware({ ...req, id: nanoid() }, res, mockNext(false), noop);
        }

        expect(controller.state.permissionActivityLog).toHaveLength(LOG_LIMIT);
      });

      it('removes the oldest log entry when a new one is added after reaching the limit', () => {
        const controller = initController({
          restrictedMethods: new Set(['test_method']),
        });
        const logMiddleware = controller.createMiddleware();
        const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
        const res = { ...PendingJsonRpcResponseStruct.TYPE, result: ['bar'] };

        for (let i = 0; i < LOG_LIMIT; i++) {
          logMiddleware({ ...req, id: nanoid() }, res, mockNext(false), noop);
        }

        const firstLogIdAfterFilling =
          controller.state.permissionActivityLog[0].id;

        const newLogId = nanoid();
        logMiddleware({ ...req, id: newLogId }, res, mockNext(false), noop);

        expect(controller.state.permissionActivityLog).toHaveLength(LOG_LIMIT);
        expect(controller.state.permissionActivityLog[0].id).not.toBe(
          firstLogIdAfterFilling,
        );
        expect(
          controller.state.permissionActivityLog.find(
            (log) => log.id === newLogId,
          ),
        ).toBeDefined();
      });

      it('ensures the log does not exceed the limit when adding multiple entries', () => {
        const controller = initController({
          restrictedMethods: new Set(['test_method']),
        });
        const logMiddleware = controller.createMiddleware();
        const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
        const res = { ...PendingJsonRpcResponseStruct.TYPE, result: ['bar'] };

        for (let i = 0; i < LOG_LIMIT + 5; i++) {
          logMiddleware({ ...req, id: nanoid() }, res, mockNext(false), noop);
        }

        expect(controller.state.permissionActivityLog).toHaveLength(LOG_LIMIT);
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
        const controller = initController({
          restrictedMethods: new Set([]),
        });
        const logMiddleware = controller.createMiddleware();
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
        logMiddleware(req, res, mockNext(false), noop);

        const { permissionHistory } = controller.state;
        expect(Object.keys(permissionHistory)).toHaveLength(1);
        expect(permissionHistory[SUBJECTS.a.origin]).toBeDefined();
      });

      it('ignores malformed permissions requests', () => {
        const controller = initController({
          restrictedMethods: new Set([]),
        });
        const logMiddleware = controller.createMiddleware();
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
          mockNext(false),
          noop,
        );

        expect(controller.state.permissionHistory).toStrictEqual({});
      });

      it('records and updates account history as expected', async () => {
        const controller = initController({
          restrictedMethods: new Set([]),
        });
        const logMiddleware = controller.createMiddleware();
        const req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.eth_accounts,
        );
        const res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
        };

        logMiddleware(req, res, mockNext(false), noop);

        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );

        // mock permission requested again, with another approved account
        jest.advanceTimersByTime(1);
        res.result = [PERMS.granted.eth_accounts([ACCOUNTS.a.permitted[0]])];

        logMiddleware(req, res, mockNext(false), noop);

        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[1],
        );
      });

      it('handles eth_accounts response without caveats', async () => {
        const controller = initController({
          restrictedMethods: new Set([]),
        });
        const logMiddleware = controller.createMiddleware();
        const req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.eth_accounts,
        );
        const res: PendingJsonRpcResponse<Permission[]> = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.eth_accounts(ACCOUNTS.a.permitted)],
        };
        delete res.result?.[0].caveats;

        logMiddleware(req, res, mockNext(false), noop);

        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case2[0],
        );
      });

      it('handles extra caveats for eth_accounts', async () => {
        const controller = initController({
          restrictedMethods: new Set([]),
        });
        const logMiddleware = controller.createMiddleware();
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

        logMiddleware(req, res, mockNext(false), noop);

        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );
      });

      // wallet_requestPermissions returns all permissions approved for the
      // requesting origin, including old ones
      it('handles unrequested permissions on the response', async () => {
        const controller = initController({
          restrictedMethods: new Set([]),
        });
        const logMiddleware = controller.createMiddleware();
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

        logMiddleware(req, res, mockNext(false), noop);

        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case1[0],
        );
      });

      it('does not update history if no new permissions are approved', async () => {
        const controller = initController({
          restrictedMethods: new Set([]),
        });
        const logMiddleware = controller.createMiddleware();
        let req = RPC_REQUESTS.requestPermission(
          SUBJECTS.a.origin,
          PERM_NAMES.test_method,
        );
        let res = {
          ...PendingJsonRpcResponseStruct.TYPE,
          result: [PERMS.granted.test_method()],
        };

        logMiddleware(req, res, mockNext(false), noop);

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

        logMiddleware(req, res, mockNext(false), noop);

        // history should be unmodified
        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case4[0],
        );
      });

      it('records and updates history for multiple origins, regardless of response order', async () => {
        const controller = initController({
          restrictedMethods: new Set([]),
        });
        const logMiddleware = controller.createMiddleware();

        const round1: {
          req: JsonRpcRequest;
          res: PendingJsonRpcResponse<Permission[]>;
        }[] = [
          {
            req: RPC_REQUESTS.requestPermission(
              SUBJECTS.a.origin,
              PERM_NAMES.test_method,
            ),
            res: {
              ...PendingJsonRpcResponseStruct.TYPE,
              result: [PERMS.granted.test_method()],
            },
          },
          {
            req: RPC_REQUESTS.requestPermission(
              SUBJECTS.b.origin,
              PERM_NAMES.eth_accounts,
            ),
            res: {
              ...PendingJsonRpcResponseStruct.TYPE,
              result: [PERMS.granted.eth_accounts(ACCOUNTS.b.permitted)],
            },
          },
          {
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
          },
        ];
        const handlers1: JsonRpcEngineReturnHandler[] = [];

        // make requests and process responses out of order
        round1.forEach((x) => {
          logMiddleware(x.req, x.res, getSavedMockNext(handlers1, false), noop);
        });

        for (const i of [1, 2, 0]) {
          handlers1[i](noop);
        }

        expect(controller.state.permissionHistory).toStrictEqual(
          EXPECTED_HISTORIES.case3[0],
        );

        // make next round of requests
        jest.advanceTimersByTime(1);

        // nothing for second origin in this round
        const round2: {
          req: JsonRpcRequest;
          res: PendingJsonRpcResponse<Permission[]>;
        }[] = [
          {
            req: RPC_REQUESTS.requestPermission(
              SUBJECTS.a.origin,
              PERM_NAMES.test_method,
            ),
            res: {
              ...PendingJsonRpcResponseStruct.TYPE,
              result: [PERMS.granted.test_method()],
            },
          },
          {
            req: RPC_REQUESTS.requestPermissions(SUBJECTS.c.origin, {
              [PERM_NAMES.eth_accounts]: {},
            }),
            res: {
              ...PendingJsonRpcResponseStruct.TYPE,
              result: [PERMS.granted.eth_accounts(ACCOUNTS.b.permitted)],
            },
          },
        ];

        round2.forEach((x) => {
          logMiddleware(x.req, x.res, mockNext(false), noop);
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
      const controller = initController({
        restrictedMethods: new Set([]),
      });

      controller.updateAccountsHistory('foo.com', []);

      expect(controller.state.permissionHistory).toStrictEqual({});
    });

    it('updates the account history', () => {
      const controller = initController({
        restrictedMethods: new Set(['eth_accounts']),
        state: {
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
