import { createSentryError, reportError } from './errors.js';

describe('createSentryError', () => {
  it('creates an error with a cause', () => {
    const inner = new Error('inner');
    const result = createSentryError('outer', inner);

    expect(result.message).toBe('outer');
    expect(result.cause).toBe(inner);
    expect(result.context).toBeUndefined();
  });

  it('attaches context when provided', () => {
    const inner = new Error('inner');
    const context = { snapId: 'npm:test-snap' };
    const result = createSentryError('outer', inner, context);

    expect(result.context).toStrictEqual(context);
  });
});

describe('reportError', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation();
  });

  it('logs to console.error', () => {
    const error = new Error('boom');
    reportError({}, 'Something failed', error);

    expect(console.error).toHaveBeenCalledWith('Something failed', error);
  });

  it('calls captureException when provided', () => {
    const error = new Error('boom');
    const captureException = jest.fn();
    reportError({ captureException }, 'Something failed', error);

    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Something failed', cause: error }),
    );
  });

  it('does not throw when captureException is absent', () => {
    const error = new Error('boom');
    expect(() => reportError({}, 'Something failed', error)).not.toThrow();
  });
});
