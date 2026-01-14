import type { Json, JsonRpcRequest } from '@metamask/utils';
import { klona } from 'klona';

import type {
  ProcessRequestExecutionPermissionsHook,
  RequestExecutionPermissionsRequestParams,
  RequestExecutionPermissionsResult,
} from './wallet-request-execution-permissions';
import { createWalletRequestExecutionPermissionsHandler } from './wallet-request-execution-permissions';
import type { WalletMiddlewareParams } from '../wallet';

const FROM_ADDRESS_MOCK = '0x123abc123abc123abc123abc123abc123abc123A';
const TO_ADDRESS_MOCK = '0x016562aA41A8697720ce0943F003141f5dEAe006';
const CHAIN_ID_MOCK = '0x1';
const CONTEXT_MOCK = '0x123abc';
const DELEGATION_MANAGER_MOCK = '0xabc123abc123abc123abc123abc123abc123abc1';
const FACTORY_MOCK = '0xdef456def456def456def456def456def456def4';
const FACTORY_DATA_MOCK = '0x1234';

const REQUEST_MOCK = {
  params: [
    {
      chainId: CHAIN_ID_MOCK,
      from: FROM_ADDRESS_MOCK,
      to: TO_ADDRESS_MOCK,
      permission: {
        type: 'test-permission',
        isAdjustmentAllowed: true,
        data: { key: 'value' },
      },
      rules: [
        {
          type: 'test-rule',
          data: { ruleKey: 'ruleValue' },
        },
      ],
    },
  ],
} as unknown as JsonRpcRequest;

const RESULT_MOCK: RequestExecutionPermissionsResult = [
  {
    chainId: CHAIN_ID_MOCK,
    from: FROM_ADDRESS_MOCK,
    to: TO_ADDRESS_MOCK,
    permission: {
      type: 'test-permission',
      isAdjustmentAllowed: true,
      data: { key: 'value' },
    },
    rules: [
      {
        type: 'test-rule',
        data: { ruleKey: 'ruleValue' },
      },
    ],
    context: CONTEXT_MOCK,
    dependencies: [
      {
        factory: FACTORY_MOCK,
        factoryData: FACTORY_DATA_MOCK,
      },
    ],
    delegationManager: DELEGATION_MANAGER_MOCK,
  },
];

describe('wallet_requestExecutionPermissions', () => {
  let request: JsonRpcRequest;
  let params: RequestExecutionPermissionsRequestParams;
  let processRequestExecutionPermissionsMock: jest.MockedFunction<ProcessRequestExecutionPermissionsHook>;
  let context: WalletMiddlewareParams['context'];

  const callMethod = async (): Promise<Readonly<Json> | undefined> => {
    const handler = createWalletRequestExecutionPermissionsHandler({
      processRequestExecutionPermissions:
        processRequestExecutionPermissionsMock,
    });
    return handler({ request, context } as WalletMiddlewareParams);
  };

  beforeEach(() => {
    jest.resetAllMocks();

    request = klona(REQUEST_MOCK);
    params = request.params as RequestExecutionPermissionsRequestParams;

    context = new Map([
      ['origin', 'test-origin'],
    ]) as WalletMiddlewareParams['context'];

    processRequestExecutionPermissionsMock = jest.fn();
    processRequestExecutionPermissionsMock.mockResolvedValue(RESULT_MOCK);
  });

  it('calls hook', async () => {
    await callMethod();
    expect(processRequestExecutionPermissionsMock).toHaveBeenCalledWith(
      params,
      request,
      context,
    );
  });

  it('returns result from hook', async () => {
    const result = await callMethod();
    expect(result).toStrictEqual(RESULT_MOCK);
  });

  it('supports undefined rules', async () => {
    params[0].rules = undefined;

    await callMethod();

    expect(processRequestExecutionPermissionsMock).toHaveBeenCalledWith(
      params,
      request,
      context,
    );
  });

  it('supports null rules', async () => {
    params[0].rules = null as never;

    await callMethod();

    expect(processRequestExecutionPermissionsMock).toHaveBeenCalledWith(
      params,
      request,
      context,
    );
  });

  it('supports optional from', async () => {
    params[0].from = undefined;

    await callMethod();

    expect(processRequestExecutionPermissionsMock).toHaveBeenCalledWith(
      params,
      request,
      context,
    );
  });

  it('throws if no hook', async () => {
    await expect(
      createWalletRequestExecutionPermissionsHandler({})({
        request,
      } as WalletMiddlewareParams),
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
    params[0].to = undefined as never;
    params[0].permission = undefined as never;

    await expect(callMethod()).rejects.toThrow('Invalid params');
  });

  it('throws if wrong types', async () => {
    params[0].chainId = 123 as never;
    params[0].from = 123 as never;
    params[0].to = 123 as never;
    params[0].permission = '123' as never;
    params[0].rules = [{} as never];

    await expect(callMethod()).rejects.toThrow('Invalid params');
  });

  it('throws if not hex', async () => {
    params[0].chainId = '123' as never;
    params[0].from = '123' as never;
    params[0].to = '123' as never;

    await expect(callMethod()).rejects.toThrow('Invalid params');
  });
});
