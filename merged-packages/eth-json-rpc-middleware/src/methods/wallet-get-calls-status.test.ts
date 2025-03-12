import type {
  Hex,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import { klona } from 'klona';

import type {
  GetCallsStatusHook,
  GetCallsStatusParams,
  GetCallsStatusResult,
} from './wallet-get-calls-status';
import { walletGetCallsStatus } from './wallet-get-calls-status';

const ID_MOCK = '0x12345678';

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

const RESULT_MOCK = {
  version: '1.0',
  id: ID_MOCK,
  chainId: '0x1',
  status: 1,
  receipts: [RECEIPT_MOCK, RECEIPT_MOCK],
};

describe('wallet_getCallsStatus', () => {
  let request: JsonRpcRequest<GetCallsStatusParams>;
  let params: GetCallsStatusParams;
  let response: PendingJsonRpcResponse<GetCallsStatusResult>;
  let getCallsStatusMock: jest.MockedFunction<GetCallsStatusHook>;

  async function callMethod() {
    return walletGetCallsStatus(request, response, {
      getCallsStatus: getCallsStatusMock,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    request = klona(REQUEST_MOCK);
    params = request.params as GetCallsStatusParams;
    response = {} as PendingJsonRpcResponse<GetCallsStatusResult>;

    getCallsStatusMock = jest.fn().mockResolvedValue(RESULT_MOCK);
  });

  it('calls hook', async () => {
    await callMethod();
    expect(getCallsStatusMock).toHaveBeenCalledWith(params[0], request);
  });

  it('returns result from hook', async () => {
    await callMethod();
    expect(response.result).toStrictEqual(RESULT_MOCK);
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

  it('throws if address is not hex', async () => {
    params[0] = '123' as Hex;

    await expect(callMethod()).rejects.toMatchInlineSnapshot(`
            [Error: Invalid params

            0 - Expected a string matching \`/^0x[0-9a-f]+$/\` but received "123"]
          `);
  });

  it('throws if address is empty', async () => {
    params[0] = '' as never;

    await expect(callMethod()).rejects.toMatchInlineSnapshot(`
            [Error: Invalid params

            0 - Expected a string matching \`/^0x[0-9a-f]+$/\` but received ""]
          `);
  });
});
