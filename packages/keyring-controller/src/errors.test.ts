import { KeyringControllerErrorMessage } from './constants';
import { isKeyringNotFoundError, KeyringControllerError } from './errors';

describe('isKeyringNotFoundError', () => {
  it('returns true for a KeyringControllerError with the KeyringNotFound message', () => {
    const error = new KeyringControllerError(
      KeyringControllerErrorMessage.KeyringNotFound,
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
