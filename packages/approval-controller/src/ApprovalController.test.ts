import { errorCodes, EthereumRpcError } from 'eth-rpc-errors';
import * as sinon from 'sinon';
import { ControllerMessenger } from '@metamask/base-controller';
import {
  ApprovalController,
  ApprovalControllerActions,
  ApprovalControllerEvents,
  ApprovalControllerMessenger,
} from './ApprovalController';
import { ApprovalRequestNoResultSupportError } from './errors';

const STORE_KEY = 'pendingApprovals';
const TYPE = 'TYPE';
const ID_MOCK = 'TestId';
const ORIGIN_MOCK = 'TestOrigin';
const VALUE_MOCK = 'TestValue';
const RESULT_MOCK = 'TestResult';
const ERROR_MOCK = new Error('TestError');

const controllerName = 'ApprovalController';

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
  const messenger = controllerMessenger.getRestricted<
    typeof controllerName,
    never,
    never
  >({
    name: 'ApprovalController',
  });
  return messenger;
}

describe('approval controller', () => {
  beforeEach(() => {
    sinon.useFakeTimers(1);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('add', () => {
    let approvalController: ApprovalController;
    let showApprovalRequest: sinon.SinonSpy;

    beforeEach(() => {
      showApprovalRequest = sinon.spy();
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest,
      });
    });

    it('validates input', () => {
      expect(() =>
        approvalController.add({ id: null, origin: 'bar.baz' } as any),
      ).toThrow(getInvalidIdError());

      expect(() => approvalController.add({ id: 'foo' } as any)).toThrow(
        getInvalidOriginError(),
      );

      expect(() =>
        approvalController.add({ id: 'foo', origin: true } as any),
      ).toThrow(getInvalidOriginError());

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: {},
        } as any),
      ).toThrow(getInvalidTypeError(errorCodes.rpc.internal));

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: '',
        } as any),
      ).toThrow(getInvalidTypeError(errorCodes.rpc.internal));

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: 'type',
          requestData: 'foo',
        } as any),
      ).toThrow(getInvalidRequestDataError());

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: 'type',
          requestState: 'foo',
        } as any),
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

      expect(approvalController.has({ id: 'foo' })).toStrictEqual(true);

      expect(
        approvalController.has({ origin: 'bar.baz', type: TYPE }),
      ).toStrictEqual(true);

      expect(approvalController.state[STORE_KEY]).toStrictEqual({
        foo: {
          id: 'foo',
          origin: 'bar.baz',
          requestData: null,
          requestState: null,
          time: 1,
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

      const id = Object.keys(approvalController.state[STORE_KEY])[0];
      expect(id && typeof id === 'string').toStrictEqual(true);
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

      expect(approvalController.has({ id: 'foo' })).toStrictEqual(true);
      expect(approvalController.has({ origin: 'bar.baz' })).toStrictEqual(true);
      expect(approvalController.has({ type: 'myType' })).toStrictEqual(true);
      expect(approvalController.state[STORE_KEY].foo.requestData).toStrictEqual(
        { foo: 'bar' },
      );
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

      expect(approvalController.has({ id: 'foo' })).toStrictEqual(true);
      expect(approvalController.has({ origin: 'bar.baz' })).toStrictEqual(true);
      expect(approvalController.has({ type: 'myType' })).toStrictEqual(true);
      expect(
        approvalController.state[STORE_KEY].foo.requestState,
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
      ).toStrictEqual(true);

      expect(
        approvalController.has({ origin: ORIGIN }) &&
          approvalController.has({ origin: ORIGIN, type: 'myType1' }) &&
          approvalController.has({ origin: ORIGIN, type: 'myType2' }),
      ).toStrictEqual(true);
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
      const showApprovalSpy = sinon.spy();
      const approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: showApprovalSpy,
      });

      const result = approvalController.addAndShowApprovalRequest({
        id: 'foo',
        origin: 'bar.baz',
        type: 'myType',
        requestData: { foo: 'bar' },
      });
      expect(result instanceof Promise).toStrictEqual(true);
      expect(showApprovalSpy.calledOnce).toStrictEqual(true);
    });
  });

  describe('get', () => {
    it('gets entry', () => {
      const approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });

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
        time: 1,
        expectsResult: true,
      });
    });

    it('returns undefined for non-existing entry', () => {
      const approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });

      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'type' });

      expect(approvalController.get('fizz')).toBeUndefined();

      expect((approvalController as any).get()).toBeUndefined();

      expect(approvalController.get({} as any)).toBeUndefined();
    });
  });

  describe('getApprovalCount', () => {
    let approvalController: ApprovalController;
    let addWithCatch: (args: any) => void;

    beforeEach(() => {
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });

      addWithCatch = (args: any) =>
        approvalController.add(args).catch(() => undefined);
    });

    it('validates input', () => {
      expect(() => approvalController.getApprovalCount()).toThrow(
        getApprovalCountParamsError(),
      );

      expect(() => approvalController.getApprovalCount({})).toThrow(
        getApprovalCountParamsError(),
      );

      expect(() =>
        approvalController.getApprovalCount({ origin: null } as any),
      ).toThrow(getApprovalCountParamsError());

      expect(() =>
        approvalController.getApprovalCount({ type: false } as any),
      ).toThrow(getApprovalCountParamsError());
    });

    it('gets the count when specifying origin and type', () => {
      addWithCatch({ id: '1', origin: 'origin1', type: TYPE });
      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });

      expect(
        approvalController.getApprovalCount({ origin: 'origin1', type: TYPE }),
      ).toStrictEqual(1);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin1',
          type: 'type1',
        }),
      ).toStrictEqual(1);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin1',
          type: 'type2',
        }),
      ).toStrictEqual(0);

      expect(
        approvalController.getApprovalCount({ origin: 'origin2', type: TYPE }),
      ).toStrictEqual(0);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin2',
          type: 'type1',
        }),
      ).toStrictEqual(1);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin2',
          type: 'type2',
        }),
      ).toStrictEqual(0);

      expect(
        approvalController.getApprovalCount({ origin: 'origin3', type: TYPE }),
      ).toStrictEqual(0);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin3',
          type: 'type1',
        }),
      ).toStrictEqual(0);

      expect(
        approvalController.getApprovalCount({
          origin: 'origin3',
          type: 'type2',
        }),
      ).toStrictEqual(0);
    });

    it('gets the count when specifying origin only', () => {
      addWithCatch({ id: '1', origin: 'origin1', type: 'type0' });
      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });

      expect(
        approvalController.getApprovalCount({ origin: 'origin1' }),
      ).toStrictEqual(2);

      expect(
        approvalController.getApprovalCount({ origin: 'origin2' }),
      ).toStrictEqual(1);

      expect(
        approvalController.getApprovalCount({ origin: 'origin3' }),
      ).toStrictEqual(0);
    });

    it('gets the count when specifying type only', () => {
      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });
      addWithCatch({ id: '4', origin: 'origin2', type: 'type2' });

      expect(
        approvalController.getApprovalCount({ type: 'type1' }),
      ).toStrictEqual(2);

      expect(
        approvalController.getApprovalCount({ type: 'type2' }),
      ).toStrictEqual(1);

      expect(
        approvalController.getApprovalCount({ type: 'type3' }),
      ).toStrictEqual(0);
    });

    it('gets the count when specifying origin and type with type excluded from rate limiting', () => {
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
        typesExcludedFromRateLimiting: [TYPE],
      });

      addWithCatch({ id: '1', origin: 'origin1', type: TYPE });
      addWithCatch({ id: '2', origin: 'origin1', type: TYPE });

      expect(
        approvalController.getApprovalCount({ origin: 'origin1', type: TYPE }),
      ).toStrictEqual(2);
    });
  });

  describe('getTotalApprovalCount', () => {
    it('gets the total approval count', () => {
      const approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });
      expect(approvalController.getTotalApprovalCount()).toStrictEqual(0);

      const addWithCatch = (args: any) =>
        approvalController.add(args).catch(() => undefined);

      addWithCatch({ id: '1', origin: 'origin1', type: 'type0' });
      expect(approvalController.getTotalApprovalCount()).toStrictEqual(1);

      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      expect(approvalController.getTotalApprovalCount()).toStrictEqual(2);

      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });
      expect(approvalController.getTotalApprovalCount()).toStrictEqual(3);

      approvalController.reject('2', new Error('foo'));
      expect(approvalController.getTotalApprovalCount()).toStrictEqual(2);

      approvalController.clear(new EthereumRpcError(1, 'clear'));
      expect(approvalController.getTotalApprovalCount()).toStrictEqual(0);
    });

    it('gets the total approval count with type excluded from rate limiting', () => {
      const approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
        typesExcludedFromRateLimiting: ['type0'],
      });
      expect(approvalController.getTotalApprovalCount()).toStrictEqual(0);

      const addWithCatch = (args: any) =>
        approvalController.add(args).catch(() => undefined);

      addWithCatch({ id: '1', origin: 'origin1', type: 'type0' });
      expect(approvalController.getTotalApprovalCount()).toStrictEqual(1);

      addWithCatch({ id: '2', origin: 'origin1', type: 'type0' });
      expect(approvalController.getTotalApprovalCount()).toStrictEqual(2);

      approvalController.reject('2', new Error('foo'));
      expect(approvalController.getTotalApprovalCount()).toStrictEqual(1);

      approvalController.clear(new EthereumRpcError(1, 'clear'));
      expect(approvalController.getTotalApprovalCount()).toStrictEqual(0);
    });
  });

  describe('has', () => {
    let approvalController: ApprovalController;

    beforeEach(() => {
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });
    });

    it('validates input', () => {
      expect(() => approvalController.has()).toThrow(
        getInvalidHasParamsError(),
      );

      expect(() => approvalController.has({})).toThrow(
        getInvalidHasParamsError(),
      );

      expect(() => approvalController.has({ id: true } as any)).toThrow(
        getInvalidHasIdError(),
      );

      expect(() => approvalController.has({ origin: true } as any)).toThrow(
        getInvalidHasOriginError(),
      );

      expect(() => approvalController.has({ type: true } as any)).toThrow(
        getInvalidHasTypeError(),
      );

      expect(() =>
        approvalController.has({ origin: 'foo', type: true } as any),
      ).toThrow(getInvalidHasTypeError());
    });

    it('returns true for existing entry by id', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: TYPE });

      expect(approvalController.has({ id: 'foo' })).toStrictEqual(true);
    });

    it('returns true for existing entry by origin', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: TYPE });

      expect(approvalController.has({ origin: 'bar.baz' })).toStrictEqual(true);
    });

    it('returns true for existing entry by origin and type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      expect(
        approvalController.has({ origin: 'bar.baz', type: 'myType' }),
      ).toStrictEqual(true);
    });

    it('returns true for existing type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      expect(approvalController.has({ type: 'myType' })).toStrictEqual(true);
    });

    it('returns false for non-existing entry by id', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: TYPE });

      expect(approvalController.has({ id: 'fizz' })).toStrictEqual(false);
    });

    it('returns false for non-existing entry by origin', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: TYPE });

      expect(approvalController.has({ origin: 'fizz.buzz' })).toStrictEqual(
        false,
      );
    });

    it('returns false for non-existing entry by existing origin and non-existing type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: TYPE });

      expect(
        approvalController.has({ origin: 'bar.baz', type: 'myType' }),
      ).toStrictEqual(false);
    });

    it('returns false for non-existing entry by non-existing origin and existing type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      expect(
        approvalController.has({ origin: 'fizz.buzz', type: 'myType' }),
      ).toStrictEqual(false);
    });

    it('returns false for non-existing entry by type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType1' });

      expect(approvalController.has({ type: 'myType2' })).toStrictEqual(false);
    });
  });

  describe('resolve', () => {
    let approvalController: ApprovalController;
    let numDeletions: number;
    let deleteSpy: sinon.SinonSpy;

    beforeEach(() => {
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });
      // TODO: Stop using private methods in tests
      deleteSpy = sinon.spy(approvalController as any, '_delete');
      numDeletions = 0;
    });

    it('resolves approval promise', async () => {
      numDeletions = 1;

      const approvalPromise = approvalController.add({
        id: 'foo',
        origin: 'bar.baz',
        type: 'myType',
      });
      approvalController.accept('foo', 'success');

      const result = await approvalPromise;
      expect(result).toStrictEqual('success');
      expect(deleteSpy.callCount).toStrictEqual(numDeletions);
    });

    it('resolves multiple approval promises out of order', async () => {
      numDeletions = 2;

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

      approvalController.accept('foo2', 'success2');

      let result = await approvalPromise2;
      expect(result).toStrictEqual('success2');

      approvalController.accept('foo1', 'success1');

      result = await approvalPromise1;
      expect(result).toStrictEqual('success1');
      expect(deleteSpy.callCount).toStrictEqual(numDeletions);
    });

    it('throws on unknown id', () => {
      expect(() => approvalController.accept('foo')).toThrow(
        getIdNotFoundError('foo'),
      );
      expect(deleteSpy.callCount).toStrictEqual(numDeletions);
    });
  });

  describe('reject', () => {
    let approvalController: ApprovalController;
    let numDeletions: number;
    let deleteSpy: sinon.SinonSpy;

    beforeEach(() => {
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });
      // TODO: Stop using private methods in tests
      deleteSpy = sinon.spy(approvalController as any, '_delete');
      numDeletions = 0;
    });

    it('rejects approval promise', async () => {
      numDeletions = 1;
      const approvalPromise = approvalController.add({
        id: 'foo',
        origin: 'bar.baz',
        type: TYPE,
      });
      approvalController.reject('foo', new Error('failure'));
      await expect(approvalPromise).rejects.toThrow('failure');
      expect(deleteSpy.callCount).toStrictEqual(numDeletions);
    });

    it('rejects multiple approval promises out of order', async () => {
      numDeletions = 2;

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
      expect(deleteSpy.callCount).toStrictEqual(numDeletions);
    });

    it('throws on unknown id', () => {
      expect(() => approvalController.reject('foo', new Error('bar'))).toThrow(
        getIdNotFoundError('foo'),
      );
      expect(deleteSpy.callCount).toStrictEqual(numDeletions);
    });
  });

  describe('accept', () => {
    it('resolves accept promise when success callback is called', async () => {
      const approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });

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
      const approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });

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
      const approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });

      const approvalPromise = approvalController.add({
        id: ID_MOCK,
        origin: ORIGIN_MOCK,
        type: TYPE,
        expectsResult: true,
      });

      approvalController.accept(ID_MOCK, VALUE_MOCK);

      expect(await approvalPromise).toStrictEqual({
        resultCallbacks: undefined,
        value: VALUE_MOCK,
      });
    });

    it('throws if accept wants to wait but request does not expect result', async () => {
      const approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });

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
  });

  describe('accept and reject', () => {
    it('accepts and rejects multiple approval promises out of order', async () => {
      const approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });

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

      approvalController.accept('foo2', 'success2');

      let result = await promise2;
      expect(result).toStrictEqual('success2');

      approvalController.reject('foo4', new Error('failure4'));
      await expect(promise4).rejects.toThrow('failure4');

      approvalController.reject('foo3', new Error('failure3'));
      await expect(promise3).rejects.toThrow('failure3');

      expect(approvalController.has({ origin: 'fizz.buzz' })).toStrictEqual(
        false,
      );
      expect(approvalController.has({ origin: 'bar.baz' })).toStrictEqual(true);

      approvalController.accept('foo1', 'success1');

      result = await promise1;
      expect(result).toStrictEqual('success1');

      expect(approvalController.has({ origin: 'bar.baz' })).toStrictEqual(
        false,
      );
    });
  });

  describe('clear', () => {
    let approvalController: ApprovalController;

    beforeEach(() => {
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });
    });

    it('does nothing if state is already empty', () => {
      expect(() =>
        approvalController.clear(new EthereumRpcError(1, 'clear')),
      ).not.toThrow();
    });

    it('deletes existing entries', async () => {
      const rejectSpy = sinon.spy(approvalController, 'reject');

      approvalController
        .add({ id: 'foo2', origin: 'bar.baz', type: 'myType' })
        .catch((_error) => undefined);

      approvalController
        .add({ id: 'foo3', origin: 'fizz.buzz', type: 'myType' })
        .catch((_error) => undefined);

      approvalController.clear(new EthereumRpcError(1, 'clear'));

      expect(approvalController.state[STORE_KEY]).toStrictEqual({});
      expect(rejectSpy.callCount).toStrictEqual(2);
    });

    it('rejects existing entries with a caller-specified error', async () => {
      const rejectPromise = approvalController.add({
        id: 'foo2',
        origin: 'bar.baz',
        type: 'myType',
      });

      approvalController.clear(new EthereumRpcError(1000, 'foo'));
      await expect(rejectPromise).rejects.toThrow(
        new EthereumRpcError(1000, 'foo'),
      );
    });
  });

  describe('updateRequestState', () => {
    let approvalController: ApprovalController;

    beforeEach(() => {
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });
    });

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

  // We test this internal function before resolve, reject, and clear because
  // they are heavily dependent upon it.
  // TODO: Stop using private methods in tests
  describe('_delete', () => {
    let approvalController: ApprovalController;

    beforeEach(() => {
      approvalController = new ApprovalController({
        messenger: getRestrictedMessenger(),
        showApprovalRequest: sinon.spy(),
      });
    });

    it('deletes entry', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'type' });

      (approvalController as any)._delete('foo');

      expect(
        !approvalController.has({ id: 'foo' }) &&
          !approvalController.has({ type: 'type' }) &&
          !approvalController.has({ origin: 'bar.baz' }) &&
          !approvalController.state[STORE_KEY].foo,
      ).toStrictEqual(true);
    });

    it('deletes one entry out of many without side-effects', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'type1' });
      approvalController.add({ id: 'fizz', origin: 'bar.baz', type: 'type2' });

      (approvalController as any)._delete('fizz');

      expect(
        !approvalController.has({ id: 'fizz' }) &&
          !approvalController.has({ origin: 'bar.baz', type: 'type2' }),
      ).toStrictEqual(true);

      expect(
        approvalController.has({ id: 'foo' }) &&
          approvalController.has({ origin: 'bar.baz' }),
      ).toStrictEqual(true);
    });
  });

  describe('actions', () => {
    it('addApprovalRequest: shouldShowRequest = true', async () => {
      const messenger = new ControllerMessenger<
        ApprovalControllerActions,
        ApprovalControllerEvents
      >();
      const showApprovalSpy = sinon.spy();

      const approvalController = new ApprovalController({
        messenger: messenger.getRestricted({
          name: controllerName,
        }) as ApprovalControllerMessenger,
        showApprovalRequest: showApprovalSpy,
      });

      messenger.call(
        'ApprovalController:addRequest',
        { id: 'foo', origin: 'bar.baz', type: TYPE },
        true,
      );
      expect(showApprovalSpy.calledOnce).toStrictEqual(true);
      expect(approvalController.has({ id: 'foo' })).toStrictEqual(true);
    });

    it('addApprovalRequest: shouldShowRequest = false', async () => {
      const messenger = new ControllerMessenger<
        ApprovalControllerActions,
        ApprovalControllerEvents
      >();
      const showApprovalSpy = sinon.spy();

      const approvalController = new ApprovalController({
        messenger: messenger.getRestricted({
          name: controllerName,
        }) as ApprovalControllerMessenger,
        showApprovalRequest: showApprovalSpy,
      });

      messenger.call(
        'ApprovalController:addRequest',
        { id: 'foo', origin: 'bar.baz', type: TYPE },
        false,
      );
      expect(showApprovalSpy.notCalled).toStrictEqual(true);
      expect(approvalController.has({ id: 'foo' })).toStrictEqual(true);
    });

    it('updateRequestState', () => {
      const messenger = new ControllerMessenger<
        ApprovalControllerActions,
        ApprovalControllerEvents
      >();

      const approvalController = new ApprovalController({
        messenger: messenger.getRestricted({
          name: controllerName,
        }) as ApprovalControllerMessenger,
        showApprovalRequest: sinon.spy(),
      });

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
});

// helpers

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
  const err: any = {
    name: 'Error',
    message,
  };
  if (code !== undefined) {
    err.code = code;
  }
  return err;
}
