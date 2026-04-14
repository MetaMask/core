import { hasProperty } from '@metamask/utils';
import { readFile } from 'node:fs/promises';

/**
 * Check whether an unknown error is a Node.js system error with the given code.
 *
 * @param error - The error to check.
 * @param code - The expected error code (e.g. 'ENOENT', 'EPERM').
 * @returns True if the error matches the code.
 */
export function isErrorWithCode(error: unknown, code: string): boolean {
  return (
    // TODO: use Error.isError()
    error instanceof Error && hasProperty(error, 'code') && error.code === code
  );
}

/**
 * Read a PID from a file.
 *
 * @param pidPath - The PID file path.
 * @returns The PID, or undefined if the file is missing or invalid.
 */
export async function readPidFile(
  pidPath: string,
): Promise<number | undefined> {
  try {
    const pid = Number(await readFile(pidPath, 'utf-8'));
    return pid > 0 && !Number.isNaN(pid) ? pid : undefined;
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'ENOENT')) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Check whether a process is alive by sending signal 0.
 *
 * @param pid - The process ID to check.
 * @returns True if the process exists.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    if (isErrorWithCode(error, 'EPERM')) {
      return true;
    }
    return false;
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
  return await check();
}
