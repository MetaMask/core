const assert = require('assert');
const { ERROR_CODES } = require('eth-rpc-errors');
const ApprovalController = require('../dist/approval/ApprovalController.js').default;

const defaultConfig = { showApprovalRequest: () => undefined };

const getApprovalController = () => new ApprovalController({ ...defaultConfig });

const STORE_KEY = 'pendingApprovals';

describe('ApprovalController: Input Validation', () => {
  describe('add', () => {
    it('validates input', () => {
      const approvalController = getApprovalController();

      assert.throws(
        () => approvalController.add({ id: null, origin: 'bar.baz' }),
        getNoFalsyIdError(),
        'should throw on falsy id',
      );

      assert.throws(
        () => approvalController.add({ id: 'foo' }),
        getMissingOriginError(),
        'should throw on falsy origin',
      );

      assert.throws(
        () => approvalController.add({ id: 'foo', origin: 'bar.baz', type: {} }),
        getNonStringTypeError(ERROR_CODES.rpc.internal),
        'should throw on non-string type',
      );

      assert.throws(
        () => approvalController.add({ id: 'foo', origin: 'bar.baz', type: '' }),
        getEmptyStringTypeError(ERROR_CODES.rpc.internal),
        'should throw on empty string type',
      );

      assert.throws(
        () =>
          approvalController.add({
            id: 'foo',
            origin: 'bar.baz',
            requestData: 'foo',
          }),
        getInvalidRequestDataError(),
        'should throw on non-object requestData',
      );
    });
  });

  describe('get', () => {
    it('returns undefined for non-existing entry', () => {
      const approvalController = getApprovalController();

      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      assert.strictEqual(approvalController.get('fizz'), undefined, 'should return undefined');

      assert.strictEqual(approvalController.get(), undefined, 'should return undefined');

      assert.strictEqual(approvalController.get({}), undefined, 'should return undefined');
    });
  });

  describe('has', () => {
    it('validates input', () => {
      const approvalController = getApprovalController();

      assert.throws(
        () => approvalController.has({}),
        getMissingIdOrOriginError(),
        'should throw on falsy id and origin',
      );

      assert.throws(() => approvalController.has({ type: false }), getNoFalsyTypeError(), 'should throw on falsy type');
    });
  });

  // We test this internal function before resolve, reject, and clear because
  // they are heavily dependent upon it.
  describe('_delete', () => {
    let approvalController;

    beforeEach(() => {
      approvalController = new ApprovalController({ ...defaultConfig });
    });

    it('deletes entry', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      approvalController._delete('foo');

      assert.ok(
        !approvalController.has({ id: 'foo' }) &&
          !approvalController.has({ origin: 'bar.baz' }) &&
          !approvalController.state[STORE_KEY].foo,
        'should have deleted entry',
      );
    });

    it('deletes one entry out of many without side-effects', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });
      approvalController.add({ id: 'fizz', origin: 'bar.baz', type: 'myType' });

      approvalController._delete('fizz');

      assert.ok(
        !approvalController.has({ id: 'fizz' }) && !approvalController.has({ origin: 'bar.baz', type: 'myType' }),
        'should have deleted entry',
      );

      assert.ok(
        approvalController.has({ id: 'foo' }) && approvalController.has({ origin: 'bar.baz' }),
        'should still have non-deleted entry',
      );
    });

    it('does nothing when deleting non-existing entry', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      assert.doesNotThrow(
        () => approvalController._delete('fizz'),
        'should not throw when deleting non-existing entry',
      );

      assert.ok(
        approvalController.has({ id: 'foo' }) && approvalController.has({ origin: 'bar.baz' }),
        'should still have non-deleted entry',
      );
    });
  });

  describe('miscellaneous', () => {
    it('isEmptyOrigin: handles non-existing origin', () => {
      const approvalController = getApprovalController();
      assert.doesNotThrow(() => approvalController._isEmptyOrigin('kaplar'));
    });
  });
});

// helpers

function getNoFalsyIdError() {
  return getError('May not specify falsy id.', ERROR_CODES.rpc.internal);
}

function getMissingOriginError() {
  return getError('Must specify origin.', ERROR_CODES.rpc.internal);
}

function getInvalidRequestDataError() {
  return getError('Request data must be a plain object if specified.', ERROR_CODES.rpc.internal);
}

function getNoFalsyTypeError() {
  return getError('May not specify falsy type.');
}

function getNonStringTypeError(code) {
  return getError('Must specify string type.', code);
}

function getEmptyStringTypeError(code) {
  return getError('May not specify empty string type.', code);
}

function getMissingIdOrOriginError() {
  return getError('Must specify id or origin.');
}

function getError(message, code) {
  const err = {
    name: 'Error',
    message,
  };
  if (code !== undefined) {
    err.code = code;
  }
  return err;
}
