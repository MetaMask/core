import { errorCodes } from 'eth-rpc-errors';
import ApprovalController from '../dist/approval/ApprovalController';

const sinon = require('sinon');

const STORE_KEY = 'pendingApprovals';

const DEFAULT_TYPE = 'DEFAULT_TYPE';

const defaultConfig = {
  defaultApprovalType: DEFAULT_TYPE,
  showApprovalRequest: () => undefined,
};

describe('approval controller', () => {
  const clock = sinon.useFakeTimers(1);
  afterAll(() => clock.restore());

  describe('add', () => {
    let approvalController: ApprovalController;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
    });

    it('adds correctly specified entry', () => {
      expect(() => approvalController.add({ id: 'foo', origin: 'bar.baz' })).not.toThrow();

      expect(approvalController.has({ id: 'foo' })).toEqual(true);
      expect(approvalController.state[STORE_KEY]).toEqual({
        foo: { id: 'foo', origin: 'bar.baz', time: 1, type: DEFAULT_TYPE },
      });
    });

    it('adds id if non provided', () => {
      expect(() => approvalController.add({ id: undefined, origin: 'bar.baz' })).not.toThrow();

      const id = Object.keys(approvalController.state[STORE_KEY])[0];
      expect(id && typeof id === 'string').toBeTruthy();
    });

    it('adds correctly specified entry with custom type', () => {
      expect(() => approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' })).not.toThrow();

      expect(approvalController.has({ id: 'foo' })).toEqual(true);
      expect(approvalController.has({ origin: 'bar.baz', type: 'myType' })).toEqual(true);
      expect(approvalController.state[STORE_KEY]).toEqual({
        foo: { id: 'foo', origin: 'bar.baz', type: 'myType', time: 1 },
      });
    });

    it('adds correctly specified entry with request data', () => {
      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: undefined,
          requestData: { foo: 'bar' },
        }),
      ).not.toThrow();

      expect(approvalController.has({ id: 'foo' })).toEqual(true);
      expect(approvalController.has({ origin: 'bar.baz' })).toEqual(true);
      expect(approvalController.state[STORE_KEY].foo.requestData).toEqual({ foo: 'bar' });
    });

    it('adds multiple entries for same origin with different types and ids', () => {
      const ORIGIN = 'bar.baz';

      expect(() => approvalController.add({ id: 'foo1', origin: ORIGIN })).not.toThrow();
      expect(() => approvalController.add({ id: 'foo2', origin: ORIGIN, type: 'myType1' })).not.toThrow();
      expect(() => approvalController.add({ id: 'foo3', origin: ORIGIN, type: 'myType2' })).not.toThrow();

      expect(
        approvalController.has({ id: 'foo1' }) &&
          approvalController.has({ id: 'foo3' }) &&
          approvalController.has({ id: 'foo3' }),
      ).toEqual(true);
      expect(
        approvalController.has({ origin: ORIGIN }) &&
          approvalController.has({ origin: ORIGIN, type: 'myType1' }) &&
          approvalController.has({ origin: ORIGIN, type: 'myType2' }),
      ).toEqual(true);
    });

    it('throws on id collision', () => {
      expect(() => approvalController.add({ id: 'foo', origin: 'bar.baz' })).not.toThrow();

      expect(() => approvalController.add({ id: 'foo', origin: 'fizz.buzz' })).toThrow(getIdCollisionError('foo'));
    });

    it('throws on origin and default type collision', () => {
      expect(() => approvalController.add({ id: 'foo', origin: 'bar.baz' })).not.toThrow();

      expect(() => approvalController.add({ id: 'foo1', origin: 'bar.baz' })).toThrow(
        getOriginTypeCollisionError('bar.baz'),
      );
    });

    it('throws on origin and custom type collision', () => {
      expect(() => approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' })).not.toThrow();

      expect(() => approvalController.add({ id: 'foo1', origin: 'bar.baz', type: 'myType' })).toThrow(
        getOriginTypeCollisionError('bar.baz', 'myType'),
      );
    });
  });

  // otherwise tested by 'add' above
  describe('addAndShowApprovalRequest', () => {
    it('addAndShowApprovalRequest', () => {
      const showApprovalSpy = sinon.spy();
      const approvalController = new ApprovalController({
        ...defaultConfig,
        showApprovalRequest: showApprovalSpy,
      });

      const result = approvalController.addAndShowApprovalRequest({
        id: 'foo',
        origin: 'bar.baz',
        type: 'myType',
        requestData: { foo: 'bar' },
      });
      expect(result instanceof Promise).toEqual(true);
      expect(showApprovalSpy.calledOnce).toEqual(true);
    });
  });

  describe('get', () => {
    let approvalController: ApprovalController;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
    });

    it('gets entry with default type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      expect(approvalController.get('foo')).toEqual({ id: 'foo', origin: 'bar.baz', time: 1, type: DEFAULT_TYPE });
    });

    it('gets entry with custom type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      expect(approvalController.get('foo')).toEqual({ id: 'foo', origin: 'bar.baz', type: 'myType', time: 1 });
    });
  });

  describe('getApprovalCount', () => {
    let approvalController: ApprovalController;
    let addWithCatch: (args: any) => void;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
      addWithCatch = (args: any) => approvalController.add(args).catch(() => undefined);
    });

    it('gets the count when specifying origin and type', () => {
      addWithCatch({ id: '1', origin: 'origin1' });
      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });

      expect(approvalController.getApprovalCount({ origin: 'origin1', type: DEFAULT_TYPE })).toEqual(1);
      expect(approvalController.getApprovalCount({ origin: 'origin1', type: 'type1' })).toEqual(1);
      expect(approvalController.getApprovalCount({ origin: 'origin1', type: 'type2' })).toEqual(0);

      expect(approvalController.getApprovalCount({ origin: 'origin2', type: DEFAULT_TYPE })).toEqual(0);
      expect(approvalController.getApprovalCount({ origin: 'origin2', type: 'type1' })).toEqual(1);
      expect(approvalController.getApprovalCount({ origin: 'origin2', type: 'type2' })).toEqual(0);

      expect(approvalController.getApprovalCount({ origin: 'origin3', type: DEFAULT_TYPE })).toEqual(0);
      expect(approvalController.getApprovalCount({ origin: 'origin3', type: 'type1' })).toEqual(0);
      expect(approvalController.getApprovalCount({ origin: 'origin3', type: 'type2' })).toEqual(0);
    });

    it('gets the count when specifying origin only', () => {
      addWithCatch({ id: '1', origin: 'origin1' });
      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });

      expect(approvalController.getApprovalCount({ origin: 'origin1' })).toEqual(2);

      expect(approvalController.getApprovalCount({ origin: 'origin2' })).toEqual(1);

      expect(approvalController.getApprovalCount({ origin: 'origin3' })).toEqual(0);
    });

    it('gets the count when specifying type only', () => {
      addWithCatch({ id: '1', origin: 'origin1' });
      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });
      addWithCatch({ id: '4', origin: 'origin2', type: 'type2' });

      expect(approvalController.getApprovalCount({ type: DEFAULT_TYPE })).toEqual(1);

      expect(approvalController.getApprovalCount({ type: 'type1' })).toEqual(2);

      expect(approvalController.getApprovalCount({ type: 'type2' })).toEqual(1);

      expect(approvalController.getApprovalCount({ type: 'type3' })).toEqual(0);
    });
  });

  describe('getTotalApprovalCount', () => {
    it('gets the total approval count', () => {
      const approvalController = new ApprovalController({ ...defaultConfig });
      expect(approvalController.getTotalApprovalCount()).toEqual(0);

      const addWithCatch = (args: any) => approvalController.add(args).catch(() => undefined);

      addWithCatch({ id: '1', origin: 'origin1' });
      expect(approvalController.getTotalApprovalCount()).toEqual(1);

      addWithCatch({ id: '2', origin: 'origin1', type: 'type1' });
      expect(approvalController.getTotalApprovalCount()).toEqual(2);

      addWithCatch({ id: '3', origin: 'origin2', type: 'type1' });
      expect(approvalController.getTotalApprovalCount()).toEqual(3);

      approvalController.reject('2', new Error('foo'));
      expect(approvalController.getTotalApprovalCount()).toEqual(2);

      approvalController.clear();
      expect(approvalController.getTotalApprovalCount()).toEqual(0);
    });
  });

  describe('has', () => {
    let approvalController: ApprovalController;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
    });

    it('returns true for existing entry by id', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      expect(approvalController.has({ id: 'foo' })).toEqual(true);
    });

    it('returns true for existing entry by origin', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      expect(approvalController.has({ origin: 'bar.baz' })).toEqual(true);
    });

    it('returns true for existing entry by origin and custom type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      expect(approvalController.has({ origin: 'bar.baz', type: 'myType' })).toEqual(true);
    });

    it('returns true for existing default type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      expect(approvalController.has({ type: approvalController.defaultApprovalType })).toEqual(true);
    });

    it('returns true for existing custom type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      expect(approvalController.has({ type: 'myType' })).toEqual(true);
    });

    it('returns false for non-existing entry by id', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      expect(approvalController.has({ id: 'fizz' })).toEqual(false);
    });

    it('returns false for non-existing entry by origin', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      expect(approvalController.has({ origin: 'fizz.buzz' })).toEqual(false);
    });

    it('returns false for non-existing entry by existing origin and non-existing type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      expect(approvalController.has({ origin: 'bar.baz', type: 'myType' })).toEqual(false);
    });

    it('returns false for non-existing entry by non-existing origin and existing type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      expect(approvalController.has({ origin: 'fizz.buzz', type: 'myType' })).toEqual(false);
    });

    it('returns false for non-existing entry by default type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      expect(approvalController.has({ type: approvalController.defaultApprovalType })).toEqual(false);
    });

    it('returns false for non-existing entry by custom type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      expect(approvalController.has({ type: 'myType' })).toEqual(false);
    });
  });

  describe('resolve', () => {
    let approvalController: ApprovalController;
    let numDeletions: number;
    let deleteSpy: typeof sinon.spy;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
      deleteSpy = sinon.spy(approvalController, '_delete');
      numDeletions = 0;
    });

    it('resolves approval promise', async () => {
      numDeletions = 1;

      const approvalPromise = approvalController.add({ id: 'foo', origin: 'bar.baz' });
      approvalController.resolve('foo', 'success');

      const result = await approvalPromise;
      expect(result).toEqual('success');
      expect(deleteSpy.callCount).toEqual(numDeletions);
    });

    it('resolves multiple approval promises out of order', async () => {
      numDeletions = 2;

      const approvalPromise1 = approvalController.add({ id: 'foo1', origin: 'bar.baz' });
      const approvalPromise2 = approvalController.add({ id: 'foo2', origin: 'bar.baz', type: 'myType2' });

      approvalController.resolve('foo2', 'success2');

      let result = await approvalPromise2;
      expect(result).toEqual('success2');

      approvalController.resolve('foo1', 'success1');

      result = await approvalPromise1;
      expect(result).toEqual('success1');
      expect(deleteSpy.callCount).toEqual(numDeletions);
    });

    it('throws on unknown id', () => {
      expect(() => approvalController.resolve('foo')).toThrow(getIdNotFoundError('foo'));
      expect(deleteSpy.callCount).toEqual(numDeletions);
    });
  });

  describe('reject', () => {
    let approvalController: ApprovalController;
    let numDeletions: number;
    let deleteSpy: typeof sinon.spy;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
      deleteSpy = sinon.spy(approvalController, '_delete');
      numDeletions = 0;
    });

    it('rejects approval promise', async () => {
      numDeletions = 1;

      const approvalPromise = approvalController.add({ id: 'foo', origin: 'bar.baz' }).catch((error) => {
        expect(error).toMatchObject(getError('failure'));
      });

      approvalController.reject('foo', new Error('failure'));
      await approvalPromise;
      expect(deleteSpy.callCount).toEqual(numDeletions);
    });

    it('rejects multiple approval promises out of order', async () => {
      numDeletions = 2;

      const rejectionPromise1 = approvalController.add({ id: 'foo1', origin: 'bar.baz' }).catch((error) => {
        expect(error).toMatchObject(getError('failure1'));
      });
      const rejectionPromise2 = approvalController
        .add({ id: 'foo2', origin: 'bar.baz', type: 'myType2' })
        .catch((error) => {
          expect(error).toMatchObject(getError('failure2'));
        });

      approvalController.reject('foo2', new Error('failure2'));
      await rejectionPromise2;

      approvalController.reject('foo1', new Error('failure1'));
      await rejectionPromise1;
      expect(deleteSpy.callCount).toEqual(numDeletions);
    });

    it('throws on unknown id', () => {
      expect(() => approvalController.reject('foo', new Error('bar'))).toThrow(getIdNotFoundError('foo'));
      expect(deleteSpy.callCount).toEqual(numDeletions);
    });
  });

  describe('resolve and reject', () => {
    it('resolves and rejects multiple approval promises out of order', async () => {
      const approvalController = new ApprovalController({ ...defaultConfig });

      const promise1 = approvalController.add({ id: 'foo1', origin: 'bar.baz' });
      const promise2 = approvalController.add({ id: 'foo2', origin: 'bar.baz', type: 'myType2' });
      const promise3 = approvalController.add({ id: 'foo3', origin: 'fizz.buzz' }).catch((error) => {
        expect(error).toMatchObject(getError('failure3'));
      });
      const promise4 = approvalController.add({ id: 'foo4', origin: 'bar.baz', type: 'myType4' }).catch((error) => {
        expect(error).toMatchObject(getError('failure4'));
      });

      approvalController.resolve('foo2', 'success2');

      let result = await promise2;
      expect(result).toEqual('success2');

      approvalController.reject('foo4', new Error('failure4'));
      await promise4;

      approvalController.reject('foo3', new Error('failure3'));
      await promise3;

      expect(approvalController.has({ origin: 'fizz.buzz' })).toEqual(false);
      expect(approvalController.has({ origin: 'bar.baz' })).toEqual(true);

      approvalController.resolve('foo1', 'success1');

      result = await promise1;
      expect(result).toEqual('success1');

      expect(approvalController.has({ origin: 'bar.baz' })).toEqual(false);
    });
  });

  describe('clear', () => {
    let approvalController: ApprovalController;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
    });

    it('does nothing if state is already empty', () => {
      expect(() => approvalController.clear()).not.toThrow();
    });

    it('deletes existing entries', async () => {
      const rejectSpy = sinon.spy(approvalController, 'reject');

      approvalController.add({ id: 'foo1', origin: 'bar.baz' }).catch((_error) => undefined);
      approvalController.add({ id: 'foo2', origin: 'bar.baz', type: 'myType' }).catch((_error) => undefined);
      approvalController.add({ id: 'foo3', origin: 'fizz.buzz', type: 'myType' }).catch((_error) => undefined);

      approvalController.clear();

      expect(approvalController.state[STORE_KEY]).toEqual({});
      expect(rejectSpy.callCount).toEqual(3);
    });
  });
});

// helpers

function getIdCollisionError(id: string) {
  return getError(`Approval with id '${id}' already exists.`, errorCodes.rpc.internal);
}

function getOriginTypeCollisionError(origin: string, type = DEFAULT_TYPE) {
  const message = `Request of type "${type}" already pending for origin ${origin}. Please wait.`;
  return getError(message, errorCodes.rpc.resourceUnavailable);
}

function getIdNotFoundError(id: string) {
  return getError(`Approval with id '${id}' not found.`);
}

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
