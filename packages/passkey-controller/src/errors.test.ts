import {
  PasskeyControllerErrorCode,
  PasskeyControllerErrorMessage,
} from './constants';
import { PasskeyControllerError } from './errors';

describe('PasskeyControllerError', () => {
  it('sets code and cause from options', () => {
    const cause = new Error('inner');
    const controllerError = new PasskeyControllerError(
      PasskeyControllerErrorMessage.VaultKeyDecryptionFailed,
      {
        code: PasskeyControllerErrorCode.VaultKeyDecryptionFailed,
        cause,
      },
    );
    expect(controllerError.code).toBe(
      PasskeyControllerErrorCode.VaultKeyDecryptionFailed,
    );
    expect(controllerError.cause).toBe(cause);
    expect(controllerError.toJSON()).toMatchObject({
      name: 'PasskeyControllerError',
      code: PasskeyControllerErrorCode.VaultKeyDecryptionFailed,
      message: PasskeyControllerErrorMessage.VaultKeyDecryptionFailed,
    });
  });

  it('supports Error as second argument for cause', () => {
    const inner = new Error('x');
    const controllerError = new PasskeyControllerError('msg', inner);
    expect(controllerError.cause).toBe(inner);
  });

  it('sets context from options', () => {
    const controllerError = new PasskeyControllerError('msg', {
      code: PasskeyControllerErrorCode.NotEnrolled,
      context: { detail: 'x' },
    });
    expect(controllerError.context).toStrictEqual({ detail: 'x' });
    expect(controllerError.toJSON().context).toStrictEqual({ detail: 'x' });
  });

  it('serializes cause in toJSON', () => {
    const cause = new Error('inner');
    const controllerError = new PasskeyControllerError('msg', {
      code: PasskeyControllerErrorCode.NotEnrolled,
      cause,
    });
    expect(controllerError.toJSON().cause).toMatchObject({
      name: 'Error',
      message: 'inner',
    });
  });

  it('toString includes code when set', () => {
    const controllerError = new PasskeyControllerError('msg', {
      code: PasskeyControllerErrorCode.NotEnrolled,
    });
    expect(controllerError.toString()).toContain('[not_enrolled]');
  });

  it('toString includes cause when set', () => {
    const cause = new Error('inner');
    const controllerError = new PasskeyControllerError('msg', { cause });
    expect(controllerError.toString()).toContain('Caused by:');
    expect(controllerError.toString()).toContain('inner');
  });

  it('toString includes code and cause when both are set', () => {
    const cause = new Error('inner');
    const controllerError = new PasskeyControllerError('msg', {
      code: PasskeyControllerErrorCode.NotEnrolled,
      cause,
    });
    const text = controllerError.toString();
    expect(text).toContain('[not_enrolled]');
    expect(text).toContain('Caused by:');
  });
});
