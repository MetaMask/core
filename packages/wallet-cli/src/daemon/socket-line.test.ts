import { EventEmitter } from 'node:events';
import type { Socket } from 'node:net';

import { readLine, writeLine } from './socket-line.js';

/**
 * Create a mock Socket backed by EventEmitter.
 *
 * @returns A mock socket.
 */
function createMockSocket(): Socket {
  const emitter = new EventEmitter();
  const socket = Object.assign(emitter, {
    write: jest.fn(),
    destroy: jest.fn(),
  });
  return socket as unknown as Socket;
}

describe('writeLine', () => {
  it('writes the line with a trailing newline', async () => {
    const socket = createMockSocket();
    (socket.write as jest.Mock).mockImplementation(
      (_data: string, callback: (writeError?: Error) => void) => callback(),
    );

    await writeLine(socket, 'hello');
    expect(socket.write).toHaveBeenCalledWith('hello\n', expect.any(Function));
  });

  it('rejects when socket.write returns an error', async () => {
    const socket = createMockSocket();
    const writeError = new Error('write failed');
    (socket.write as jest.Mock).mockImplementation(
      (_data: string, callback: (e?: Error) => void) => callback(writeError),
    );

    await expect(writeLine(socket, 'hello')).rejects.toThrow('write failed');
  });

  it('keeps an error listener for the trailing event a failed write also emits', async () => {
    const socket = createMockSocket();
    const writeError = Object.assign(new Error('EPIPE'), { code: 'EPIPE' });
    (socket.write as jest.Mock).mockImplementation(
      (_data: string, callback: (e?: Error) => void) => callback(writeError),
    );

    await expect(writeLine(socket, 'hello')).rejects.toThrow('EPIPE');

    // A failed write also emits a trailing 'error' event; a listener must
    // survive to handle it, or Node crashes with "Unhandled 'error' event".
    expect(socket.listenerCount('error')).toBe(1);
    expect(() => socket.emit('error', writeError)).not.toThrow();
    // Once it fires, the listener detaches itself.
    expect(socket.listenerCount('error')).toBe(0);
  });

  it('rejects when the socket emits an error before the write completes', async () => {
    const socket = createMockSocket();
    // Never invoke the write callback; the failure arrives via the 'error' event.
    (socket.write as jest.Mock).mockImplementation(() => undefined);

    const promise = writeLine(socket, 'hello');
    socket.emit('error', new Error('connection reset'));

    await expect(promise).rejects.toThrow('connection reset');
  });

  it('removes the error listener after a successful write', async () => {
    const socket = createMockSocket();
    (socket.write as jest.Mock).mockImplementation(
      (_data: string, callback: (writeError?: Error) => void) => callback(),
    );

    await writeLine(socket, 'hello');
    expect(socket.listenerCount('error')).toBe(0);
  });
});

describe('readLine', () => {
  it('resolves with the line when data contains a newline', async () => {
    const socket = createMockSocket();
    const promise = readLine(socket);

    socket.emit('data', Buffer.from('hello\n'));
    expect(await promise).toBe('hello');
  });

  it('accumulates data across multiple events', async () => {
    const socket = createMockSocket();
    const promise = readLine(socket);

    socket.emit('data', Buffer.from('hel'));
    socket.emit('data', Buffer.from('lo\n'));
    expect(await promise).toBe('hello');
  });

  it('rejects on socket error', async () => {
    const socket = createMockSocket();
    const promise = readLine(socket);

    socket.emit('error', new Error('socket error'));
    await expect(promise).rejects.toThrow('socket error');
  });

  it('rejects on socket end', async () => {
    const socket = createMockSocket();
    const promise = readLine(socket);

    socket.emit('end');
    await expect(promise).rejects.toThrow(
      'Socket closed before response received',
    );
  });

  it('rejects on socket close', async () => {
    const socket = createMockSocket();
    const promise = readLine(socket);

    socket.emit('close');
    await expect(promise).rejects.toThrow(
      'Socket closed before response received',
    );
  });

  it('settles once and cleans up when end is followed by close', async () => {
    const socket = createMockSocket();
    const promise = readLine(socket);

    socket.emit('end');
    socket.emit('close');

    await expect(promise).rejects.toThrow(
      'Socket closed before response received',
    );
    expect(socket.listenerCount('end')).toBe(0);
    expect(socket.listenerCount('close')).toBe(0);
  });

  it('rejects after timeout when no complete line received', async () => {
    jest.useFakeTimers();
    const socket = createMockSocket();
    const promise = readLine(socket, 500);

    jest.advanceTimersByTime(500);
    await expect(promise).rejects.toThrow('Socket read timed out');
    jest.useRealTimers();
  });

  it('resolves before timeout when data arrives in time', async () => {
    jest.useFakeTimers();
    const socket = createMockSocket();
    const promise = readLine(socket, 5000);

    socket.emit('data', Buffer.from('hello\n'));
    expect(await promise).toBe('hello');
    jest.useRealTimers();
  });

  it('cleans up listeners after resolving', async () => {
    const socket = createMockSocket();
    const promise = readLine(socket);

    socket.emit('data', Buffer.from('hello\n'));
    await promise;

    expect(socket.listenerCount('data')).toBe(0);
    expect(socket.listenerCount('error')).toBe(0);
    expect(socket.listenerCount('end')).toBe(0);
    expect(socket.listenerCount('close')).toBe(0);
  });
});
