/* eslint-disable jest/expect-expect */

import { ControllerMessenger } from '@metamask/base-controller';
import { errorCodes, JsonRpcError } from '@metamask/rpc-errors';

import type {
  AddApprovalOptions,
  ApprovalControllerActions,
  ApprovalControllerEvents,
  ErrorOptions,
  StartFlowOptions,
  SuccessOptions,
} from './ApprovalController';
import {
  APPROVAL_TYPE_RESULT_ERROR,
  APPROVAL_TYPE_RESULT_SUCCESS,
  ApprovalController,
  ORIGIN_METAMASK,
} from './ApprovalController';
import {
  ApprovalRequestNoResultSupportError,
  EndInvalidFlowError,
  MissingApprovalFlowError,
  NoApprovalFlowsError,
} from './errors';

jest.mock('nanoid', () => ({
  nanoid: jest.fn(() => 'TestId'),
}));

const PENDING_APPROVALS_STORE_KEY = 'pendingApprovals';
const APPROVAL_FLOWS_STORE_KEY = 'approvalFlows';
const TYPE = 'TYPE';
const ID_MOCK = 'TestId';
const ORIGIN_MOCK = 'TestOrigin';
const VALUE_MOCK = 'TestValue';
const RESULT_MOCK = 'TestResult';
const ERROR_MOCK = new Error('TestError');
const FLOW_ID_MOCK = 'TestFlowId';
const MESSAGE_MOCK = 'TestMessage';
const ERROR_MESSAGE_MOCK = 'TestErrorMessage';
const TITLE_MOCK = 'TestTitle';
const ICON_MOCK = 'TestIcon';

const RESULT_COMPONENT_MOCK = {
  key: 'testKey',
  name: 'TestComponentName',
  properties: { testProp: 'testPropValue' },
  children: ['testChild1', 'testChild2'],
};

const SUCCESS_OPTIONS_MOCK = {
  message: MESSAGE_MOCK,
  header: [RESULT_COMPONENT_MOCK],
  title: TITLE_MOCK,
  icon: ICON_MOCK,
};

const ERROR_OPTIONS_MOCK = {
  error: ERROR_MESSAGE_MOCK,
  header: [RESULT_COMPONENT_MOCK],
  title: TITLE_MOCK,
  icon: ICON_MOCK,
};

const controllerName = 'ApprovalController';

/**
 * Get an ID collision error.
 *
 * @param id - The ID with a collision.
 * @returns The ID collision error.
 */
function getIdCollisionError(id: string) {
  return getError(
    `Approval request with id '${id}' already exists.`,
    errorCodes.rpc.internal,
  );
}

/**
 * Get an origin type collision error.
 *
 * @param origin - The origin.
 * @param type - The type.
 * @returns An origin type collision error.
 */
function getOriginTypeCollisionError(origin: string, type = TYPE) {
  const message = `Request of type '${type}' already pending for origin ${origin}. Please wait.`;
  return getError(message, errorCodes.rpc.resourceUnavailable);
}

/**
 * Get an invalid ID error.
 *
 * @returns An invalid ID error.
 */
function getInvalidIdError() {
  return getError('Must specify non-empty string id.', errorCodes.rpc.internal);
}

/**
 * Get an "ID not found" error.
 *
 * @param id - The ID that was not found.
 * @returns An "ID not found" error.
 */
function getIdNotFoundError(id: string) {
  return getError(`Approval request with id '${id}' not found.`);
}

/**
 * Get an invalid ID type error.
 *
 * @returns An invalid ID type error.
 */
function getInvalidHasIdError() {
  return getError('May not specify non-string id.');
}

/**
 * Get an invalid origin type error.
 *
 * @returns The invalid origin type error.
 */
function getInvalidHasOriginError() {
  return getError('May not specify non-string origin.');
}

/**
 * Get an invalid type error.
 *
 * @returns The invalid type error.
 */
function getInvalidHasTypeError() {
  return getError('May not specify non-string type.');
}

/**
 * Get an invalid origin error.
 *
 * @returns The invalid origin error.
 */
function getInvalidOriginError() {
  return getError(
    'Must specify non-empty string origin.',
    errorCodes.rpc.internal,
  );
}

/**
 * Get an invalid request data error.
 *
 * @returns The invalid request data error.
 */
function getInvalidRequestDataError() {
  return getError(
    'Request data must be a plain object if specified.',
    errorCodes.rpc.internal,
  );
}

/**
 * Get an invalid request state error.
 *
 * @returns The invalid request data error.
 */
function getInvalidRequestStateError() {
  return getError(
    'Request state must be a plain object if specified.',
    errorCodes.rpc.internal,
  );
}

/**
 * Get an invalid type error.
 *
 * @param code - The error code.
 * @returns The invalid type error.
 */
function getInvalidTypeError(code: number) {
  return getError('Must specify non-empty string type.', code);
}

/**
 * Get an invalid params error.
 *
 * @returns The invalid params error.
 */
function getInvalidHasParamsError() {
  return getError('Must specify a valid combination of id, origin, and type.');
}

/**
 * Get an invalid approval count params error.
 *
 * @returns The invalid approval count params error.
 */
function getApprovalCountParamsError() {
  return getError('Must specify origin, type, or both.');
}

