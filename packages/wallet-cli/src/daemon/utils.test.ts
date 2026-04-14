import { readFile } from 'node:fs/promises';

import {
  isErrorWithCode,
  isProcessAlive,
  readPidFile,
  sendSignal,
  waitFor,
} from './utils';

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

describe('readPidFile', () => {
  it('returns the PID number from a valid file', async () => {
    mockReadFile.mockResolvedValue('12345');
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

  it('returns false on other errors', () => {
    jest.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('esrch'), { code: 'ESRCH' });
    });
    expect(isProcessAlive(123)).toBe(false);
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
