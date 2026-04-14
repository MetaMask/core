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

const VALID_RESPONSE: JsonRpcResponse = {
  jsonrpc: '2.0',
  id: 'test-id',
  result: { status: 'ok' },
};

describe('sendCommand', () => {
  it('sends a JSON-RPC request and returns the response', async () => {
    const socket = setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockResolvedValue(JSON.stringify(VALID_RESPONSE));

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
    mockReadLine.mockResolvedValue(JSON.stringify(VALID_RESPONSE));

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
    mockReadLine.mockResolvedValue(JSON.stringify(VALID_RESPONSE));

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
    mockReadLine.mockResolvedValue(JSON.stringify(VALID_RESPONSE));

    await sendCommand({
      socketPath: '/tmp/test.sock',
      method: 'test',
      timeoutMs: 5000,
    });

    expect(mockReadLine).toHaveBeenCalledWith(expect.anything(), 5000);
  });

  it('retries once on ECONNREFUSED', async () => {
    const socket = setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine
      .mockRejectedValueOnce(
        Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
      )
      .mockResolvedValueOnce(JSON.stringify(VALID_RESPONSE));

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
      .mockResolvedValueOnce(JSON.stringify(VALID_RESPONSE));

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
});

describe('pingDaemon', () => {
  it('returns true when daemon responds', async () => {
    setupMockSocket();
    mockWriteLine.mockResolvedValue(undefined);
    mockReadLine.mockResolvedValue(JSON.stringify(VALID_RESPONSE));

    expect(await pingDaemon('/tmp/test.sock')).toBe(true);
  });

  it('returns false when daemon is unresponsive', async () => {
    mockCreateConnection.mockImplementation((_path: unknown) => {
      const emitter = new EventEmitter();
      const socket = Object.assign(emitter, {
        destroy: jest.fn(),
        write: jest.fn(),
        removeListener: emitter.removeListener.bind(emitter),
      }) as unknown as Socket;
      process.nextTick(() =>
        socket.emit(
          'error',
          Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }),
        ),
      );
      return socket;
    });

    expect(await pingDaemon('/tmp/test.sock')).toBe(false);
  });
});
