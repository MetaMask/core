import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';
import { klona } from 'klona';

import type {
  GetCallsStatusParams,
  GetCallsStatusResult,
  GetTransactionReceiptsByBatchIdHook,
} from './wallet-get-calls-status';
import { walletGetCallsStatus } from './wallet-get-calls-status';

const ID_MOCK = '1234-5678';

const RECEIPT_MOCK = {
  logs: [
    {
      address: '0x123abc123abc123abc123abc123abc123abc123a',
      data: '0x123abc',
      topics: ['0x123abc'],
    },
  ],
  status: '0x1',
  chainId: '0x1',
  blockHash: '0x123abc',
  blockNumber: '0x1',
  gasUsed: '0x1',
  transactionHash: '0x123abc',
};

const REQUEST_MOCK = {
  params: [ID_MOCK],
} as unknown as JsonRpcRequest<GetCallsStatusParams>;

describe('wallet_getCallsStatus', () => {
  let request: JsonRpcRequest<GetCallsStatusParams>;
  let params: GetCallsStatusParams;
  let response: PendingJsonRpcResponse<GetCallsStatusResult>;
  let getTransactionReceiptsByBatchIdMock: jest.MockedFunction<GetTransactionReceiptsByBatchIdHook>;

  async function callMethod() {
    return walletGetCallsStatus(request, response, {
      getTransactionReceiptsByBatchId: getTransactionReceiptsByBatchIdMock,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    request = klona(REQUEST_MOCK);
    params = request.params as GetCallsStatusParams;
    response = {} as PendingJsonRpcResponse<GetCallsStatusResult>;

    getTransactionReceiptsByBatchIdMock = jest
      .fn()
      .mockResolvedValue([RECEIPT_MOCK, RECEIPT_MOCK]);
  });

  it('calls hook', async () => {
    await callMethod();
    expect(getTransactionReceiptsByBatchIdMock).toHaveBeenCalledWith(
      params[0],
      request,
    );
  });

  it('returns confirmed status if all receipts available', async () => {
    await callMethod();
    expect(response.result?.status).toBe('CONFIRMED');
  });

  it('returns pending status if missing receipts', async () => {
    getTransactionReceiptsByBatchIdMock = jest
      .fn()
      .mockResolvedValue([RECEIPT_MOCK, undefined]);

    await callMethod();
    expect(response.result?.status).toBe('PENDING');
    expect(response.result?.receipts).toBeNull();
  });

  it('returns receipts', async () => {
    await callMethod();

    expect(response.result?.receipts).toStrictEqual([
      RECEIPT_MOCK,
      RECEIPT_MOCK,
    ]);
  });

  it('returns null if no receipts', async () => {
    getTransactionReceiptsByBatchIdMock = jest.fn().mockResolvedValue([]);

    await callMethod();
    expect(response.result).toBeNull();
  });

  it('throws if no hook', async () => {
    await expect(
      walletGetCallsStatus(request, response, {}),
    ).rejects.toMatchInlineSnapshot(`[Error: Method not supported.]`);
  });

  it('throws if no params', async () => {
    request.params = undefined;

    await expect(callMethod()).rejects.toMatchInlineSnapshot(`
            [Error: Invalid params

            Expected an array, but received: undefined]
          `);
  });

  it('throws if wrong type', async () => {
    params[0] = 123 as never;

    await expect(callMethod()).rejects.toMatchInlineSnapshot(`
            [Error: Invalid params

            0 - Expected a string, but received: 123]
          `);
  });

  it('throws if empty', async () => {
    params[0] = '';

    await expect(callMethod()).rejects.toMatchInlineSnapshot(`
            [Error: Invalid params

            0 - Expected a nonempty string but received an empty one]
          `);
  });

  it('removes excess properties from receipts', async () => {
    getTransactionReceiptsByBatchIdMock.mockResolvedValue([
      {
        ...RECEIPT_MOCK,
        extra: 'value1',
        logs: [{ ...RECEIPT_MOCK.logs[0], extra2: 'value2' }],
      } as never,
    ]);

    await callMethod();

    expect(response.result?.receipts).toStrictEqual([RECEIPT_MOCK]);
  });
});
