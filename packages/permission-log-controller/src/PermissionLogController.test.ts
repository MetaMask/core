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
import { useFakeTimers } from 'sinon';
import type { SinonFakeTimers } from 'sinon';

import { LOG_LIMIT, LOG_METHOD_TYPES } from './enums';
import {
  type Permission,
  type JsonRpcRequestWithOrigin,
  type PermissionActivityLog,
  PermissionLogController,
} from './PermissionLogController';
import { CaveatTypes, constants, getters, noop } from './permissions';

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

const initPermLog = (state = {}): PermissionLogController => {
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
  permLog: PermissionLogController,
): JsonRpcMiddleware<JsonRpcParams, Json> => {
  const middleware = permLog.createMiddleware();
  return (req, res, next, end) => {
    middleware(req, res, next, end);
  };
};

let clock: SinonFakeTimers;
const initClock = () => {
  // useFakeTimers, is in fact, not a react-hook
  // eslint-disable-next-line
  clock = useFakeTimers(1);
};

const tearDownClock = () => {
  clock.restore();
};

const getSavedMockNext =
  (
    arr: (JsonRpcEngineReturnHandler | undefined)[],
  ): JsonRpcEngineNextCallback =>
  (handler) => {
    arr.push(handler);
  };

describe('PermissionLogController', () => {
  describe('restricted method activity log', () => {
    let permLog: PermissionLogController,
      logMiddleware: JsonRpcMiddleware<JsonRpcParams, Json>;

    beforeEach(() => {
      permLog = initPermLog();
      logMiddleware = initMiddleware(permLog);
    });

    it('records activity for restricted methods', () => {
      let log: PermissionActivityLog[],
        req: JsonRpcRequestWithOrigin,
        res: PendingJsonRpcResponse<Json>;

      // test_method, success

      req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);
      req.id = REQUEST_IDS.a;
      res = {
        ...PendingJsonRpcResponseStruct.TYPE,
        id: null,
        result: ['bar'],
      };

      logMiddleware(req, res, mockNext, noop);

      log = permLog.getActivityLog();
      const entry1 = log[0];

      expect(log).toHaveLength(1);
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
        ...PendingJsonRpcResponseStruct.TYPE,
        error: new CustomError('Unauthorized.', 1),
        result: undefined,
      };

      logMiddleware(req, res, mockNext, noop);

      log = permLog.getActivityLog();
      const entry2 = log[1];

      expect(log).toHaveLength(2);
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
        id: null,
        result: ACCOUNTS.c.permitted,
      };

      logMiddleware(req, res, mockNext, noop);

      log = permLog.getActivityLog();
      const entry3 = log[2];

      expect(log).toHaveLength(3);
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
      res = {
        ...PendingJsonRpcResponseStruct.TYPE,
        result: undefined,
      };

      logMiddleware(req, res, mockNext, noop);

      log = permLog.getActivityLog();
      const entry4 = log[3];

      expect(log).toHaveLength(4);
      validateActivityEntry(
        entry4,
        req,
        null,
        LOG_METHOD_TYPES.restricted,
        false,
      );

      // Validate final state
      expect(entry1).toStrictEqual(log[0]);
      expect(entry2).toStrictEqual(log[1]);
      expect(entry3).toStrictEqual(log[2]);
      expect(entry4).toStrictEqual(log[3]);

      // Regression test: ensure "response" and "request" properties
      // are not present
      log.forEach((entry) =>
        expect('request' in entry && 'response' in entry).toBe(false),
      );
    });

    it('handles responses added out of order', () => {
      let log;

      const handlerArray: JsonRpcEngineReturnHandler[] = [];

      const id1 = nanoid();
      const id2 = nanoid();
      const id3 = nanoid();

      const req = RPC_REQUESTS.test_method(SUBJECTS.a.origin);

      // get make requests
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
          id: null,
        },
        getSavedMockNext(handlerArray),
        noop,
      );

      req.id = id2;
      const res2 = {
        ...PendingJsonRpcResponseStruct.TYPE,
        result: [id2],
      };
      logMiddleware(req, res2, getSavedMockNext(handlerArray), noop);

      req.id = id3;
      const res3 = {
        ...PendingJsonRpcResponseStruct.TYPE,
        result: [id3],
      };
      logMiddleware(req, res3, getSavedMockNext(handlerArray), noop);

      // verify log state
      log = permLog.getActivityLog();
      expect(log).toHaveLength(3);
      const entry1 = log[0];
      const entry2 = log[1];
      const entry3 = log[2];

      // all entries should be in correct order
      expect(entry1).toMatchObject({ id: id1, responseTime: null });
      expect(entry2).toMatchObject({ id: id2, responseTime: null });
      expect(entry3).toMatchObject({ id: id3, responseTime: null });

      // call response handlers
      for (const i of [1, 2, 0]) {
        handlerArray[i](noop);
      }

      // verify log state again
      log = permLog.getActivityLog();
      expect(log).toHaveLength(3);

      // verify all entries
      log = permLog.getActivityLog();

      validateActivityEntry(
        log[0],
        { ...req, id: id1 },
        { ...res1 },
        LOG_METHOD_TYPES.restricted,
        true,
      );

      validateActivityEntry(
        log[1],
        { ...req, id: id2 },
        { ...res2 },
        LOG_METHOD_TYPES.restricted,
        true,
      );

      validateActivityEntry(
        log[2],
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

      let log = permLog.getActivityLog();
      const entry1 = log[0];

      expect(log).toHaveLength(1);
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

      log = permLog.getActivityLog();
      const entry2 = log[1];
      expect(log).toHaveLength(2);
      validateActivityEntry(
        entry2,
        req,
        res,
        LOG_METHOD_TYPES.restricted,
        true,
      );

      // validate final state
      expect(entry1).toStrictEqual(log[0]);
      expect(entry2).toStrictEqual(log[1]);
    });

    it('ignores expected methods', () => {
      let log = permLog.getActivityLog();
      expect(log).toHaveLength(0);

      const res = {
        ...PendingJsonRpcResponseStruct.TYPE,
        result: ['bar'],
      };
      const req1 = RPC_REQUESTS.metamask_sendDomainMetadata(
        SUBJECTS.c.origin,
        'foobar',
      );
      const req2 = RPC_REQUESTS.custom(SUBJECTS.b.origin, 'eth_getBlockNumber');
      const req3 = RPC_REQUESTS.custom(SUBJECTS.b.origin, 'net_version');

      logMiddleware(req1, res, mockNext, noop);
      logMiddleware(req2, res, mockNext, noop);
      logMiddleware(req3, res, mockNext, noop);

      log = permLog.getActivityLog();
      expect(log).toHaveLength(0);
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
      let log = permLog.getActivityLog();
      expect(log).toHaveLength(LOG_LIMIT);

      validateActivityEntry(
        log[LOG_LIMIT - 1],
        { ...req, id: lastId ?? null },
        res,
        LOG_METHOD_TYPES.restricted,
        true,
      );

      // store the id of the current second entry
      const nextFirstId = log[1].id;

      // add one more entry to log, putting it over the limit
      lastId = nanoid();
      logMiddleware({ ...req, id: lastId }, res, mockNext, noop);

      // check log length
      log = permLog.getActivityLog();
      expect(log).toHaveLength(LOG_LIMIT);

      // check first and last entries
      validateActivityEntry(
        log[0],
        { ...req, id: nextFirstId },
        res,
        LOG_METHOD_TYPES.restricted,
        true,
      );

      validateActivityEntry(
        log[LOG_LIMIT - 1],
        { ...req, id: lastId },
        res,
        LOG_METHOD_TYPES.restricted,
        true,
      );
    });
  });

  describe('permission history log', () => {
    let permLog: PermissionLogController,
      logMiddleware: JsonRpcMiddleware<JsonRpcParams, Json>;

    beforeEach(() => {
      permLog = initPermLog();
      logMiddleware = initMiddleware(permLog);
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

      expect(permLog.getHistory()).toStrictEqual({});

      // response => records granted permissions
      logMiddleware(req, res, mockNext, noop);

      const permHistory = permLog.getHistory();
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

      expect(permLog.getHistory()).toStrictEqual({});
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

      expect(permLog.getHistory()).toStrictEqual(EXPECTED_HISTORIES.case1[0]);

      // mock permission requested again, with another approved account

      clock.tick(1);

      res.result = [PERMS.granted.eth_accounts([ACCOUNTS.a.permitted[0]])];

      logMiddleware(req, res, mockNext, noop);

      expect(permLog.getHistory()).toStrictEqual(EXPECTED_HISTORIES.case1[1]);
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

      expect(permLog.getHistory()).toStrictEqual(EXPECTED_HISTORIES.case2[0]);
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
      res.result[0].caveats?.push({
        type: CaveatTypes.restrictReturnedAccounts,
        value: ['bar'],
      });

      logMiddleware(req, res, mockNext, noop);

      expect(permLog.getHistory()).toStrictEqual(EXPECTED_HISTORIES.case1[0]);
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

      expect(permLog.getHistory()).toStrictEqual(EXPECTED_HISTORIES.case1[0]);
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

      expect(permLog.getHistory()).toStrictEqual(EXPECTED_HISTORIES.case4[0]);

      // new permission requested, but not approved

      clock.tick(1);

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
      expect(permLog.getHistory()).toStrictEqual(EXPECTED_HISTORIES.case4[0]);
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
        logMiddleware(
          x.req,
          {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: undefined,
            ...x.res,
          },
          getSavedMockNext(handlers1),
          noop,
        );
      });

      for (const i of [1, 2, 0]) {
        handlers1[i](noop);
      }

      expect(permLog.getHistory()).toStrictEqual(EXPECTED_HISTORIES.case3[0]);

      // make next round of requests

      clock.tick(1);

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
        logMiddleware(
          x.req,
          {
            ...PendingJsonRpcResponseStruct.TYPE,
            result: undefined,
            ...x.res,
          },
          mockNext,
          noop,
        );
      });

      expect(permLog.getHistory()).toStrictEqual(EXPECTED_HISTORIES.case3[1]);
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
      const permLog = initPermLog();
      permLog.updateAccountsHistory('foo.com', []);

      expect(permLog.getHistory()).toStrictEqual({});
    });

    it('updates the account history', () => {
      const permLog = initPermLog({
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

      clock.tick(1);
      permLog.updateAccountsHistory('foo.com', ['0x1', '0x2']);

      expect(permLog.getHistory()).toStrictEqual({
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
