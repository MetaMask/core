import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';
import { klona } from 'klona';

import type {
  GetCapabilitiesHook,
  GetCapabilitiesParams,
  GetCapabilitiesResult,
} from './wallet-get-capabilities';
import { walletGetCapabilities } from './wallet-get-capabilities';

const ADDRESS_MOCK = '0x123abc123abc123abc123abc123abc123abc123a';
const CHAIN_ID_MOCK = '0x1';
const CHAIN_ID_2_MOCK = '0x2';

const RESULT_MOCK = {
  testCapability: {
    testKey: 'testValue',
  },
};

const REQUEST_MOCK = {
  params: [ADDRESS_MOCK],
};

describe('wallet_getCapabilities', () => {
  let request: JsonRpcRequest;
  let params: GetCapabilitiesParams;
  let response: PendingJsonRpcResponse<GetCapabilitiesResult>;
  let getCapabilitiesMock: jest.MockedFunction<GetCapabilitiesHook>;

  async function callMethod() {
    return walletGetCapabilities(request, response, {
      getCapabilities: getCapabilitiesMock,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    request = klona(REQUEST_MOCK) as JsonRpcRequest;
    params = request.params as GetCapabilitiesParams;
    response = {} as PendingJsonRpcResponse<GetCapabilitiesResult>;

    getCapabilitiesMock = jest.fn().mockResolvedValue(RESULT_MOCK);
  });

  it('calls hook', async () => {
    await callMethod();
    expect(getCapabilitiesMock).toHaveBeenCalledWith(
      params[0],
      undefined,
      request,
    );
  });

  it('calls hook with chain IDs', async () => {
    request.params = [ADDRESS_MOCK, [CHAIN_ID_MOCK, CHAIN_ID_2_MOCK]];

    await callMethod();

    expect(getCapabilitiesMock).toHaveBeenCalledWith(
      params[0],
      [CHAIN_ID_MOCK, CHAIN_ID_2_MOCK],
      request,
    );
  });

  it('returns capabilities from hook', async () => {
    await callMethod();
    expect(response.result).toStrictEqual(RESULT_MOCK);
  });

  it('throws if no hook', async () => {
    await expect(
      walletGetCapabilities(request, response, {}),
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

  it('throws if not hex', async () => {
    params[0] = 'test' as never;

    await expect(callMethod()).rejects.toMatchInlineSnapshot(`
            [Error: Invalid params

            0 - Expected a string matching \`/^0x[0-9a-fA-F]{40}$/\` but received "test"]
          `);
  });

  it('throws if wrong length', async () => {
    params[0] = '0x123' as never;

    await expect(callMethod()).rejects.toMatchInlineSnapshot(`
            [Error: Invalid params

            0 - Expected a string matching \`/^0x[0-9a-fA-F]{40}$/\` but received "0x123"]
          `);
  });
});
