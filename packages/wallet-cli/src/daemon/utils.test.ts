import { jest } from '@jest/globals';
import { readFile } from 'node:fs/promises';

import {
  emptyToUndefined,
  formatJsonRpcError,
  isStringArray,
  makeDaemonConnectionError,
  isErrorWithCode,
  isProcessAlive,
  readPidFile,
  sendSignal,
  waitFor,
} from './utils.js';

jest.mock('node:fs/promises');

const mockReadFile = jest.mocked(readFile);

describe('isErrorWithCode', () => {
  it('returns true for an Error with a matching code', () => {
    const error = Object.assign(new Error('fail'), { code: 'ENOENT' });
    expect(isErrorWithCode(error, 'ENOENT')).toBe(true);
  });

  it('returns false for an Error with a different code', () => {
    const error = Object.assign(new Error('fail'), { code: 'EPERM' });
    expect(isErrorWithCode(error, 'ENOENT')).toBe(false);
  });

  it('returns false for an Error without a code', () => {
    expect(isErrorWithCode(new Error('fail'), 'ENOENT')).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isErrorWithCode('not an error', 'ENOENT')).toBe(false);
    expect(isErrorWithCode(null, 'ENOENT')).toBe(false);
    expect(isErrorWithCode(undefined, 'ENOENT')).toBe(false);
  });
});

describe('makeDaemonConnectionError', () => {
  it.each(['ENOENT', 'ECONNREFUSED'])(
    'reports a stopped daemon for %s',
    (code) => {
      const error = Object.assign(new Error('boom'), { code });
      expect(makeDaemonConnectionError(error)).toBe(
        'Daemon is not running. Start it with `mm daemon start`.',
      );
    },
  );

  it('reports a lost connection for ECONNRESET', () => {
    const error = Object.assign(new Error('boom'), { code: 'ECONNRESET' });
    const message = makeDaemonConnectionError(error);
    expect(message).toContain('Lost the connection to the daemon');
    expect(message).toContain('mm daemon status');
  });

  it.each(['EACCES', 'EPERM'])(
    'reports a permission problem for %s',
    (code) => {
      const error = Object.assign(new Error('boom'), { code });
      expect(makeDaemonConnectionError(error)).toContain('permission denied');
      expect(makeDaemonConnectionError(error)).toContain('MM_DAEMON_DATA_DIR');
    },
  );

  it('surfaces the raw message of an unrecognized Error', () => {
    expect(makeDaemonConnectionError(new Error('Socket read timed out'))).toBe(
      'Socket read timed out',
    );
  });

  it('stringifies a non-Error throw', () => {
    expect(makeDaemonConnectionError('kaboom')).toBe('kaboom');
  });
});

describe('emptyToUndefined', () => {
  it('returns undefined for an empty string', () => {
    expect(emptyToUndefined('')).toBeUndefined();
  });

  it('returns undefined when the value is already undefined', () => {
    expect(emptyToUndefined(undefined)).toBeUndefined();
  });

  it('returns the value unchanged for a non-empty string', () => {
    expect(emptyToUndefined('pw')).toBe('pw');
  });
});

describe('formatJsonRpcError', () => {
  it('annotates the message with its numeric code', () => {
    expect(
      formatJsonRpcError({ code: -32601, message: 'Method not found' }),
    ).toBe('Method not found (code -32601)');
  });
});

describe('isStringArray', () => {
  it('returns true for an array of strings', () => {
    expect(isStringArray(['a', 'b'])).toBe(true);
    expect(isStringArray([])).toBe(true);
  });

  it('returns false for an array with a non-string element', () => {
    expect(isStringArray(['a', 42])).toBe(false);
  });

  it('returns false for non-array values', () => {
    expect(isStringArray('a')).toBe(false);
    expect(isStringArray({ 0: 'a' })).toBe(false);
    expect(isStringArray(null)).toBe(false);
  });
});

