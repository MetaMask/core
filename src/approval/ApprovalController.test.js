const { errorCodes } = require('eth-rpc-errors');
const { ControllerMessenger } = require('../ControllerMessenger');
const { ApprovalController } = require('./ApprovalController');

/**
 * Constructs a restricted controller messenger.
 *
 * @returns {object} A restricted controller messenger.
 */
function getRestrictedMessenger() {
  const controllerMessenger = new ControllerMessenger();
  const messenger = controllerMessenger.getRestricted({
    name: 'ApprovalController',
  });
  return messenger;
}

const getApprovalController = () =>
  new ApprovalController({
    messenger: getRestrictedMessenger(),
    showApprovalRequest: () => undefined,
  });

const STORE_KEY = 'pendingApprovals';

describe('ApprovalController: Input Validation', () => {
  describe('add', () => {
    it('validates input', () => {
      const approvalController = getApprovalController();

      expect(() =>
        approvalController.add({ id: null, origin: 'bar.baz' }),
      ).toThrow(getInvalidIdError());

      expect(() => approvalController.add({ id: 'foo' })).toThrow(
        getInvalidOriginError(),
      );

      expect(() => approvalController.add({ id: 'foo', origin: true })).toThrow(
        getInvalidOriginError(),
      );

      expect(() =>
        approvalController.add({ id: 'foo', origin: 'bar.baz', type: {} }),
      ).toThrow(getInvalidTypeError(errorCodes.rpc.internal));

      expect(() =>
        approvalController.add({ id: 'foo', origin: 'bar.baz', type: '' }),
      ).toThrow(getInvalidTypeError(errorCodes.rpc.internal));

      expect(() =>
        approvalController.add({
          id: 'foo',
          origin: 'bar.baz',
          type: 'type',
          requestData: 'foo',
        }),
      ).toThrow(getInvalidRequestDataError());
    });
  });

  describe('get', () => {
    it('returns undefined for non-existing entry', () => {
      const approvalController = getApprovalController();

      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'type' });

      expect(approvalController.get('fizz')).toBeUndefined();

      expect(approvalController.get()).toBeUndefined();

      expect(approvalController.get({})).toBeUndefined();
    });
  });

  describe('getApprovalCount', () => {
    it('validates input', () => {
      const approvalController = getApprovalController();

      expect(() => approvalController.getApprovalCount()).toThrow(
        getApprovalCountParamsError(),
      );

      expect(() => approvalController.getApprovalCount({})).toThrow(
        getApprovalCountParamsError(),
      );

      expect(() =>
        approvalController.getApprovalCount({ origin: null }),
      ).toThrow(getApprovalCountParamsError());

      expect(() =>
        approvalController.getApprovalCount({ type: false }),
      ).toThrow(getApprovalCountParamsError());
    });
  });

  describe('has', () => {
    it('validates input', () => {
      const approvalController = getApprovalController();

      expect(() => approvalController.has()).toThrow(
        getInvalidHasParamsError(),
      );

      expect(() => approvalController.has({})).toThrow(
        getInvalidHasParamsError(),
      );

      expect(() => approvalController.has({ id: true })).toThrow(
        getInvalidHasIdError(),
      );

      expect(() => approvalController.has({ origin: true })).toThrow(
        getInvalidHasOriginError(),
      );

      expect(() => approvalController.has({ type: true })).toThrow(
        getInvalidHasTypeError(),
      );

      expect(() =>
        approvalController.has({ origin: 'foo', type: true }),
      ).toThrow(getInvalidHasTypeError());
    });
  });

  // We test this internal function before resolve, reject, and clear because
  // they are heavily dependent upon it.
  describe('_delete', () => {
    let approvalController;

    beforeEach(() => {
      approvalController = getApprovalController();
    });

    it('deletes entry', () => {
      approvalController.add({ id: 'foo', origin: 'bar.baz', type: 'type' });

      approvalController._delete('foo');

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

      approvalController._delete('fizz');

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

  describe('miscellaneous', () => {
    it('isEmptyOrigin: handles non-existing origin', () => {
      const approvalController = getApprovalController();
      expect(() => approvalController._isEmptyOrigin('kaplar')).not.toThrow();
    });
  });
});

// helpers

/**
 * Get an invalid ID error.
 *
 * @returns {Error} An invalid ID error.
 */
function getInvalidIdError() {
  return getError('Must specify non-empty string id.', errorCodes.rpc.internal);
}

/**
 * Get an invalid ID type error.
 *
 * @returns {Error} An invalid ID type error.
 */
function getInvalidHasIdError() {
  return getError('May not specify non-string id.');
}

/**
 * Get an invalid origin type error.
 *
 * @returns {Error} The invalid origin type error.
 */
function getInvalidHasOriginError() {
  return getError('May not specify non-string origin.');
}

/**
 * Get an invalid type error.
 *
 * @returns {Error} The invalid type error.
 */
function getInvalidHasTypeError() {
  return getError('May not specify non-string type.');
}

/**
 * Get an invalid origin error.
 *
 * @returns {Error} The invalid origin error.
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
 * @returns {Error} The invalid request data error.
 */
function getInvalidRequestDataError() {
  return getError(
    'Request data must be a plain object if specified.',
    errorCodes.rpc.internal,
  );
}

/**
 * Get an invalid type error.
 *
 * @param {number} code - The error code.
 * @returns {Error} The invalid type error.
 */
function getInvalidTypeError(code) {
  return getError('Must specify non-empty string type.', code);
}

/**
 * Get an invalid params error.
 *
 * @returns {Error} The invalid params error.
 */
function getInvalidHasParamsError() {
  return getError('Must specify a valid combination of id, origin, and type.');
}

/**
 * Get an invalid approval count params error.
 *
 * @returns {Error} The invalid approval count params error.
 */
function getApprovalCountParamsError() {
  return getError('Must specify origin, type, or both.');
}

/**
 * Get an Error.
 *
 * @param {string} message - The error message.
 * @param {number} code - The error code.
 * @returns {Error} An Error.
 */
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
