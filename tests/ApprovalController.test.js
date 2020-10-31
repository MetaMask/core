const { ERROR_CODES } = require('eth-rpc-errors');
const ApprovalController = require('../dist/approval/ApprovalController.js').default;

const defaultConfig = { showApprovalRequest: () => undefined };

const getApprovalController = () => new ApprovalController({ ...defaultConfig });

const STORE_KEY = 'pendingApprovals';

describe('ApprovalController: Input Validation', () => {
  describe('add', () => {
    it('validates input', () => {
      const approvalController = getApprovalController();

      expect(() => approvalController.add({ id: null, origin: 'bar.baz' })).toThrow(getInvalidIdError());

      expect(() => approvalController.add({ id: 'foo' })).toThrow(getMissingOriginError());

      expect(() => approvalController.add({ id: 'foo', origin: 'bar.baz', type: {} })).toThrow(
        getNonStringTypeError(ERROR_CODES.rpc.internal),
      );

      expect(() => approvalController.add({ id: 'foo', origin: 'bar.baz', type: '' })).toThrow(
        getEmptyStringTypeError(ERROR_CODES.rpc.internal),
      );

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          requestData: 'foo',
        }),
      ).toThrow(getInvalidRequestDataError());
    });
  });

  describe('get', () => {
    it('returns undefined for non-existing entry', () => {
      const approvalController = getApprovalController();

      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      expect(approvalController.get('fizz')).toBeUndefined();

      expect(approvalController.get()).toBeUndefined();

      expect(approvalController.get({})).toBeUndefined();
    });
  });

  describe('has', () => {
    it('validates input', () => {
      const approvalController = getApprovalController();

      expect(() => approvalController.has({})).toThrow(getMissingIdOrOriginError());

      expect(() => approvalController.has({ type: false })).toThrow(getNoFalsyTypeError());
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

      expect(
        !approvalController.has({ id: 'foo' }) &&
          !approvalController.has({ origin: 'bar.baz' }) &&
          !approvalController.state[STORE_KEY].foo,
      ).toEqual(true);
    });

    it('deletes one entry out of many without side-effects', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });
      approvalController.add({ id: 'fizz', origin: 'bar.baz', type: 'myType' });

      approvalController._delete('fizz');

      expect(
        !approvalController.has({ id: 'fizz' }) && !approvalController.has({ origin: 'bar.baz', type: 'myType' }),
      ).toEqual(true);

      expect(approvalController.has({ id: 'foo' }) && approvalController.has({ origin: 'bar.baz' })).toEqual(true);
    });

    it('does nothing when deleting non-existing entry', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz' });

      expect(() => approvalController._delete('fizz')).not.toThrow();

      expect(approvalController.has({ id: 'foo' }) && approvalController.has({ origin: 'bar.baz' })).toEqual(true);
    });
  });

  describe('miscellaneous', () => {
    it('isEmptyOrigin: handles non-existing origin', () => {
      const approvalController = getApprovalController();
      expect(() => approvalController._isEmptyOrigin('kaplar')).not.toThrow();
    });
  });
});

// helpers

function getInvalidIdError() {
  return getError('Must specify non-empty string id.', ERROR_CODES.rpc.internal);
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
