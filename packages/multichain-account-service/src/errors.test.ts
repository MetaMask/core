import {
  KeyringControllerError,
  KeyringControllerErrorMessage,
} from '@metamask/keyring-controller';

import { reportError } from './errors';
import { logErrorAs } from './logger';
import { TimeoutError } from './providers/utils';

jest.mock('./logger', () => ({
  logErrorAs: jest.fn(),
}));

describe('reportError', () => {
  const message = 'Unable to create account';

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  it.each([
    {
      name: 'timeout errors',
      error: new TimeoutError('Timed out after: 500ms'),
    },
    {
      name: 'keyring controller locked errors',
      error: new KeyringControllerError(
        KeyringControllerErrorMessage.ControllerLocked,
      ),
    },
  ])('logs $name as warnings without capturing them', ({ error }) => {
    const messenger = { captureException: jest.fn() };

    reportError(messenger, message, error);

    expect(logErrorAs).toHaveBeenCalledWith('warn', message, error);
    expect(console.warn).toHaveBeenCalledWith(message, error);
    expect(console.error).not.toHaveBeenCalled();
    expect(messenger.captureException).not.toHaveBeenCalled();
  });

  it('logs unexpected errors and captures them with context', () => {
    const error = new Error('Something went wrong');
    const context = { accountId: 'account-id' };
    const messenger = { captureException: jest.fn() };

    reportError(messenger, message, error, context);

    expect(logErrorAs).toHaveBeenCalledWith('error', message, error);
    expect(console.error).toHaveBeenCalledWith(message, error);
    expect(console.warn).not.toHaveBeenCalled();
    expect(messenger.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message,
        cause: error,
        context,
      }),
    );
  });

  it('does not throw if captureException is not provided', () => {
    const error = new Error('Something went wrong');

    expect(() => reportError({}, message, error)).not.toThrow();

    expect(logErrorAs).toHaveBeenCalledWith('error', message, error);
    expect(console.error).toHaveBeenCalledWith(message, error);
  });
});