describe('readPidFile', () => {
  it('returns the PID number from a single-line file', async () => {
    mockReadFile.mockResolvedValue('12345');
    expect(await readPidFile('/tmp/test.pid')).toBe(12345);
  });

  it('returns the PID from the first line when the file contains daemon metadata', async () => {
    // The daemon writes `${pid}\n${startTime}\n` so it can verify ownership
    // on cleanup; only the first line is the PID.
    mockReadFile.mockResolvedValue('12345\n1715553908123\n');
    expect(await readPidFile('/tmp/test.pid')).toBe(12345);
  });

  it('returns undefined for ENOENT', async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error('not found'), { code: 'ENOENT' }),
    );
    expect(await readPidFile('/tmp/test.pid')).toBeUndefined();
  });

  it('returns undefined for NaN content', async () => {
    mockReadFile.mockResolvedValue('not-a-number');
    expect(await readPidFile('/tmp/test.pid')).toBeUndefined();
  });

  it('returns undefined for zero', async () => {
    mockReadFile.mockResolvedValue('0');
    expect(await readPidFile('/tmp/test.pid')).toBeUndefined();
  });

  it('returns undefined for negative numbers', async () => {
    mockReadFile.mockResolvedValue('-1');
    expect(await readPidFile('/tmp/test.pid')).toBeUndefined();
  });

  it('returns undefined for an empty file', async () => {
    mockReadFile.mockResolvedValue('');
    expect(await readPidFile('/tmp/test.pid')).toBeUndefined();
  });

  it('rethrows non-ENOENT errors', async () => {
    mockReadFile.mockRejectedValue(
      Object.assign(new Error('permission denied'), { code: 'EACCES' }),
    );
    await expect(readPidFile('/tmp/test.pid')).rejects.toThrow(
      'permission denied',
    );
  });
});

describe('isProcessAlive', () => {
  it('returns true when process.kill(pid, 0) succeeds', () => {
    jest.spyOn(process, 'kill').mockImplementation(() => true);
    expect(isProcessAlive(123)).toBe(true);
  });

  it('returns true on EPERM (process exists but no permission)', () => {
    jest.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('eperm'), { code: 'EPERM' });
    });
    expect(isProcessAlive(123)).toBe(true);
  });

  it('returns false on ESRCH (process gone)', () => {
    jest.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('esrch'), { code: 'ESRCH' });
    });
    expect(isProcessAlive(123)).toBe(false);
  });

  it('rethrows unknown errors instead of guessing the process is dead', () => {
    jest.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('einval'), { code: 'EINVAL' });
    });
    expect(() => isProcessAlive(123)).toThrow('einval');
  });

  it('rethrows non-system errors', () => {
    jest.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('unexpected');
    });
    expect(() => isProcessAlive(123)).toThrow('unexpected');
  });
});

describe('sendSignal', () => {
  it('returns true when signal is delivered', () => {
    jest.spyOn(process, 'kill').mockImplementation(() => true);
    expect(sendSignal(123, 'SIGTERM')).toBe(true);
  });

  it('returns false on ESRCH (process gone)', () => {
    jest.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('esrch'), { code: 'ESRCH' });
    });
    expect(sendSignal(123, 'SIGTERM')).toBe(false);
  });

  it('rethrows other errors', () => {
    jest.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('eperm'), { code: 'EPERM' });
    });
    expect(() => sendSignal(123, 'SIGTERM')).toThrow('eperm');
  });
});

describe('waitFor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns true when check passes immediately', async () => {
    expect(await waitFor(() => true, 1000)).toBe(true);
  });

  it('returns true when check passes after polling', async () => {
    let calls = 0;
    const check = (): boolean => {
      calls += 1;
      return calls >= 3;
    };

    const promise = waitFor(check, 5000);
    await jest.advanceTimersByTimeAsync(500);
    expect(await promise).toBe(true);
  });

  it('returns false on timeout', async () => {
    const promise = waitFor(() => false, 500);
    await jest.advanceTimersByTimeAsync(750);
    expect(await promise).toBe(false);
  });

  it('works with async check functions', async () => {
    let calls = 0;
    const check = async (): Promise<boolean> => {
      calls += 1;
      return calls >= 2;
    };

    const promise = waitFor(check, 5000);
    await jest.advanceTimersByTimeAsync(500);
    expect(await promise).toBe(true);
  });
});
