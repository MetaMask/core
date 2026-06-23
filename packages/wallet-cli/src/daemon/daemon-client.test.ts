import type { JsonRpcResponse } from '@metamask/utils';
import { EventEmitter } from 'node:events';
import { createConnection } from 'node:net';
import type { Socket } from 'node:net';

import { sendCommand, pingDaemon } from './daemon-client';
import { readLine, writeLine } from './socket-line';

jest.mock('node:net');
jest.mock('./socket-line');

const mockCreateConnection = jest.mocked(createConnection);
const mockReadLine = jest.mocked(readLine);
const mockWriteLine = jest.mocked(writeLine);

/**
 * Create a mock Socket and wire up createConnection to return it.
 * The connection callback is deferred via process.nextTick to match
 * real behavior (the `socket` const must be assigned before the callback
 * references it).
 *
 * @returns The mock socket.
 */
function setupMockSocket(): Socket {
  const emitter = new EventEmitter();
  const socket = Object.assign(emitter, {
    destroy: jest.fn(),
    write: jest.fn(),
    removeListener: emitter.removeListener.bind(emitter),
  }) as unknown as Socket;

  mockCreateConnection.mockImplementation(
    (_path: unknown, callback: unknown) => {
      process.nextTick(() => (callback as () => void)());
      return socket;
    },
  );

  return socket;
}

/**
 * Build a JSON-RPC response that mirrors back the request id from the most
 * recent `mockWriteLine` call. `sendCommand` now verifies id correlation, so
 * static fixtures no longer work — the response must echo the generated id.
 *
 * @param overrides - Optional fields to override on the response.
 * @returns A function suitable for `mockReadLine.mockImplementation`.
 */
function respondWithMatchingId(
  overrides: Partial<JsonRpcResponse> = {},
): () => Promise<string> {
  return async () => {
    const lastWrite = mockWriteLine.mock.calls.at(-1)?.[1];
    const sentId =
      typeof lastWrite === 'string'
        ? (JSON.parse(lastWrite).id as string)
        : 'test-id';
    return JSON.stringify({
      jsonrpc: '2.0',
      id: sentId,
      result: { status: 'ok' },
      ...overrides,
    });
  };
}

describe('sendCommand', () => {
  it('sends a JSON-RPC request and returns the response', async () => {
    const socket = setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockImplementation(respondWithMatchingId());

    const response = await sendCommand({
      socketPath: '/tmp/test.sock',
      method: 'getStatus',
    });

    expect(mockCreateConnection).toHaveBeenCalledWith(
      '/tmp/test.sock',
      expect.any(Function),
    );
    expect(mockWriteLine).toHaveBeenCalledWith(
      socket,
      expect.stringContaining('"method":"getStatus"'),
    );
    expect(response.result).toStrictEqual({ status: 'ok' });
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('includes params when provided', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockImplementation(respondWithMatchingId());

    await sendCommand({
      socketPath: '/tmp/test.sock',
      method: 'test',
      params: { key: 'value' },
    });

    const written = mockWriteLine.mock.calls[0][1];
    expect(JSON.parse(written)).toHaveProperty('params', { key: 'value' });
  });

  it('omits params when undefined', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockImplementation(respondWithMatchingId());

    await sendCommand({
      socketPath: '/tmp/test.sock',
      method: 'test',
    });

    const written = mockWriteLine.mock.calls[0][1];
    expect(JSON.parse(written)).not.toHaveProperty('params');
  });

  it('passes timeoutMs to readLine', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockImplementation(respondWithMatchingId());

    await sendCommand({
      socketPath: '/tmp/test.sock',
      method: 'test',
      timeoutMs: 5000,
    });

    expect(mockReadLine).toHaveBeenCalledWith(expect.anything(), 5000);
  });

  it('throws when the response id does not match the request id', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockResolvedValue(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'unrelated-id',
        result: { status: 'ok' },
      }),
    );

    await expect(
      sendCommand({ socketPath: '/tmp/test.sock', method: 'test' }),
    ).rejects.toThrow(/does not match request id/u);
  });

  it('retries once on ECONNREFUSED', async () => {
    const socket = setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine
      .mockRejectedValueOnce(
        Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
      )
      .mockImplementationOnce(respondWithMatchingId());

    const response = await sendCommand({
      socketPath: '/tmp/test.sock',
      method: 'test',
    });

    expect(response.result).toStrictEqual({ status: 'ok' });
    expect(socket.destroy).toHaveBeenCalledTimes(2);
  });

  it('retries once on ECONNRESET', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine
      .mockRejectedValueOnce(
        Object.assign(new Error('reset'), { code: 'ECONNRESET' }),
      )
      .mockImplementationOnce(respondWithMatchingId());

    const response = await sendCommand({
      socketPath: '/tmp/test.sock',
      method: 'test',
    });

    expect(response).toHaveProperty('result');
  });

  it('does not retry on other errors', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockRejectedValue(new Error('parse error'));

    await expect(
      sendCommand({ socketPath: '/tmp/test.sock', method: 'test' }),
    ).rejects.toThrow('parse error');

    expect(mockReadLine).toHaveBeenCalledTimes(1);
  });

  it('destroys socket even when attempt throws', async () => {
    const socket = setupMockSocket();
    mockWriteLine.mockRejectedValue(new Error('write error'));

    await expect(
      sendCommand({ socketPath: '/tmp/test.sock', method: 'test' }),
    ).rejects.toThrow('write error');

    expect(socket.destroy).toHaveBeenCalled();
  });

  it('destroys each socket when the connection fails, including the retry', async () => {
    const sockets: Socket[] = [];
    mockCreateConnection.mockImplementation((_path: unknown) => {
      const emitter = new EventEmitter();
      const socket = Object.assign(emitter, {
        destroy: jest.fn(),
        write: jest.fn(),
        removeListener: emitter.removeListener.bind(emitter),
      }) as unknown as Socket;
      sockets.push(socket);
      process.nextTick(() =>
        socket.emit(
          'error',
          Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
        ),
      );
      return socket;
    });

    await expect(
      sendCommand({ socketPath: '/tmp/test.sock', method: 'test' }),
    ).rejects.toThrow('refused');

    expect(sockets).toHaveLength(2);
    sockets.forEach((socket) => expect(socket.destroy).toHaveBeenCalled());
  });
});

