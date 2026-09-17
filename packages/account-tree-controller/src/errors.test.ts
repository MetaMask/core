import { reportRemoveAccountWalletError, toErrorMessage } from './errors.js';

describe('toErrorMessage', () => {
  it('returns the message of an Error instance', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies non-Error values', () => {
    expect(toErrorMessage('raw string')).toBe('raw string');
    expect(toErrorMessage(42)).toBe('42');
    expect(toErrorMessage(null)).toBe('null');
  });
});

describe('reportRemoveAccountWalletError', () => {
  it('calls console.error with the message and structured context', () => {
    const messenger = { captureException: jest.fn() };
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const error = new Error('something went wrong');

    reportRemoveAccountWalletError(messenger, error.message, error, [
      { id: 'acc-1', error: new Error('removal failed') },
      { id: 'acc-2', error: 'string error' },
    ]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'something went wrong',
      expect.objectContaining({
        error,
        context: {
          failures: [
            { id: 'acc-1', error: 'removal failed' },
            { id: 'acc-2', error: 'string error' },
          ],
        },
      }),
    );

    consoleErrorSpy.mockRestore();
  });

  it('omits the id field from context when the failure has no id', () => {
    const messenger = { captureException: jest.fn() };
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const error = new Error('oops');

    reportRemoveAccountWalletError(messenger, error.message, error, [
      { error: new Error('no id here') },
    ]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'oops',
      expect.objectContaining({
        context: { failures: [{ error: 'no id here' }] },
      }),
    );

    consoleErrorSpy.mockRestore();
  });

  it('calls captureException with a Sentry error carrying the context', () => {
    const messenger = { captureException: jest.fn() };
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const error = new Error('removal incomplete');

    reportRemoveAccountWalletError(messenger, error.message, error, [
      { id: 'acc-1', error: new Error('failed') },
    ]);

    expect(messenger.captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'removal incomplete',
        context: { failures: [{ id: 'acc-1', error: 'failed' }] },
      }),
    );

    consoleErrorSpy.mockRestore();
  });

  it('does not throw when captureException is absent from the messenger', () => {
    const messenger = {};
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    expect(() =>
      reportRemoveAccountWalletError(messenger, 'msg', new Error('msg'), []),
    ).not.toThrow();

    consoleErrorSpy.mockRestore();
  });
});
