import { errorCodes } from 'eth-rpc-errors';
import sinon from 'sinon';
import { ControllerMessenger } from '../ControllerMessenger';
import {
  ApprovalController,
  ApprovalControllerActions,
  ApprovalControllerEvents,
  ApprovalControllerMessenger,
} from './ApprovalController';

const STORE_KEY = 'pendingApprovals';

const TYPE = 'TYPE';

const controllerName = 'ApprovalController';

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
  const clock = sinon.useFakeTimers(1);
  afterAll(() => clock.restore());

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

    it('adds correctly specified entry', () => {
      expect(() =>
        approvalController.add({ id: 'foo', origin: 'bar.baz', type: TYPE }),
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
          time: 1,
          type: TYPE,
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
      expect(
        approvalController.state[STORE_KEY].foo.requestData,
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
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });
      expect(approvalController.get('foo')).toStrictEqual({
        id: 'foo',
        origin: 'bar.baz',
        requestData: null,
        type: 'myType',
        time: 1,
      });
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

      approvalController.clear();
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
      expect(() => approvalController.clear()).not.toThrow();
    });

    it('deletes existing entries', async () => {
      const rejectSpy = sinon.spy(approvalController, 'reject');

      approvalController
        .add({ id: 'foo2', origin: 'bar.baz', type: 'myType' })
        .catch((_error) => undefined);
      approvalController
        .add({ id: 'foo3', origin: 'fizz.buzz', type: 'myType' })
        .catch((_error) => undefined);

      approvalController.clear();

      expect(approvalController.state[STORE_KEY]).toStrictEqual({});
      expect(rejectSpy.callCount).toStrictEqual(2);
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
  });
});

// helpers

function getIdCollisionError(id: string) {
  return getError(
    `Approval request with id '${id}' already exists.`,
    errorCodes.rpc.internal,
  );
}

function getOriginTypeCollisionError(origin: string, type = TYPE) {
  const message = `Request of type '${type}' already pending for origin ${origin}. Please wait.`;
  return getError(message, errorCodes.rpc.resourceUnavailable);
}

function getIdNotFoundError(id: string) {
  return getError(`Approval request with id '${id}' not found.`);
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