describe('pingDaemon', () => {
  /**
   * Configure `createConnection` to emit a connection error synchronously.
   *
   * @param code - The Node errno code (e.g. ENOENT, ECONNREFUSED) the mock
   * socket should emit on the next attempt.
   */
  function mockConnectionError(code: string): void {
    mockCreateConnection.mockImplementation((_path: unknown) => {
      const emitter = new EventEmitter();
      const socket = Object.assign(emitter, {
        destroy: jest.fn(),
        write: jest.fn(),
        removeListener: emitter.removeListener.bind(emitter),
      }) as unknown as Socket;
      process.nextTick(() =>
        socket.emit('error', Object.assign(new Error(code), { code })),
      );
      return socket;
    });
  }

  it('returns responsive when daemon responds', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockImplementation(respondWithMatchingId());

    expect(await pingDaemon('/tmp/test.sock')).toStrictEqual({
      status: 'responsive',
    });
  });

  it('returns absent when the socket file does not exist', async () => {
    mockConnectionError('ENOENT');

    expect(await pingDaemon('/tmp/test.sock')).toStrictEqual({
      status: 'absent',
    });
  });

  it('returns unreachable with reason=refused when the socket refuses connection', async () => {
    // ECONNREFUSED is retried once; both attempts will reject with the same
    // mock implementation.
    mockConnectionError('ECONNREFUSED');

    const result = await pingDaemon('/tmp/test.sock');
    expect(result).toStrictEqual({
      status: 'unreachable',
      reason: 'refused',
      error: expect.any(Error),
    });
  });

  it('returns unreachable with reason=permission on EACCES', async () => {
    mockConnectionError('EACCES');

    const result = await pingDaemon('/tmp/test.sock');
    expect(result).toMatchObject({
      status: 'unreachable',
      reason: 'permission',
    });
  });

  it('returns unreachable with reason=timeout when the socket read times out', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockRejectedValue(new Error('Socket read timed out'));

    const result = await pingDaemon('/tmp/test.sock');
    expect(result).toMatchObject({
      status: 'unreachable',
      reason: 'timeout',
    });
  });

  it('returns unreachable with reason=protocol on a JSON-RPC id mismatch', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockResolvedValue(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 'unrelated-id',
        result: { status: 'ok' },
      }),
    );

    const result = await pingDaemon('/tmp/test.sock');
    expect(result).toMatchObject({
      status: 'unreachable',
      reason: 'protocol',
    });
  });

  it('returns unreachable with reason=protocol on a JSON parse error', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockResolvedValue('not json');

    const result = await pingDaemon('/tmp/test.sock');
    expect(result).toMatchObject({
      status: 'unreachable',
      reason: 'protocol',
    });
  });

  it('returns unreachable with reason=other for unclassified errors', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockRejectedValue(new Error('something weird'));

    const result = await pingDaemon('/tmp/test.sock');
    expect(result).toMatchObject({
      status: 'unreachable',
      reason: 'other',
    });
  });

  it('normalizes non-Error throws into an Error instance', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    // Simulate a non-Error throw; the producer must normalize it.
    mockReadLine.mockImplementation(async () =>
      Promise.reject('string-throw' as unknown as Error),
    );

    const result = await pingDaemon('/tmp/test.sock');
    expect(result).toStrictEqual({
      status: 'unreachable',
      reason: 'other',
      error: expect.objectContaining({ message: 'string-throw' }),
    });
  });
});
