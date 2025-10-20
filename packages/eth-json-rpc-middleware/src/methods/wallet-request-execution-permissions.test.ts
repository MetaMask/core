import type { JsonRpcRequest, PendingJsonRpcResponse } from '@metamask/utils';
import { klona } from 'klona';

import type {
  ProcessRequestExecutionPermissionsHook,
  RequestExecutionPermissionsRequestParams,
  RequestExecutionPermissionsResult,
} from './wallet-request-execution-permissions';
import { walletRequestExecutionPermissions } from './wallet-request-execution-permissions';

const ADDRESS_MOCK = '0x123abc123abc123abc123abc123abc123abc123a';
const CHAIN_ID_MOCK = '0x1';
const CONTEXT_MOCK = '0x123abc';

const REQUEST_MOCK = {
  params: [
    {
      chainId: CHAIN_ID_MOCK,
      address: ADDRESS_MOCK,
      signer: {
        type: 'account',
        data: {
          address: ADDRESS_MOCK,
        },
      },
      permission: {
        type: 'test-permission',
        isAdjustmentAllowed: true,
        data: { key: 'value' },
      },
      rules: [
        {
          type: 'test-rule',
          isAdjustmentAllowed: false,
          data: { ruleKey: 'ruleValue' },
        },
      ],
    },
  ],
} as unknown as JsonRpcRequest;

const RESULT_MOCK: RequestExecutionPermissionsResult = [
  {
    chainId: CHAIN_ID_MOCK,
    address: ADDRESS_MOCK,
    signer: {
      type: 'account',
      data: { address: ADDRESS_MOCK },
    },
    permission: {
      type: 'test-permission',
      isAdjustmentAllowed: true,
      data: { key: 'value' },
    },
    rules: [
      {
        type: 'test-rule',
        isAdjustmentAllowed: false,
        data: { ruleKey: 'ruleValue' },
      },
    ],
    context: CONTEXT_MOCK,
  },
];

describe('wallet_requestExecutionPermissions', () => {
  let request: JsonRpcRequest;
  let params: RequestExecutionPermissionsRequestParams;
  let response: PendingJsonRpcResponse;
  let processRequestExecutionPermissionsMock: jest.MockedFunction<ProcessRequestExecutionPermissionsHook>;

  async function callMethod() {
    return walletRequestExecutionPermissions(request, response, {
      processRequestExecutionPermissions:
        processRequestExecutionPermissionsMock,
    });
  }

  beforeEach(() => {
    jest.resetAllMocks();

    request = klona(REQUEST_MOCK);
    params = request.params as RequestExecutionPermissionsRequestParams;
    response = {} as PendingJsonRpcResponse;

    processRequestExecutionPermissionsMock = jest.fn();
    processRequestExecutionPermissionsMock.mockResolvedValue(RESULT_MOCK);
  });

  it('calls hook', async () => {
    await callMethod();
    expect(processRequestExecutionPermissionsMock).toHaveBeenCalledWith(
      params,
      request,
    );
  });

  it('returns result from hook', async () => {
    await callMethod();
    expect(response.result).toStrictEqual(RESULT_MOCK);
  });

  it('supports null rules', async () => {
    params[0].rules = null as never;

    await callMethod();

    expect(processRequestExecutionPermissionsMock).toHaveBeenCalledWith(
      params,
      request,
    );
  });

  it('supports optional address', async () => {
    params[0].address = undefined as never;

    await callMethod();

    expect(processRequestExecutionPermissionsMock).toHaveBeenCalledWith(
      params,
      request,
    );
  });

  it('throws if no hook', async () => {
    await expect(
      walletRequestExecutionPermissions(request, response, {}),
    ).rejects.toThrow(
      `wallet_requestExecutionPermissions - no middleware configured`,
    );
  });

  it('throws if no params', async () => {
    request.params = undefined;

    await expect(callMethod()).rejects.toThrow('Invalid params');
  });

  it('throws if missing properties', async () => {
    params[0].chainId = undefined as never;
    params[0].signer = undefined as never;
    params[0].permission = undefined as never;

    await expect(callMethod()).rejects.toThrow('Invalid params');
  });

  it('throws if wrong types', async () => {
    params[0].chainId = 123 as never;
    params[0].address = 123 as never;
    params[0].permission = '123' as never;
    params[0].signer = {
      // Make signer an object but invalid to ensure object-type error messages are stable
      type: 123 as never,
      data: '123' as never,
    } as never;
    params[0].rules = [{} as never];

    await expect(callMethod()).rejects.toThrow('Invalid params');
  });

  it('throws if not hex', async () => {
    params[0].chainId = '123' as never;
    params[0].address = '123' as never;
    params[0].signer.data.address = '123' as never;

    await expect(callMethod()).rejects.toThrow('Invalid params');
  });
});
