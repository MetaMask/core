// intent-api.test.ts
import { describe, it, expect, jest } from '@jest/globals';
import { IntentApiImpl, type IntentSubmissionParams } from './intent-api'; // adjust if needed
import type { FetchFunction } from '../types'; // adjust if needed

describe('IntentApiImpl', () => {
  const baseUrl = 'https://example.com/api';

  const makeParams = (): IntentSubmissionParams => ({
    srcChainId: '1',
    quoteId: 'quote-123',
    signature: '0xsig',
    order: { some: 'payload' },
    userAddress: '0xabc',
    aggregatorId: 'agg-1',
  });

  // Key part: strongly type the mock as FetchFunction (returns Promise<unknown>)
  const makeFetchMock = () =>
    jest.fn<ReturnType<FetchFunction>, Parameters<FetchFunction>>();

  it('submitIntent calls POST /submitOrder with JSON body and returns response', async () => {
    const fetchFn = makeFetchMock().mockResolvedValue({ ok: true, id: 'resp' });
    const api = new IntentApiImpl(baseUrl, fetchFn);

    const params = makeParams();
    const result = await api.submitIntent(params);

    expect(result).toEqual({ ok: true, id: 'resp' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(`${baseUrl}/submitOrder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  });

  it('submitIntent rethrows Errors with a prefixed message', async () => {
    const fetchFn = makeFetchMock().mockRejectedValue(new Error('boom'));
    const api = new IntentApiImpl(baseUrl, fetchFn);

    await expect(api.submitIntent(makeParams())).rejects.toThrow(
      'Failed to submit intent: boom',
    );
  });

  it('submitIntent returns null when rejection is not an Error', async () => {
    const fetchFn = makeFetchMock().mockRejectedValue('boom');
    const api = new IntentApiImpl(baseUrl, fetchFn);

    await expect(api.submitIntent(makeParams())).resolves.toBeNull();
  });

  it('getOrderStatus calls GET /getOrderStatus with encoded query params and returns response', async () => {
    const fetchFn = makeFetchMock().mockResolvedValue({ status: 'filled' });
    const api = new IntentApiImpl(baseUrl, fetchFn);

    const orderId = 'order-1';
    const aggregatorId = 'My Agg/With Spaces';
    const srcChainId = '10';

    const result = await api.getOrderStatus(orderId, aggregatorId, srcChainId);

    expect(result).toEqual({ status: 'filled' });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    const expectedEndpoint =
      `${baseUrl}/getOrderStatus` +
      `?orderId=${orderId}` +
      `&aggregatorId=${encodeURIComponent(aggregatorId)}` +
      `&srcChainId=${srcChainId}`;

    expect(fetchFn).toHaveBeenCalledWith(expectedEndpoint, { method: 'GET' });
  });

  it('getOrderStatus rethrows Errors with a prefixed message', async () => {
    const fetchFn = makeFetchMock().mockRejectedValue(new Error('nope'));
    const api = new IntentApiImpl(baseUrl, fetchFn);

    await expect(api.getOrderStatus('o', 'a', '1')).rejects.toThrow(
      'Failed to get order status: nope',
    );
  });

  it('getOrderStatus returns null when rejection is not an Error', async () => {
    const fetchFn = makeFetchMock().mockRejectedValue({ message: 'nope' });
    const api = new IntentApiImpl(baseUrl, fetchFn);

    await expect(api.getOrderStatus('o', 'a', '1')).resolves.toBeNull();
  });
});
