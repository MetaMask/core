import ApprovalController from '../dist/approval/ApprovalController';

const assert = require('assert');
const { ERROR_CODES } = require('eth-rpc-errors');
const sinon = require('sinon');

const STORE_KEY = 'pendingApprovals';

const defaultConfig = { showApprovalRequest: () => undefined };

describe('approval controller', () => {
  describe('add', () => {
    let approvalController: ApprovalController;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
    });

    it('adds correctly specified entry', () => {
      expect(() => approvalController.add({ id: 'foo', origin: 'bar.baz' })).not.toThrow();

      expect(approvalController.has({ id: 'foo' })).toEqual(true);
      expect(approvalController.state[STORE_KEY]).toEqual({ foo: { id: 'foo', origin: 'bar.baz' } });
    });

    it('adds id if non provided', () => {
      assert.doesNotThrow(() => approvalController.add({ id: undefined, origin: 'bar.baz' }), 'should add entry');

      const id = Object.keys(approvalController.state[STORE_KEY])[0];
      assert.ok(id && typeof id === 'string', 'should have added entry with string id');
    });

    it('adds correctly specified entry with custom type', () => {
      assert.doesNotThrow(() => approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' }));

      assert.ok(approvalController.has({ id: 'foo' }), 'should have added entry');
      assert.ok(approvalController.has({ origin: 'bar.baz', type: 'myType' }), 'should have added entry');
      assert.deepStrictEqual(
        approvalController.state[STORE_KEY],
        { foo: { id: 'foo', origin: 'bar.baz', type: 'myType' } },
        'should have added entry to store',
      );
    });

    it('adds correctly specified entry with request data', () => {
      assert.doesNotThrow(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: undefined,
          requestData: { foo: 'bar' },
        }),
      );

      assert.ok(approvalController.has({ id: 'foo' }), 'should have added entry');
      assert.ok(approvalController.has({ origin: 'bar.baz' }), 'should have added entry');
      assert.deepStrictEqual(
        approvalController.state[STORE_KEY].foo.requestData,
        { foo: 'bar' },
        'should have added entry with correct request data',
      );
    });

    it('adds multiple entries for same origin with different types and ids', () => {
      const ORIGIN = 'bar.baz';

      assert.doesNotThrow(() => approvalController.add({ id: 'foo1', origin: ORIGIN }), 'should add entry');
      assert.doesNotThrow(
        () => approvalController.add({ id: 'foo2', origin: ORIGIN, type: 'myType1' }),
        'should add entry',
      );
      assert.doesNotThrow(
        () => approvalController.add({ id: 'foo3', origin: ORIGIN, type: 'myType2' }),
        'should add entry',
      );

      assert.ok(
        approvalController.has({ id: 'foo1' }) &&
          approvalController.has({ id: 'foo3' }) &&
          approvalController.has({ id: 'foo3' }),
        'should have added entries',
      );
      assert.ok(
        approvalController.has({ origin: ORIGIN }) &&
          approvalController.has({ origin: ORIGIN, type: 'myType1' }) &&
          approvalController.has({ origin: ORIGIN, type: 'myType2' }),
        'should have added entries',
      );
    });

    it('throws on id collision', () => {
      assert.doesNotThrow(() => approvalController.add({ id: 'foo', origin: 'bar.baz' }), 'should add entry');

      assert.throws(
        () => approvalController.add({ id: 'foo', origin: 'fizz.buzz' }),
        getIdCollisionError('foo'),
        'should have thrown expected error',
      );
    });

    it('throws on origin and default type collision', () => {
      assert.doesNotThrow(() => approvalController.add({ id: 'foo', origin: 'bar.baz' }), 'should add entry');

      assert.throws(
        () => approvalController.add({ id: 'foo1', origin: 'bar.baz' }),
        getOriginTypeCollisionError('bar.baz'),
        'should have thrown expected error',
      );
    });

    it('throws on origin and custom type collision', () => {
      assert.doesNotThrow(
        () => approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' }),
        'should add entry',
      );

      assert.throws(
        () => approvalController.add({ id: 'foo1', origin: 'bar.baz', type: 'myType' }),
        getOriginTypeCollisionError('bar.baz', 'myType'),
        'should have thrown expected error',
      );
    });
  });

  // otherwise tested by 'add' above
  describe('addAndShowApprovalRequest', () => {
    it('addAndShowApprovalRequest', () => {
      const showApprovalSpy = sinon.spy();
      const approvalController = new ApprovalController({
        showApprovalRequest: showApprovalSpy,
      });

      const result = approvalController.addAndShowApprovalRequest({
        id: 'foo',
        origin: 'bar.baz',
        type: 'myType',
        requestData: { foo: 'bar' },
      });
      assert.ok(result instanceof Promise, 'should return expected result');
      assert.ok(showApprovalSpy.calledOnce, 'should have called _showApprovalRequest once');
    });
  });

  describe('get', () => {
    let approvalController: ApprovalController;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
    });

    it('gets entry with default type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      assert.deepStrictEqual(
        approvalController.get('foo'),
        { id: 'foo', origin: 'bar.baz' },
        'should retrieve expected entry',
      );
    });

    it('gets entry with custom type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      assert.deepStrictEqual(
        approvalController.get('foo'),
        { id: 'foo', origin: 'bar.baz', type: 'myType' },
        'should retrieve expected entry',
      );
    });
  });

  describe('has', () => {
    let approvalController: ApprovalController;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
    });

    it('returns true for existing entry by id', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      assert.strictEqual(approvalController.has({ id: 'foo' }), true, 'should return true for existing entry by id');
    });

    it('returns true for existing entry by origin', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      assert.strictEqual(
        approvalController.has({ origin: 'bar.baz' }),
        true,
        'should return true for existing entry by origin',
      );
    });

    it('returns true for existing entry by origin and custom type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'myType' });

      assert.strictEqual(
        approvalController.has({ origin: 'bar.baz', type: 'myType' }),
        true,
        'should return true for existing entry by origin and custom type',
      );
    });

    it('returns false for non-existing entry by id', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      assert.strictEqual(
        approvalController.has({ id: 'fizz' }),
        false,
        'should return false for non-existing entry by id',
      );
    });

    it('returns false for non-existing entry by origin', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      assert.strictEqual(
        approvalController.has({ origin: 'fizz.buzz' }),
        false,
        'should return false for non-existing entry by origin',
      );
    });

    it('returns false for non-existing entry by origin and type', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      assert.strictEqual(
        approvalController.has({ origin: 'bar.baz', type: 'myType' }),
        false,
        'should return false for non-existing entry by origin and type',
      );
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

    afterEach(() => {
      assert.strictEqual(deleteSpy.callCount, numDeletions, `should have called '_delete' ${numDeletions} times`);
    });

    it('resolves approval promise', async () => {
      numDeletions = 1;

      const approvalPromise = approvalController.add({ id: 'foo', origin: 'bar.baz' });
      approvalController.resolve('foo', 'success');

      const result = await approvalPromise;
      assert.strictEqual(result, 'success', 'should have resolved expected value');
    });

    it('resolves multiple approval promises out of order', async () => {
      numDeletions = 2;

      const approvalPromise1 = approvalController.add({ id: 'foo1', origin: 'bar.baz' });
      const approvalPromise2 = approvalController.add({ id: 'foo2', origin: 'bar.baz', type: 'myType2' });

      approvalController.resolve('foo2', 'success2');

      let result = await approvalPromise2;
      assert.strictEqual(result, 'success2', 'should have resolved expected value');

      approvalController.resolve('foo1', 'success1');

      result = await approvalPromise1;
      assert.strictEqual(result, 'success1', 'should have resolved expected value');
    });

    it('throws on unknown id', () => {
      assert.throws(() => approvalController.resolve('foo'), getIdNotFoundError('foo'), 'should reject on unknown id');
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

    afterEach(() => {
      assert.strictEqual(deleteSpy.callCount, numDeletions, `should have called '_delete' ${numDeletions} times`);
    });

    it('rejects approval promise', async () => {
      numDeletions = 1;

      const approvalPromise = assert.rejects(
        () => approvalController.add({ id: 'foo', origin: 'bar.baz' }),
        getError('failure'),
        'should reject with expected error',
      );
      approvalController.reject('foo', new Error('failure'));

      await approvalPromise;
    });

    it('rejects multiple approval promises out of order', async () => {
      numDeletions = 2;

      const rejectionPromise1 = assert.rejects(
        () => approvalController.add({ id: 'foo1', origin: 'bar.baz' }),
        getError('failure1'),
        'should reject with expected error',
      );
      const rejectionPromise2 = assert.rejects(
        () => approvalController.add({ id: 'foo2', origin: 'bar.baz', type: 'myType2' }),
        getError('failure2'),
        'should reject with expected error',
      );

      approvalController.reject('foo2', new Error('failure2'));
      await rejectionPromise2;

      approvalController.reject('foo1', new Error('failure1'));
      await rejectionPromise1;
    });

    it('throws on unknown id', () => {
      assert.throws(
        () => approvalController.reject('foo', new Error('bar')),
        getIdNotFoundError('foo'),
        'should reject on unknown id',
      );
    });
  });

  describe('resolve and reject', () => {
    it('resolves and rejects multiple approval promises out of order', async () => {
      const approvalController = new ApprovalController({ ...defaultConfig });

      const promise1 = approvalController.add({ id: 'foo1', origin: 'bar.baz' });
      const promise2 = approvalController.add({ id: 'foo2', origin: 'bar.baz', type: 'myType2' });
      const promise3 = assert.rejects(
        () => approvalController.add({ id: 'foo3', origin: 'fizz.buzz' }),
        getError('failure3'),
        'should reject with expected error',
      );
      const promise4 = assert.rejects(
        () => approvalController.add({ id: 'foo4', origin: 'bar.baz', type: 'myType4' }),
        getError('failure4'),
        'should reject with expected error',
      );

      approvalController.resolve('foo2', 'success2');

      let result = await promise2;
      assert.strictEqual(result, 'success2', 'should have resolved expected value');

      approvalController.reject('foo4', new Error('failure4'));
      await promise4;

      approvalController.reject('foo3', new Error('failure3'));
      await promise3;

      assert.ok(!approvalController.has({ origin: 'fizz.buzz' }), 'should have deleted origin');
      assert.ok(approvalController.has({ origin: 'bar.baz' }), 'should have origin with remaining approval');

      approvalController.resolve('foo1', 'success1');

      result = await promise1;
      assert.strictEqual(result, 'success1', 'should have resolved expected value');

      assert.ok(!approvalController.has({ origin: 'bar.baz' }), 'origins should be removed');
    });
  });

  describe('clear', () => {
    let approvalController: ApprovalController, numDeletions: number, deleteSpy: any;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
      deleteSpy = sinon.spy(approvalController, '_delete');
      numDeletions = 0;
    });

    afterEach(() => {
      assert.strictEqual(deleteSpy.callCount, numDeletions, `should have called '_delete' ${numDeletions} times`);
    });

    it('does nothing if state is already empty', () => {
      assert.doesNotThrow(() => approvalController.clear(), 'should not throw');
    });

    it('deletes existing entries', async () => {
      numDeletions = 3;

      const clearPromise = Promise.all([
        assert.rejects(
          () => approvalController.add({ id: 'foo1', origin: 'bar.baz' }),
          'every approval promise should reject',
        ),
        assert.rejects(
          () => approvalController.add({ id: 'foo2', origin: 'bar.baz', type: 'myType' }),
          'every approval promise should reject',
        ),
        assert.rejects(
          () => approvalController.add({ id: 'foo3', origin: 'fizz.buzz', type: 'myType' }),
          'every approval promise should reject',
        ),
      ]);

      approvalController.clear();
      await clearPromise;

      assert.deepStrictEqual(approvalController.state[STORE_KEY], {}, 'store should be empty');
    });
  });
});

// helpers

function getIdCollisionError(id: string) {
  return getError(`Approval with id '${id}' already exists.`, ERROR_CODES.rpc.internal);
}

function getOriginTypeCollisionError(origin: string, type = '_default') {
  const message = `Request${
    type === '_default' ? '' : ` of type '${type}'`
  } already pending for origin ${origin}. Please wait.`;
  return getError(message, ERROR_CODES.rpc.resourceUnavailable);
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
