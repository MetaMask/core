import { KeyringControllerErrorMessage } from './constants';
import {
  isKeyringControllerError,
  isKeyringNotFoundError,
  KeyringControllerError,
} from './errors';

describe('isKeyringControllerError', () => {
  it('returns true for a KeyringControllerError', () => {
    const error = new KeyringControllerError(
      KeyringControllerErrorMessage.KeyringNotFound,
    );
    expect(isKeyringControllerError(error)).toBe(true);
  });

  it('returns true for an error from another version of the package (duck-typing)', () => {
    const error = Object.assign(new Error('some message'), {
      name: 'KeyringControllerError',
    });
    expect(isKeyringControllerError(error)).toBe(true);
  });

  it('returns false for a plain Error', () => {
    expect(isKeyringControllerError(new Error('oops'))).toBe(false);
  });

  it('returns false for a non-error value', () => {
    expect(isKeyringControllerError('not an error')).toBe(false);
    expect(isKeyringControllerError(null)).toBe(false);
    expect(isKeyringControllerError(undefined)).toBe(false);
  });
});

describe('isKeyringNotFoundError', () => {
  it('returns true for a KeyringControllerError with the KeyringNotFound message', () => {
    const error = new KeyringControllerError(
      KeyringControllerErrorMessage.KeyringNotFound,
    );
    expect(isKeyringNotFoundError(error)).toBe(true);
  });

  it('returns true for an error from another version of the package (duck-typing)', () => {
    const error = Object.assign(
      new Error(KeyringControllerErrorMessage.KeyringNotFound),
      {
        name: 'KeyringControllerError',
      },
    );
    expect(isKeyringNotFoundError(error)).toBe(true);
  });

  it('returns false for a KeyringControllerError with a different message', () => {
    const error = new KeyringControllerError(
      KeyringControllerErrorMessage.NoKeyring,
    );
    expect(isKeyringNotFoundError(error)).toBe(false);
  });

  it('returns false for a plain Error', () => {
    const error = new Error(KeyringControllerErrorMessage.KeyringNotFound);
    expect(isKeyringNotFoundError(error)).toBe(false);
  });

  it('returns false for a non-error value', () => {
    expect(isKeyringNotFoundError('not an error')).toBe(false);
    expect(isKeyringNotFoundError(null)).toBe(false);
    expect(isKeyringNotFoundError(undefined)).toBe(false);
  });
});
