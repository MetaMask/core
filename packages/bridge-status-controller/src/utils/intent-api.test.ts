/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusTypes } from '@metamask/bridge-controller';
import { TransactionStatus } from '@metamask/transaction-controller';

import {
  IntentApiImpl,
  translateIntentOrderToBridgeStatus,
} from './intent-api';
import type { IntentSubmissionParams } from './intent-api';
import { IntentOrderStatus } from './validators';
import type { FetchFunction } from '../types';

describe('IntentApiImpl', () => {
  const baseUrl = 'https://example.com/api';
  const clientId = 'client-id';

  const makeParams = (): IntentSubmissionParams => ({
    srcChainId: '1',
    quoteId: 'quote-123',
    signature: '0xsig',
    order: { some: 'payload' },
    userAddress: '0xabc',
    aggregatorId: 'agg-1',
  });

  const makeFetchMock = (): any =>
    jest.fn<ReturnType<FetchFunction>, Parameters<FetchFunction>>();

  const validIntentOrderResponse = {
    id: 'order-1',
    status: IntentOrderStatus.SUBMITTED,
    metadata: {},
  };

  it('submitIntent calls POST /submitOrder with JSON body and returns response', async () => {
    const fetchFn = makeFetchMock().mockResolvedValue(validIntentOrderResponse);
    const api = new IntentApiImpl(baseUrl, fetchFn);

    const params = makeParams();
    const result = await api.submitIntent(params, clientId);

    expect(result).toStrictEqual(validIntentOrderResponse);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(`${baseUrl}/submitOrder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': clientId,
      },
      body: JSON.stringify(params),
    });
  });

  it('submitIntent rethrows Errors with a prefixed message', async () => {
    const fetchFn = makeFetchMock().mockRejectedValue(new Error('boom'));
    const api = new IntentApiImpl(baseUrl, fetchFn);

    await expect(api.submitIntent(makeParams(), clientId)).rejects.toThrow(
      'Failed to submit intent: boom',
    );
  });

  it('submitIntent throws generic error when rejection is not an Error', async () => {
    const fetchFn = makeFetchMock().mockRejectedValue('boom');
    const api = new IntentApiImpl(baseUrl, fetchFn);

    await expect(api.submitIntent(makeParams(), clientId)).rejects.toThrow(
      'Failed to submit intent',
    );
  });

  it('getOrderStatus calls GET /getOrderStatus with encoded query params and returns response', async () => {
    const fetchFn = makeFetchMock().mockResolvedValue(validIntentOrderResponse);
    const api = new IntentApiImpl(baseUrl, fetchFn);

    const orderId = 'order-1';
    const aggregatorId = 'My Agg/With Spaces';
    const srcChainId = '10';

    const result = await api.getOrderStatus(
      orderId,
      aggregatorId,
      srcChainId,
      clientId,
    );

    expect(result).toStrictEqual(validIntentOrderResponse);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const expectedEndpoint =
      `${baseUrl}/getOrderStatus` +
      `?orderId=${orderId}` +
      `&aggregatorId=${encodeURIComponent(aggregatorId)}` +
      `&srcChainId=${srcChainId}`;

    expect(fetchFn).toHaveBeenCalledWith(expectedEndpoint, {
      method: 'GET',
      headers: {
        'X-Client-Id': clientId,
      },
    });
  });

  it('getOrderStatus rethrows Errors with a prefixed message', async () => {
    const fetchFn = makeFetchMock().mockRejectedValue(new Error('nope'));
    const api = new IntentApiImpl(baseUrl, fetchFn);

    await expect(api.getOrderStatus('o', 'a', '1', clientId)).rejects.toThrow(
      'Failed to get order status: nope',
    );
  });

  it('getOrderStatus throws generic error when rejection is not an Error', async () => {
    const fetchFn = makeFetchMock().mockRejectedValue({ message: 'nope' });
    const api = new IntentApiImpl(baseUrl, fetchFn);

    await expect(api.getOrderStatus('o', 'a', '1', clientId)).rejects.toThrow(
      'Failed to get order status',
    );
  });

  it('submitIntent throws when response fails validation', async () => {
    const fetchFn = makeFetchMock().mockResolvedValue({
      foo: 'bar', // invalid IntentOrder shape
    } as any);

    const api = new IntentApiImpl(baseUrl, fetchFn);

    await expect(api.submitIntent(makeParams(), clientId)).rejects.toThrow(
      'Failed to submit intent: Invalid submitOrder response',
    );
  });

  it('getOrderStatus throws when response fails validation', async () => {
    const fetchFn = makeFetchMock().mockResolvedValue({
      foo: 'bar', // invalid IntentOrder shape
    } as any);

    const api = new IntentApiImpl(baseUrl, fetchFn);

    await expect(
      api.getOrderStatus('order-1', 'agg', '1', clientId),
    ).rejects.toThrow(
      'Failed to get order status: Invalid getOrderStatus response',
    );
  });

  describe('translateIntentOrderToBridgeStatus', () => {
    it('maps completed intent to COMPLETE and confirmed transaction status', () => {
      const translation = translateIntentOrderToBridgeStatus(
        {
          id: 'order-1',
          status: IntentOrderStatus.COMPLETED,
          txHash: '0xhash1',
          metadata: { txHashes: ['0xhash1', '0xhash2'] },
        },
        1,
      );

      expect(translation.status).toStrictEqual({
        status: StatusTypes.COMPLETE,
        srcChain: {
          chainId: 1,
          txHash: '0xhash1',
        },
      });
      expect(translation.srcTxHashes).toStrictEqual(['0xhash1', '0xhash2']);
      expect(translation.transactionStatus).toBe(TransactionStatus.confirmed);
    });

    it('maps cancelled intent to FAILED and falls back to metadata tx hash', () => {
      const translation = translateIntentOrderToBridgeStatus(
        {
          id: 'order-2',
          status: IntentOrderStatus.CANCELLED,
          metadata: { txHashes: '0xmetadatahash' },
        },
        10,
        '0xfallback',
      );

      expect(translation.status.status).toBe(StatusTypes.FAILED);
      expect(translation.status.srcChain).toStrictEqual({
        chainId: 10,
        txHash: '0xfallback',
      });
      expect(translation.srcTxHashes).toStrictEqual(['0xmetadatahash']);
      expect(translation.transactionStatus).toBe(TransactionStatus.failed);
    });
    it('prefers txHash when metadata is empty and returns empty hashes when none exist', () => {
      const withTxHash = translateIntentOrderToBridgeStatus(
        {
          id: 'order-3',
          status: IntentOrderStatus.SUBMITTED,
          txHash: '0xonlyhash',
          metadata: { txHashes: [] },
        },
        1,
      );

      expect(withTxHash.srcTxHashes).toStrictEqual(['0xonlyhash']);

      const withoutHashes = translateIntentOrderToBridgeStatus(
        {
          id: 'order-4',
          status: IntentOrderStatus.SUBMITTED,
          metadata: { txHashes: '' },
        },
        1,
      );

      expect(withoutHashes.srcTxHashes).toStrictEqual([]);
      expect(withoutHashes.status.status).toBe(StatusTypes.SUBMITTED);

      const emptyMetadataWithTxHash = translateIntentOrderToBridgeStatus(
        {
          id: 'order-5',
          status: IntentOrderStatus.SUBMITTED,
          txHash: '0xfallbackhash',
          metadata: { txHashes: '' },
        },
        1,
      );

      expect(emptyMetadataWithTxHash.srcTxHashes).toStrictEqual([
        '0xfallbackhash',
      ]);
    });
  });
});
