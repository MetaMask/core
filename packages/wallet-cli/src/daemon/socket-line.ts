import type { Socket } from 'node:net';

/**
 * Write a newline-delimited line to a socket.
 *
 * @param socket - The socket to write to.
 * @param line - The line to write (without trailing newline).
 */
export async function writeLine(socket: Socket, line: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // A socket 'error' can fire while the write is in flight without ever
    // reaching the write callback; without this listener Node would treat it
    // as an unhandled 'error' event and crash the process.
    const onError = (error: Error): void => {
      socket.removeListener('error', onError);
      reject(error);
    };
    socket.once('error', onError);

    socket.write(`${line}\n`, (error) => {
      if (error) {
        // A failed write (e.g. EPIPE) is delivered BOTH here AND as a later
        // 'error' event. Leave `onError` attached to handle that event —
        // detaching here would let Node treat it as unhandled and crash the
        // process. This reject settles the promise; `onError` detaches itself
        // when/if the event arrives.
        reject(error);
        return;
      }
      socket.removeListener('error', onError);
      resolve();
    });
  });
}

/**
 * Read a single newline-delimited line from a socket.
 *
 * @param socket - The socket to read from.
 * @param timeoutMs - Optional timeout in milliseconds. Rejects with a timeout
 * error if no complete line is received within the limit.
 * @returns The line read (without trailing newline).
 */
export async function readLine(
  socket: Socket,
  timeoutMs?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('Socket read timed out'));
      }, timeoutMs);
    }

    const onData = (data: Buffer): void => {
      buffer += data.toString();
      const idx = buffer.indexOf('\n');
      if (idx !== -1) {
        cleanup();
        resolve(buffer.slice(0, idx));
      }
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const onEnd = (): void => {
      cleanup();
      reject(new Error('Socket closed before response received'));
    };

    const onClose = (): void => {
      cleanup();
      reject(new Error('Socket closed before response received'));
    };

    /**
     * Remove listeners registered by this call and clear the timeout.
     */
    function cleanup(): void {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('end', onEnd);
      socket.removeListener('close', onClose);
    }

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('end', onEnd);
    socket.once('close', onClose);
  });
}
