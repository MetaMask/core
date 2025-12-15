import type { PollingBlockTracker } from '@metamask/eth-block-tracker';
import { JsonRpcEngineV2 } from '@metamask/json-rpc-engine/v2';
import { rpcErrors } from '@metamask/rpc-errors';
import { Hex, Json } from '@metamask/utils';

import { createBlockTrackerInspectorMiddleware } from './block-tracker-inspector';
import {
  createFinalMiddlewareWithDefaultResult,
  createRequest,
} from '../test/util/helpers';

const createMockBlockTracker = (): PollingBlockTracker => {
  return {
    getCurrentBlock: jest.fn().mockReturnValue('0x123'),
    checkForLatestBlock: jest.fn().mockResolvedValue(undefined),
  } as unknown as PollingBlockTracker;
};

describe('createBlockTrackerInspectorMiddleware', () => {
  describe('method filtering', () => {
    it('processes eth_getTransactionByHash requests', async () => {
      const mockBlockTracker = createMockBlockTracker();
      const getCurrentBlockSpy = jest.spyOn(
        mockBlockTracker,
        'getCurrentBlock',
      );
      const checkForLatestBlockSpy = jest.spyOn(
        mockBlockTracker,
        'checkForLatestBlock',
      );

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockTrackerInspectorMiddleware({
            blockTracker: mockBlockTracker,
          }),
          (): { blockNumber: Hex; hash: Hex } => ({
            blockNumber: '0x123', // Same as current block
            hash: '0xabc',
          }),
        ],
      });

      const request = createRequest({
        method: 'eth_getTransactionByHash',
        params: ['0xhash'],
      });

      await engine.handle(request);

      expect(getCurrentBlockSpy).toHaveBeenCalledTimes(1);
      expect(checkForLatestBlockSpy).not.toHaveBeenCalled();
    });

    it('processes eth_getTransactionReceipt requests', async () => {
      const mockBlockTracker = createMockBlockTracker();
      const getCurrentBlockSpy = jest.spyOn(
        mockBlockTracker,
        'getCurrentBlock',
      );
      const checkForLatestBlockSpy = jest.spyOn(
        mockBlockTracker,
        'checkForLatestBlock',
      );

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockTrackerInspectorMiddleware({
            blockTracker: mockBlockTracker,
          }),
          (): { blockNumber: Hex; transactionHash: Hex } => ({
            blockNumber: '0x123', // Same as current block
            transactionHash: '0xdef',
          }),
        ],
      });

      const request = createRequest({
        method: 'eth_getTransactionReceipt',
        params: ['0xhash'],
      });

      await engine.handle(request);

      expect(getCurrentBlockSpy).toHaveBeenCalledTimes(1);
      expect(checkForLatestBlockSpy).not.toHaveBeenCalled();
    });

    it('skips processing for non-inspected methods', async () => {
      const mockBlockTracker = createMockBlockTracker();
      const getCurrentBlockSpy = jest.spyOn(
        mockBlockTracker,
        'getCurrentBlock',
      );
      const checkForLatestBlockSpy = jest.spyOn(
        mockBlockTracker,
        'checkForLatestBlock',
      );

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockTrackerInspectorMiddleware({
            blockTracker: mockBlockTracker,
          }),
          createFinalMiddlewareWithDefaultResult(),
        ],
      });

      const request = createRequest({
        method: 'eth_chainId', // Not in futureBlockRefRequests
      });

      await engine.handle(request);

      expect(getCurrentBlockSpy).not.toHaveBeenCalled();
      expect(checkForLatestBlockSpy).not.toHaveBeenCalled();
    });
  });

  describe('block tracker update logic', () => {
    it('calls checkForLatestBlock when response block number is higher than current', async () => {
      const mockBlockTracker = createMockBlockTracker();
      jest.spyOn(mockBlockTracker, 'getCurrentBlock').mockReturnValue('0x100');
      const checkForLatestBlockSpy = jest.spyOn(
        mockBlockTracker,
        'checkForLatestBlock',
      );

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockTrackerInspectorMiddleware({
            blockTracker: mockBlockTracker,
          }),
          (): { blockNumber: Hex; hash: Hex } => ({
            blockNumber: '0x200', // Higher than current block (0x100)
            hash: '0xabc',
          }),
        ],
      });

      const request = createRequest({
        method: 'eth_getTransactionByHash',
        params: ['0xhash'],
      });

      await engine.handle(request);

      expect(checkForLatestBlockSpy).toHaveBeenCalledTimes(1);
    });

    it('does not call checkForLatestBlock when response block number equals current', async () => {
      const mockBlockTracker = createMockBlockTracker();
      jest.spyOn(mockBlockTracker, 'getCurrentBlock').mockReturnValue('0x100');
      const checkForLatestBlockSpy = jest.spyOn(
        mockBlockTracker,
        'checkForLatestBlock',
      );

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockTrackerInspectorMiddleware({
            blockTracker: mockBlockTracker,
          }),
          (): { blockNumber: Hex; hash: Hex } => ({
            blockNumber: '0x100', // Equals current block (0x100)
            hash: '0xabc',
          }),
        ],
      });

      const request = createRequest({
        method: 'eth_getTransactionByHash',
        params: ['0xhash'],
      });

      await engine.handle(request);

      expect(checkForLatestBlockSpy).not.toHaveBeenCalled();
    });

    it('does not call checkForLatestBlock when response block number is lower than current', async () => {
      const mockBlockTracker = createMockBlockTracker();
      jest.spyOn(mockBlockTracker, 'getCurrentBlock').mockReturnValue('0x200');
      const checkForLatestBlockSpy = jest.spyOn(
        mockBlockTracker,
        'checkForLatestBlock',
      );

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockTrackerInspectorMiddleware({
            blockTracker: mockBlockTracker,
          }),
          (): { blockNumber: Hex; hash: Hex } => ({
            blockNumber: '0x100', // Lower than current block (0x200)
            hash: '0xabc',
          }),
        ],
      });

      const request = createRequest({
        method: 'eth_getTransactionByHash',
        params: ['0xhash'],
      });

      await engine.handle(request);

      expect(checkForLatestBlockSpy).not.toHaveBeenCalled();
    });

    it('handles null current block gracefully', async () => {
      const mockBlockTracker = createMockBlockTracker();
      const getCurrentBlockSpy = jest
        .spyOn(mockBlockTracker, 'getCurrentBlock')
        .mockReturnValue(null);
      const checkForLatestBlockSpy = jest.spyOn(
        mockBlockTracker,
        'checkForLatestBlock',
      );

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockTrackerInspectorMiddleware({
            blockTracker: mockBlockTracker,
          }),
          (): { blockNumber: Hex; hash: Hex } => ({
            blockNumber: '0x100',
            hash: '0xabc',
          }),
        ],
      });

      const request = createRequest({
        method: 'eth_getTransactionByHash',
        params: ['0xhash'],
      });

      await engine.handle(request);

      expect(getCurrentBlockSpy).toHaveBeenCalledTimes(1);
      expect(checkForLatestBlockSpy).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('skips processing for error responses', async () => {
      const mockBlockTracker = createMockBlockTracker();
      const getCurrentBlockSpy = jest.spyOn(
        mockBlockTracker,
        'getCurrentBlock',
      );
      const checkForLatestBlockSpy = jest.spyOn(
        mockBlockTracker,
        'checkForLatestBlock',
      );
      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockTrackerInspectorMiddleware({
            blockTracker: mockBlockTracker,
          }),
          (): never => {
            throw rpcErrors.internal('Internal error');
          },
        ],
      });

      const request = createRequest({
        method: 'eth_getTransactionByHash',
        params: ['0xhash'],
      });

      await expect(engine.handle(request)).rejects.toThrow(
        rpcErrors.internal('Internal error'),
      );

      expect(getCurrentBlockSpy).not.toHaveBeenCalled();
      expect(checkForLatestBlockSpy).not.toHaveBeenCalled();
    });

    it.each([
      { result: null, description: 'falsy' },
      { result: 'foo', description: 'string' },
      { result: {}, description: 'object with no blockNumber property' },
    ])(
      'skips processing for result values: $description',
      async ({ result }) => {
        const mockBlockTracker = createMockBlockTracker();
        const getCurrentBlockSpy = jest
          .spyOn(mockBlockTracker, 'getCurrentBlock')
          .mockReturnValue('0x100');
        const checkForLatestBlockSpy = jest.spyOn(
          mockBlockTracker,
          'checkForLatestBlock',
        );
        const engine = JsonRpcEngineV2.create({
          middleware: [
            createBlockTrackerInspectorMiddleware({
              blockTracker: mockBlockTracker,
            }),
            (): Json => result,
          ],
        });

        const request = createRequest({
          method: 'eth_getTransactionByHash',
          params: ['0xhash'],
        });

        await engine.handle(request);

        expect(getCurrentBlockSpy).not.toHaveBeenCalled();
        expect(checkForLatestBlockSpy).not.toHaveBeenCalled();
      },
    );

    it('skips processing for non-string block numbers', async () => {
      const mockBlockTracker = createMockBlockTracker();
      const getCurrentBlockSpy = jest
        .spyOn(mockBlockTracker, 'getCurrentBlock')
        .mockReturnValue('0x100');
      const checkForLatestBlockSpy = jest.spyOn(
        mockBlockTracker,
        'checkForLatestBlock',
      );

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockTrackerInspectorMiddleware({
            blockTracker: mockBlockTracker,
          }),
          (): { blockNumber: number; hash: Hex } => ({
            blockNumber: 123,
            hash: '0xabc',
          }),
        ],
      });

      const request = createRequest({
        method: 'eth_getTransactionByHash',
        params: ['0xhash'],
      });

      await engine.handle(request);

      expect(getCurrentBlockSpy).not.toHaveBeenCalled();
      expect(checkForLatestBlockSpy).not.toHaveBeenCalled();
    });

    it('handles malformed hex block numbers gracefully', async () => {
      const mockBlockTracker = createMockBlockTracker();
      jest.spyOn(mockBlockTracker, 'getCurrentBlock').mockReturnValue('0x100');
      const checkForLatestBlockSpy = jest.spyOn(
        mockBlockTracker,
        'checkForLatestBlock',
      );

      const engine = JsonRpcEngineV2.create({
        middleware: [
          createBlockTrackerInspectorMiddleware({
            blockTracker: mockBlockTracker,
          }),
          (): { blockNumber: string; hash: Hex } => ({
            blockNumber: 'not-a-hex-number',
            hash: '0xabc',
          }),
        ],
      });

      const request = createRequest({
        method: 'eth_getTransactionByHash',
        params: ['0xhash'],
      });

      await engine.handle(request);

      // parseInt('not-a-hex-number', 16) returns NaN, and NaN > 256 is false
      expect(checkForLatestBlockSpy).not.toHaveBeenCalled();
    });
  });
});
