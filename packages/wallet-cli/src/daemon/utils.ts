import { isErrorWithCode as hasErrorCode } from '@metamask/utils';
import { readFile } from 'node:fs/promises';

/**
 * Check whether an unknown error is a Node.js system error with the given code.
 *
 * Wraps `@metamask/utils`' duck-typed `isErrorWithCode` guard, which omits the
 * specific-code comparison, to provide an ergonomic single-code check.
 *
 * @param error - The error to check.
 * @param code - The expected error code (e.g. 'ENOENT', 'EPERM').
 * @returns True if the error matches the code.
 */
export function isErrorWithCode(error: unknown, code: string): boolean {
  return hasErrorCode(error) && error.code === code;
}

/**
 * Read a PID from a file. The file may contain just the PID, or the PID on
 * the first line followed by additional metadata (e.g. start time written by
 * the daemon).
 *
 * @param pidPath - The PID file path.
 * @returns The PID, or undefined if the file is missing or its first line is
 * not a positive integer.
 */
export async function readPidFile(
  pidPath: string,
): Promise<number | undefined> {
  let contents: string;
  try {
    contents = await readFile(pidPath, 'utf-8');
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'ENOENT')) {
      return undefined;
    }
    throw error;
  }
  // String.prototype.split always returns at least one element, so [0] is safe.
  const pid = Number(contents.split('\n')[0].trim());
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
}

/**
 * Check whether a process is alive by sending signal 0.
 *
 * Treats `ESRCH` as "process is gone", `EPERM` as "process exists but we
 * cannot signal it" (still alive from our perspective), and rethrows
 * anything else so the caller can surface unexpected failures rather than
 * silently assuming the process is dead.
 *
 * @param pid - The process ID to check.
 * @returns True if the process exists.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'ESRCH')) {
      return false;
    }
    if (isErrorWithCode(error, 'EPERM')) {
      return true;
    }
    throw error;
  }
}

/**
 * Send a signal to a process. Returns true if the signal was sent, false if
 * the process does not exist (ESRCH). Re-throws on permission errors and
 * other failures.
 *
 * @param pid - The process ID.
 * @param signal - The signal to send.
 * @returns True if the signal was delivered, false if the process is gone.
 */
export function sendSignal(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'ESRCH')) {
      return false;
    }
    throw error;
  }
}

/**
 * Poll until a condition is met or the timeout elapses.
 *
 * @param check - A function that returns true when the condition is met.
 * @param timeoutMs - Maximum time to wait in milliseconds.
 * @returns True if the condition was met, false on timeout.
 */
export async function waitFor(
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}