/**
 * Get an error.
 *
 * @param message - The error message.
 * @param code - The error code.
 * @returns An Error.
 */
function getError(message: string, code?: number) {
  const err = {
    name: 'Error',
    message,
  } as { name: string; message: string; code?: number };

  if (code !== undefined) {
    err.code = code;
  }

  return err;
}

/**
 * Constructs a restricted controller messenger.
 *
 * @returns A restricted controller messenger.
 */
function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger<
    ApprovalControllerActions,
    ApprovalControllerEvents
  >();
  const messenger = controllerMessenger.getRestricted({
    name: 'ApprovalController',
    allowedActions: [],
    allowedEvents: [],
  });
  return messenger;
}

describe('approval controller', () => {
  let approvalController: ApprovalController;
  let showApprovalRequest: jest.Mock;

  beforeEach(() => {
    jest.spyOn(global.console, 'info').mockImplementation(() => undefined);

    showApprovalRequest = jest.fn();

    approvalController = new ApprovalController({
      messenger: getRestrictedMessenger(),
      showApprovalRequest,
    });
  });

  describe('add', () => {
    it('validates input', () => {
      expect(() =>
        approvalController.add({
          id: null,
          origin: 'bar.baz',
        } as unknown as AddApprovalOptions),
      ).toThrow(getInvalidIdError());

      expect(() =>
        approvalController.add({ id: 'foo' } as unknown as AddApprovalOptions),
      ).toThrow(getInvalidOriginError());

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: true,
        } as unknown as AddApprovalOptions),
      ).toThrow(getInvalidOriginError());

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: {},
        } as unknown as AddApprovalOptions),
      ).toThrow(getInvalidTypeError(errorCodes.rpc.internal));

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: '',
        } as unknown as AddApprovalOptions),
      ).toThrow(getInvalidTypeError(errorCodes.rpc.internal));

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: 'type',
          requestData: 'foo',
        } as unknown as AddApprovalOptions),
      ).toThrow(getInvalidRequestDataError());

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: 'type',
          requestState: 'foo',
        } as unknown as AddApprovalOptions),
      ).toThrow(getInvalidRequestStateError());
    });

    it('adds correctly specified entry', () => {
      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: TYPE,
          expectsResult: true,
        }),
      ).not.toThrow();

      expect(approvalController.has({ id: 'foo' })).toBe(true);

      expect(approvalController.has({ origin: 'bar.baz', type: TYPE })).toBe(
        true,
      );

      expect(
        approvalController.state[PENDING_APPROVALS_STORE_KEY],
      ).toStrictEqual({
        foo: {
          id: 'foo',
          origin: 'bar.baz',
          requestData: null,
          requestState: null,
          time: expect.any(Number),
          type: TYPE,
          expectsResult: true,
        },
      });
    });

    it('adds id if non provided', () => {
      expect(() =>
        approvalController.add({
          id: undefined,
          origin: 'bar.baz',
          type: TYPE,
        }),
      ).not.toThrow();

      const id = Object.keys(
        approvalController.state[PENDING_APPROVALS_STORE_KEY],
      )[0];
      expect(id && typeof id === 'string').toBe(true);
    });

    it('adds correctly specified entry with request data', () => {
      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: 'myType',
          requestData: { foo: 'bar' },
        }),
      ).not.toThrow();

      expect(approvalController.has({ id: 'foo' })).toBe(true);
      expect(approvalController.has({ origin: 'bar.baz' })).toBe(true);
      expect(approvalController.has({ type: 'myType' })).toBe(true);
      expect(
        approvalController.state[PENDING_APPROVALS_STORE_KEY].foo.requestData,
      ).toStrictEqual({ foo: 'bar' });
    });

    it('adds correctly specified entry with request state', () => {
      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: 'myType',
          requestState: { foo: 'bar' },
        }),
      ).not.toThrow();

      expect(approvalController.has({ id: 'foo' })).toBe(true);
      expect(approvalController.has({ origin: 'bar.baz' })).toBe(true);
      expect(approvalController.has({ type: 'myType' })).toBe(true);
      expect(
        approvalController.state[PENDING_APPROVALS_STORE_KEY].foo.requestState,
      ).toStrictEqual({ foo: 'bar' });
    });

    it('adds multiple entries for same origin with different types and ids', () => {
      const ORIGIN = 'bar.baz';

      expect(() =>
        approvalController.add({ id: 'foo1', origin: ORIGIN, type: 'myType1' }),
      ).not.toThrow();

      expect(() =>
        approvalController.add({ id: 'foo2', origin: ORIGIN, type: 'myType2' }),
      ).not.toThrow();

      expect(
        approvalController.has({ id: 'foo1' }) &&
          approvalController.has({ id: 'foo2' }),
      ).toBe(true);

      expect(
        approvalController.has({ origin: ORIGIN }) &&
          approvalController.has({ origin: ORIGIN, type: 'myType1' }) &&
          approvalController.has({ origin: ORIGIN, type: 'myType2' }),
      ).toBe(true);
    });

    it('throws on id collision', () => {
      expect(() =>
        approvalController.add({ id: 'foo', origin: 'bar.baz', type: TYPE }),
      ).not.toThrow();

      expect(() =>
        approvalController.add({ id: 'foo', origin: 'fizz.buzz', type: TYPE }),
      ).toThrow(getIdCollisionError('foo'));
    });

    it('throws on origin and type collision', () => {
      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: 'myType',
        }),
      ).not.toThrow();

      expect(() =>
        approvalController.add({
          id: 'foo1',
          origin: 'bar.baz',
          type: 'myType',
        }),
      ).toThrow(getOriginTypeCollisionError('bar.baz', 'myType'));
    });

    it('does not throw on origin and type collision if type excluded', () => {
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest,
        typesExcludedFromRateLimiting: ['myType'],
      });

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: 'myType',
        }),
      ).not.toThrow();

      expect(() =>
        approvalController.add({
          id: 'foo1',
          origin: 'bar.baz',
          type: 'myType',
        }),
      ).not.toThrow();
    });
  });

  // otherwise tested by 'add' above
  describe('addAndShowApprovalRequest', () => {
    it('addAndShowApprovalRequest', () => {
      const result = approvalController.addAndShowApprovalRequest({
        id: 'foo',
        origin: 'bar.baz',
        type: 'myType',
        requestData: { foo: 'bar' },
      });
      expect(result instanceof Promise).toBe(true);
      expect(showApprovalRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('get', () => {
    it('gets entry', () => {
      // We only want to test the stored entity in the controller state hence disabling floating promises here.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({
        id: 'foo',
        origin: 'bar.baz',
        type: 'myType',
        expectsResult: true,
      });

      expect(approvalController.get('foo')).toStrictEqual({
        id: 'foo',
        origin: 'bar.baz',
        requestData: null,
        requestState: null,
        type: 'myType',
        time: expect.any(Number),
        expectsResult: true,
      });
    });

    it('returns undefined for non-existing entry', () => {
      // We only want to test the stored entity in the controller state hence disabling floating promises here.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({
        id: 'foo',
        origin: 'bar.baz',
        type: 'type',
      });

      expect(approvalController.get('fizz')).toBeUndefined();

      expect(approvalController.get({} as never)).toBeUndefined();
    });
  });

  describe('getApprovalCount', () => {
    let addWithCatch: (args: AddApprovalOptions) => void;

    beforeEach(() => {
      addWithCatch = (args: AddApprovalOptions) => {
        approvalController.add(args).catch(() => undefined);
      };
    });

    it('validates input', () => {
      expect(() => approvalController.getApprovalCount()).toThrow(
        getApprovalCountParamsError(),
      );

      expect(() => approvalController.getApprovalCount({})).toThrow(
        getApprovalCountParamsError(),
      );

      expect(() =>
        approvalController.getApprovalCount({ origin: null } as never),
      ).toThrow(getApprovalCountParamsError());

      expect(() =>
        approvalController.getApprovalCount({ type: false } as never),
      ).toThrow(getApprovalCountParamsError());
    });

    it('gets the count when specifying origin and type', () => {
      addWithCatch({ id: '1', origin: 'origin1', type: TYPE });
      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });

      expect(
        approvalController.getApprovalCount({ origin: 'origin1', type: TYPE }),
      ).toBe(1);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin1',
          type: 'type1',
        }),
      ).toBe(1);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin1',
          type: 'type2',
        }),
      ).toBe(0);

      expect(
        approvalController.getApprovalCount({ origin: 'origin2', type: TYPE }),
      ).toBe(0);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin2',
          type: 'type1',
        }),
      ).toBe(1);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin2',
          type: 'type2',
        }),
      ).toBe(0);

      expect(
        approvalController.getApprovalCount({ origin: 'origin3', type: TYPE }),
      ).toBe(0);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin3',
          type: 'type1',
        }),
      ).toBe(0);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin3',
          type: 'type2',
        }),
      ).toBe(0);
    });

    it('gets the count when specifying origin only', () => {
      addWithCatch({ id: '1', origin: 'origin1', type: 'type0' });
      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });

      expect(approvalController.getApprovalCount({ origin: 'origin1' })).toBe(
        2,
      );

      expect(approvalController.getApprovalCount({ origin: 'origin2' })).toBe(
        1,
      );

      expect(approvalController.getApprovalCount({ origin: 'origin3' })).toBe(
        0,
      );
    });

    it('gets the count when specifying type only', () => {
      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });
      addWithCatch({ id: '4', origin: 'origin2', type: 'type2' });

      expect(approvalController.getApprovalCount({ type: 'type1' })).toBe(2);

      expect(approvalController.getApprovalCount({ type: 'type2' })).toBe(1);

      expect(approvalController.getApprovalCount({ type: 'type3' })).toBe(0);
    });

    it('gets the count when specifying origin and type with type excluded from rate limiting', () => {
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest,
        typesExcludedFromRateLimiting: [TYPE],
      });

      addWithCatch({ id: '1', origin: 'origin1', type: TYPE });
      addWithCatch({ id: '2', origin: 'origin1', type: TYPE });

      expect(
        approvalController.getApprovalCount({ origin: 'origin1', type: TYPE }),
      ).toBe(2);
    });
  });

  describe('getTotalApprovalCount', () => {
    it('gets the total approval count', () => {
      expect(approvalController.getTotalApprovalCount()).toBe(0);

      const addWithCatch = (args: AddApprovalOptions) => {
        approvalController.add(args).catch(() => undefined);
      };

      addWithCatch({ id: '1', origin: 'origin1', type: 'type0' });
      expect(approvalController.getTotalApprovalCount()).toBe(1);

      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      expect(approvalController.getTotalApprovalCount()).toBe(2);

      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });
      expect(approvalController.getTotalApprovalCount()).toBe(3);

      approvalController.reject('2', new Error('foo'));
      expect(approvalController.getTotalApprovalCount()).toBe(2);

      approvalController.clear(new JsonRpcError(1, 'clear'));
      expect(approvalController.getTotalApprovalCount()).toBe(0);
    });

    it('gets the total approval count with type excluded from rate limiting', () => {
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest,
        typesExcludedFromRateLimiting: ['type0'],
      });
      expect(approvalController.getTotalApprovalCount()).toBe(0);

      const addWithCatch = (args: AddApprovalOptions) => {
        approvalController.add(args).catch(() => undefined);
      };

      addWithCatch({ id: '1', origin: 'origin1', type: 'type0' });
      expect(approvalController.getTotalApprovalCount()).toBe(1);

      addWithCatch({ id: '2', origin: 'origin1', type: 'type0' });
      expect(approvalController.getTotalApprovalCount()).toBe(2);

      approvalController.reject('2', new Error('foo'));
      expect(approvalController.getTotalApprovalCount()).toBe(1);

      approvalController.clear(new JsonRpcError(1, 'clear'));
      expect(approvalController.getTotalApprovalCount()).toBe(0);
    });
  });

  describe('has', () => {
    it('validates input', () => {
      expect(() => approvalController.has()).toThrow(
        getInvalidHasParamsError(),
      );

      expect(() => approvalController.has({})).toThrow(
        getInvalidHasParamsError(),
      );

      expect(() => approvalController.has({ id: true } as never)).toThrow(
        getInvalidHasIdError(),
      );

      expect(() => approvalController.has({ origin: true } as never)).toThrow(
        getInvalidHasOriginError(),
      );

      expect(() => approvalController.has({ type: true } as never)).toThrow(
        getInvalidHasTypeError(),
      );

      expect(() =>
        approvalController.has({ origin: 'foo', type: true } as never),
      ).toThrow(getInvalidHasTypeError());
    });

    it('returns true for existing entry by id', async () => {
      // We only want to check the stored entity is exist in the state hence disabling floating promises here.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({
        id: 'foo',
        origin: 'bar.baz',
        type: TYPE,
      });

      expect(approvalController.has({ id: 'foo' })).toBe(true);
    });

    it('returns true for existing entry by origin', () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: TYPE });

      expect(approvalController.has({ origin: 'bar.baz' })).toBe(true);
    });

    it('returns true for existing entry by origin and type', () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      expect(
        approvalController.has({ origin: 'bar.baz', type: 'myType' }),
      ).toBe(true);
    });

    it('returns true for existing type', () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      expect(approvalController.has({ type: 'myType' })).toBe(true);
    });

    it('returns false for non-existing entry by id', () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: TYPE });

      expect(approvalController.has({ id: 'fizz' })).toBe(false);
    });

    it('returns false for non-existing entry by origin', () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: TYPE });

      expect(approvalController.has({ origin: 'fizz.buzz' })).toBe(false);
    });

    it('returns false for non-existing entry by existing origin and non-existing type', () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: TYPE });

      expect(
        approvalController.has({ origin: 'bar.baz', type: 'myType' }),
      ).toBe(false);
    });

    it('returns false for non-existing entry by non-existing origin and existing type', () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      expect(
        approvalController.has({ origin: 'fizz.buzz', type: 'myType' }),
      ).toBe(false);
    });

    it('returns false for non-existing entry by type', () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType1' });

      expect(approvalController.has({ type: 'myType2' })).toBe(false);
    });
  });

  describe('accept', () => {
    it('resolves approval promise', async () => {
      const approvalPromise = approvalController.add({
        id: 'foo',
        origin: 'bar.baz',
        type: 'myType',
      });
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept('foo', 'success');

      const result = await approvalPromise;
      expect(result).toBe('success');
    });

    it('resolves multiple approval promises out of order', async () => {
      const approvalPromise1 = approvalController.add({
        id: 'foo1',
        origin: 'bar.baz',
        type: 'myType1',
      });
      const approvalPromise2 = approvalController.add({
        id: 'foo2',
        origin: 'bar.baz',
        type: 'myType2',
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept('foo2', 'success2');

      let result = await approvalPromise2;
      expect(result).toBe('success2');

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept('foo1', 'success1');

      result = await approvalPromise1;
      expect(result).toBe('success1');
    });

    it('throws on unknown id', () => {
      expect(() => approvalController.accept('foo')).toThrow(
        getIdNotFoundError('foo'),
      );
    });

    it('resolves accept promise when success callback is called', async () => {
      const approvalPromise = approvalController.add({
        id: ID_MOCK,
        origin: ORIGIN_MOCK,
        type: TYPE,
        expectsResult: true,
      });

      const resultPromise = approvalController.accept(ID_MOCK, VALUE_MOCK, {
        waitForResult: true,
      });

      const { resultCallbacks, value } = await approvalPromise;

      expect(value).toBe(VALUE_MOCK);

      resultCallbacks?.success(RESULT_MOCK);

      expect(await resultPromise).toStrictEqual({ value: RESULT_MOCK });
    });

    it('rejects accept promise when error callback is called', async () => {
      const approvalPromise = approvalController.add({
        id: ID_MOCK,
        origin: ORIGIN_MOCK,
        type: TYPE,
        expectsResult: true,
      });

      const resultPromise = approvalController.accept(ID_MOCK, VALUE_MOCK, {
        waitForResult: true,
      });

      const { resultCallbacks, value } = await approvalPromise;

      expect(value).toBe(VALUE_MOCK);

      resultCallbacks?.error(ERROR_MOCK);

      await expect(resultPromise).rejects.toThrow(ERROR_MOCK);
    });

    it('resolves request promise with empty result callbacks if accept does not wait for result', async () => {
      const approvalPromise = approvalController.add({
        id: ID_MOCK,
        origin: ORIGIN_MOCK,
        type: TYPE,
        expectsResult: true,
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept(ID_MOCK, VALUE_MOCK);

      expect(await approvalPromise).toStrictEqual({
        resultCallbacks: undefined,
        value: VALUE_MOCK,
      });
    });

    it('throws if accept wants to wait but request does not expect result', async () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({
        id: ID_MOCK,
        origin: ORIGIN_MOCK,
        type: TYPE,
      });

      await expect(
        approvalController.accept(ID_MOCK, VALUE_MOCK, {
          waitForResult: true,
        }),
      ).rejects.toThrow(new ApprovalRequestNoResultSupportError(ID_MOCK));
    });

    it('deletes entry', () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'type' });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept('foo');

      expect(
        !approvalController.has({ id: 'foo' }) &&
          !approvalController.has({ type: 'type' }) &&
          !approvalController.has({ origin: 'bar.baz' }) &&
          !approvalController.state[PENDING_APPROVALS_STORE_KEY].foo,
      ).toBe(true);
    });

    it('deletes one entry out of many without side-effects', () => {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'type1' });
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({ id: 'fizz', origin: 'bar.baz', type: 'type2' });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept('fizz');

      expect(
        !approvalController.has({ id: 'fizz' }) &&
          !approvalController.has({ origin: 'bar.baz', type: 'type2' }),
      ).toBe(true);

      expect(
        approvalController.has({ id: 'foo' }) &&
          approvalController.has({ origin: 'bar.baz' }),
      ).toBe(true);
    });
  });

  describe('reject', () => {
    it('rejects approval promise', async () => {
      const approvalPromise = approvalController.add({
        id: 'foo',
        origin: 'bar.baz',
        type: TYPE,
      });
      approvalController.reject('foo', new Error('failure'));
      await expect(approvalPromise).rejects.toThrow('failure');
    });

    it('rejects multiple approval promises out of order', async () => {
      const rejectionPromise1 = approvalController.add({
        id: 'foo1',
        origin: 'bar.baz',
        type: TYPE,
      });
      const rejectionPromise2 = approvalController.add({
        id: 'foo2',
        origin: 'bar.baz',
        type: 'myType2',
      });

      approvalController.reject('foo2', new Error('failure2'));
      approvalController.reject('foo1', new Error('failure1'));
      await expect(rejectionPromise2).rejects.toThrow('failure2');
      await expect(rejectionPromise1).rejects.toThrow('failure1');
    });

    it('throws on unknown id', () => {
      expect(() => approvalController.reject('foo', new Error('bar'))).toThrow(
        getIdNotFoundError('foo'),
      );
    });

    it('deletes entry', () => {
      approvalController
        .add({ id: 'foo', origin: 'bar.baz', type: 'type' })
        .catch(() => undefined);

      approvalController.reject('foo', new Error('failure'));

      expect(
        !approvalController.has({ id: 'foo' }) &&
          !approvalController.has({ type: 'type' }) &&
          !approvalController.has({ origin: 'bar.baz' }) &&
          !approvalController.state[PENDING_APPROVALS_STORE_KEY].foo,
      ).toBe(true);
    });

    it('deletes one entry out of many without side-effects', () => {
      approvalController
        .add({ id: 'foo', origin: 'bar.baz', type: 'type1' })
        .catch(() => undefined);
      approvalController
        .add({ id: 'fizz', origin: 'bar.baz', type: 'type2' })
        .catch(() => undefined);

      approvalController.reject('fizz', new Error('failure'));

      expect(
        !approvalController.has({ id: 'fizz' }) &&
          !approvalController.has({ origin: 'bar.baz', type: 'type2' }),
      ).toBe(true);

      expect(
        approvalController.has({ id: 'foo' }) &&
          approvalController.has({ origin: 'bar.baz' }),
      ).toBe(true);
    });
  });

  describe('accept and reject', () => {
    it('accepts and rejects multiple approval promises out of order', async () => {
      const promise1 = approvalController.add({
        id: 'foo1',
        origin: 'bar.baz',
        type: TYPE,
      });
      const promise2 = approvalController.add({
        id: 'foo2',
        origin: 'bar.baz',
        type: 'myType2',
      });
      const promise3 = approvalController.add({
        id: 'foo3',
        origin: 'fizz.buzz',
        type: TYPE,
      });
      const promise4 = approvalController.add({
        id: 'foo4',
        origin: 'bar.baz',
        type: 'myType4',
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept('foo2', 'success2');

      let result = await promise2;
      expect(result).toBe('success2');

      approvalController.reject('foo4', new Error('failure4'));
      await expect(promise4).rejects.toThrow('failure4');

      approvalController.reject('foo3', new Error('failure3'));
      await expect(promise3).rejects.toThrow('failure3');

      expect(approvalController.has({ origin: 'fizz.buzz' })).toBe(false);
      expect(approvalController.has({ origin: 'bar.baz' })).toBe(true);

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept('foo1', 'success1');

      result = await promise1;
      expect(result).toBe('success1');

      expect(approvalController.has({ origin: 'bar.baz' })).toBe(false);
    });
  });

  describe('clear', () => {
    it('does nothing if state is already empty', () => {
      expect(() =>
        approvalController.clear(new JsonRpcError(1, 'clear')),
      ).not.toThrow();
    });

    it('deletes existing entries', async () => {
      const rejectSpy = jest.spyOn(approvalController, 'reject');

      approvalController
        .add({ id: 'foo2', origin: 'bar.baz', type: 'myType' })
        .catch((_error) => undefined);

      approvalController
        .add({ id: 'foo3', origin: 'fizz.buzz', type: 'myType' })
        .catch((_error) => undefined);

      approvalController.clear(new JsonRpcError(1, 'clear'));

      expect(
        approvalController.state[PENDING_APPROVALS_STORE_KEY],
      ).toStrictEqual({});
      expect(rejectSpy).toHaveBeenCalledTimes(2);
    });

    it('rejects existing entries with a caller-specified error', async () => {
      const rejectPromise = approvalController.add({
        id: 'foo2',
        origin: 'bar.baz',
        type: 'myType',
      });

      approvalController.clear(new JsonRpcError(1000, 'foo'));
      await expect(rejectPromise).rejects.toThrow(
        new JsonRpcError(1000, 'foo'),
      );
    });

    it('does not clear approval flows', async () => {
      approvalController.startFlow();

      approvalController.clear(new JsonRpcError(1, 'clear'));

      expect(approvalController.state[APPROVAL_FLOWS_STORE_KEY]).toHaveLength(
        1,
      );
    });
  });

  describe('updateRequestState', () => {
    it('updates the request state of a given approval request', () => {
      approvalController
        .add({
          id: 'foo2',
          origin: 'bar.baz',
          type: 'myType',
          requestState: { foo: 'bar' },
        })
        .catch((_error) => undefined);

      approvalController.updateRequestState({
        id: 'foo2',
        requestState: { foo: 'foobar' },
      });

      expect(approvalController.get('foo2')?.requestState).toStrictEqual({
        foo: 'foobar',
      });
    });

    it('throws on unknown id', () => {
      expect(() =>
        approvalController.updateRequestState({
          id: 'foo',
          requestState: { foo: 'bar' },
        }),
      ).toThrow(getIdNotFoundError('foo'));
    });
  });

  describe('actions', () => {
    it('addApprovalRequest: shouldShowRequest = true', async () => {
      const messenger = new ControllerMessenger<
        ApprovalControllerActions,
        ApprovalControllerEvents
      >();

      approvalController = new ApprovalController({
        messenger: messenger.getRestricted({
          name: controllerName,
          allowedActions: [],
          allowedEvents: [],
        }),
        showApprovalRequest,
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      messenger.call(
        'ApprovalController:addRequest',
        { id: 'foo', origin: 'bar.baz', type: TYPE },
        true,
      );
      expect(showApprovalRequest).toHaveBeenCalledTimes(1);
      expect(approvalController.has({ id: 'foo' })).toBe(true);
    });

    it('addApprovalRequest: shouldShowRequest = false', async () => {
      const messenger = new ControllerMessenger<
        ApprovalControllerActions,
        ApprovalControllerEvents
      >();

      approvalController = new ApprovalController({
        messenger: messenger.getRestricted({
          name: controllerName,
          allowedActions: [],
          allowedEvents: [],
        }),
        showApprovalRequest,
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      messenger.call(
        'ApprovalController:addRequest',
        { id: 'foo', origin: 'bar.baz', type: TYPE },
        false,
      );
      expect(showApprovalRequest).toHaveBeenCalledTimes(0);
      expect(approvalController.has({ id: 'foo' })).toBe(true);
    });

    it('updateRequestState', () => {
      const messenger = new ControllerMessenger<
        ApprovalControllerActions,
        ApprovalControllerEvents
      >();

      approvalController = new ApprovalController({
        messenger: messenger.getRestricted({
          name: controllerName,
          allowedActions: [],
          allowedEvents: [],
        }),
        showApprovalRequest,
      });

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.add({
        id: 'foo',
        origin: 'bar.baz',
        type: 'type1',
        requestState: { foo: 'bar' },
      });

      messenger.call('ApprovalController:updateRequestState', {
        id: 'foo',
        requestState: { foo: 'foobar' },
      });

      expect(approvalController.get('foo')?.requestState).toStrictEqual({
        foo: 'foobar',
      });
    });
  });

  describe('startFlow', () => {
    it.each([
      ['no options passed', undefined],
      ['partial options passed', {}],
      ['options passed', { id: 'id', loadingText: 'loadingText' }],
    ])(
      'adds flow to state and calls showApprovalRequest with %s',
      (_, opts?: StartFlowOptions) => {
        const result = approvalController.startFlow(opts);

        const expectedFlow = {
          // We're not making an assertion conditionally, we're using a helper.
          // eslint-disable-next-line jest/no-conditional-expect
          id: opts?.id ?? expect.any(String),
          loadingText: opts?.loadingText ?? null,
        };
        expect(result).toStrictEqual(expectedFlow);
        expect(showApprovalRequest).toHaveBeenCalledTimes(1);
        expect(approvalController.state[APPROVAL_FLOWS_STORE_KEY]).toHaveLength(
          1,
        );
        expect(
          approvalController.state[APPROVAL_FLOWS_STORE_KEY][0],
        ).toStrictEqual(expectedFlow);
      },
    );

    it('does not call showApprovalRequest if show is false', () => {
      const result = approvalController.startFlow({ show: false });

      const expectedFlow = {
        id: expect.any(String),
        loadingText: null,
      };
      expect(result).toStrictEqual(expectedFlow);
      expect(showApprovalRequest).toHaveBeenCalledTimes(0);
      expect(approvalController.state[APPROVAL_FLOWS_STORE_KEY]).toHaveLength(
        1,
      );
      expect(
        approvalController.state[APPROVAL_FLOWS_STORE_KEY][0],
      ).toStrictEqual(expectedFlow);
    });
  });

  describe('endFlow', () => {
    it('fails to end flow if no flow exists', () => {
      expect(() => approvalController.endFlow({ id: 'id' })).toThrow(
        NoApprovalFlowsError,
      );
    });

    it('fails to end flow if id does not correspond the current flow', () => {
      approvalController.startFlow({ id: 'id' });

      expect(() => approvalController.endFlow({ id: 'wrong-id' })).toThrow(
        EndInvalidFlowError,
      );
    });

    it('ends flow if id corresponds with the current flow', () => {
      approvalController.startFlow({ id: 'id' });

      approvalController.endFlow({ id: 'id' });

      expect(approvalController.state[APPROVAL_FLOWS_STORE_KEY]).toHaveLength(
        0,
      );
    });
  });

  describe('setFlowLoadingText', () => {
    const flowId = 'flowId';

    beforeEach(() => {
      approvalController.startFlow({ id: flowId });
    });

    afterEach(() => {
      approvalController.endFlow({ id: flowId });
    });

    it('fails to set flow loading text if the flow id does not exist', () => {
      expect(() =>
        approvalController.setFlowLoadingText({
          id: 'wrongId',
          loadingText: null,
        }),
      ).toThrow(MissingApprovalFlowError);
    });

    it('changes the loading text for the approval flow', () => {
      const mockLoadingText = 'Mock Loading Text';
      approvalController.setFlowLoadingText({
        id: flowId,
        loadingText: mockLoadingText,
      });

      expect(
        approvalController.state[APPROVAL_FLOWS_STORE_KEY].find(
          (flow) => flow.id === flowId,
        )?.loadingText,
      ).toStrictEqual(mockLoadingText);
    });

    it('sets the loading text back to null for the approval the flow', () => {
      approvalController.setFlowLoadingText({ id: flowId, loadingText: null });

      expect(
        approvalController.state[APPROVAL_FLOWS_STORE_KEY].find(
          (flow) => flow.id === flowId,
        )?.loadingText,
      ).toBeNull();
    });
  });

  describe('result', () => {
    /**
     * Assert that an approval request has been added.
     *
     * @param expectedType - The expected approval type.
     * @param expectedData - The expected request data.
     */
    function expectRequestAdded(
      expectedType: string,
      expectedData: Record<string, unknown>,
    ) {
      const requests = approvalController.state[PENDING_APPROVALS_STORE_KEY];
      expect(Object.values(requests)).toHaveLength(1);

      const request = Object.values(requests)[0];
      expect(request.id).toStrictEqual(expect.any(String));
      expect(request.requestData).toStrictEqual(expectedData);

      expect(approvalController.has({ id: request.id })).toBe(true);
      expect(approvalController.has({ origin: ORIGIN_METAMASK })).toBe(true);
      expect(approvalController.has({ type: expectedType })).toBe(true);
    }

    /**
     * Test template to verify that a result method ends the specified flow once approved.
     *
     * @param methodCallback - A callback to invoke the result method.
     */
    async function endsSpecifiedFlowTemplate(
      methodCallback: (flowId: string) => Promise<unknown>,
    ) {
      approvalController.startFlow({ id: FLOW_ID_MOCK });

      const promise = methodCallback(FLOW_ID_MOCK);

      const resultRequestId = Object.values(
        approvalController.state[PENDING_APPROVALS_STORE_KEY],
      )[0].id;

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept(resultRequestId);
      await promise;

      expect(approvalController.state[APPROVAL_FLOWS_STORE_KEY]).toHaveLength(
        0,
      );
    }

    /**
     * Test template to verify that a result does not throw if adding the request fails.
     *
     * @param methodCallback - A callback to invoke the result method.
     */
    async function doesNotThrowIfAddingRequestFails(
      methodCallback: () => Promise<unknown>,
    ) {
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      methodCallback();

      // Second call will fail as mocked nanoid will generate the same ID.
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      methodCallback();

      expect(console.info).toHaveBeenCalledTimes(1);
      expect(console.info).toHaveBeenCalledWith(
        'Failed to display result page',
        expect.objectContaining({
          message: `Approval request with id '${ID_MOCK}' already exists.`,
        }),
      );
    }

    /**
     * Test template to verify that a result method does not throw if ending the flow fails.
     *
     * @param methodCallback - A callback to invoke the result method.
     */
    async function doesNotThrowIfEndFlowFails(
      methodCallback: () => Promise<unknown>,
    ) {
      const promise = methodCallback();

      const resultRequestId = Object.values(
        approvalController.state[PENDING_APPROVALS_STORE_KEY],
      )[0].id;

      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      approvalController.accept(resultRequestId);
      await promise;

      expect(console.info).toHaveBeenCalledTimes(1);
      expect(console.info).toHaveBeenCalledWith('Failed to end flow', {
        error: expect.objectContaining({ message: 'No approval flows found.' }),
        id: FLOW_ID_MOCK,
      });
    }

    describe('success', () => {
      it('adds request with result success approval type', async () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        approvalController.success(SUCCESS_OPTIONS_MOCK);
        expectRequestAdded(APPROVAL_TYPE_RESULT_SUCCESS, SUCCESS_OPTIONS_MOCK);
      });

      it('adds request with no options', async () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        approvalController.success();

        expectRequestAdded(APPROVAL_TYPE_RESULT_SUCCESS, {
          message: undefined,
          header: undefined,
          title: undefined,
          icon: undefined,
        });
      });

      it('only includes relevant options in request data', async () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        approvalController.success({
          ...SUCCESS_OPTIONS_MOCK,
          extra: 'testValue',
        } as SuccessOptions);

        const { requestData } = Object.values(
          approvalController.state[PENDING_APPROVALS_STORE_KEY],
        )[0];

        expect(requestData).toStrictEqual(SUCCESS_OPTIONS_MOCK);
      });

      it('shows approval request', async () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        approvalController.success(SUCCESS_OPTIONS_MOCK);
        expect(showApprovalRequest).toHaveBeenCalledTimes(1);
      });

      it('ends specified flow', async () => {
        await endsSpecifiedFlowTemplate((flowId) =>
          approvalController.success({
            ...SUCCESS_OPTIONS_MOCK,
            flowToEnd: flowId,
          }),
        );
      });

      it('does not throw if adding request fails', async () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        doesNotThrowIfAddingRequestFails(() =>
          approvalController.success(SUCCESS_OPTIONS_MOCK),
        );
      });

      it('does not throw if ending the flow fails', async () => {
        await doesNotThrowIfEndFlowFails(() =>
          approvalController.success({
            ...SUCCESS_OPTIONS_MOCK,
            flowToEnd: FLOW_ID_MOCK,
          }),
        );
      });
    });

    describe('error', () => {
      it('adds request with result error approval type', async () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        approvalController.error(ERROR_OPTIONS_MOCK);
        expectRequestAdded(APPROVAL_TYPE_RESULT_ERROR, ERROR_OPTIONS_MOCK);
      });

      it('adds request with no options', async () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        approvalController.error();

        expectRequestAdded(APPROVAL_TYPE_RESULT_ERROR, {
          error: undefined,
          header: undefined,
          title: undefined,
          icon: undefined,
        });
      });

      it('only includes relevant options in request data', async () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        approvalController.error({
          ...ERROR_OPTIONS_MOCK,
          extra: 'testValue',
        } as ErrorOptions);

        const { requestData } = Object.values(
          approvalController.state[PENDING_APPROVALS_STORE_KEY],
        )[0];

        expect(requestData).toStrictEqual(ERROR_OPTIONS_MOCK);
      });

      it('shows approval request', async () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        approvalController.error(ERROR_OPTIONS_MOCK);
        expect(showApprovalRequest).toHaveBeenCalledTimes(1);
      });

      it('ends specified flow', async () => {
        await endsSpecifiedFlowTemplate((flowId) =>
          approvalController.error({
            ...ERROR_OPTIONS_MOCK,
            flowToEnd: flowId,
          }),
        );
      });

      it('does not throw if adding request fails', async () => {
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        doesNotThrowIfAddingRequestFails(() =>
          approvalController.error(ERROR_OPTIONS_MOCK),
        );
      });

      it('does not throw if ending the flow fails', async () => {
        await doesNotThrowIfEndFlowFails(() =>
          approvalController.error({
            ...ERROR_OPTIONS_MOCK,
            flowToEnd: FLOW_ID_MOCK,
          }),
        );
      });
    });
  });
});
