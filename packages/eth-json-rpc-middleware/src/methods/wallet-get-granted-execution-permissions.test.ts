import type { Hex, Json, JsonRpcRequest } from '@metamask/utils';

import type {
  GetGrantedExecutionPermissionsResult,
  ProcessGetGrantedExecutionPermissionsHook,
} from './wallet-get-granted-execution-permissions';
import { createWalletGetGrantedExecutionPermissionsHandler } from './wallet-get-granted-execution-permissions';
import type { WalletMiddlewareParams } from '../wallet';

const RESULT_MOCK: GetGrantedExecutionPermissionsResult = [
  {
    chainId: '0x01' as Hex,
    from: '0x1234567890123456789012345678901234567890' as Hex,
    to: '0x016562aA41A8697720ce0943F003141f5dEAe006' as Hex,
    permission: {
      type: 'native-token-allowance',
      isAdjustmentAllowed: true,
      data: {
        allowance: '0x1DCD65000000',
      },
    },
    context:
      '0x016562aA41A8697720ce0943F003141f5dEAe0060000771577157715' as Hex,
    dependencies: [
      {
        factory: '0x1234567890123456789012345678901234567890' as Hex,
        factoryData: '0xabcdef' as Hex,
      },
    ],
    delegationManager: '0x1234567890123456789012345678901234567890' as Hex,
  },
];

const REQUEST_MOCK = {
  params: [],
} as unknown as JsonRpcRequest;

describe('wallet_getGrantedExecutionPermissions', () => {
  let request: JsonRpcRequest;
  let processGetGrantedExecutionPermissionsMock: jest.MockedFunction<ProcessGetGrantedExecutionPermissionsHook>;
  let context: WalletMiddlewareParams['context'];

  const callMethod = async (): Promise<Readonly<Json> | undefined> => {
    const handler = createWalletGetGrantedExecutionPermissionsHandler({
      processGetGrantedExecutionPermissions:
        processGetGrantedExecutionPermissionsMock,
    });
    return handler({ request, context } as WalletMiddlewareParams);
  };

  beforeEach(() => {
    jest.resetAllMocks();

    request = { ...REQUEST_MOCK };

    context = new Map([
      ['origin', 'test-origin'],
    ]) as WalletMiddlewareParams['context'];

    processGetGrantedExecutionPermissionsMock = jest.fn();
    processGetGrantedExecutionPermissionsMock.mockResolvedValue(RESULT_MOCK);
  });

  it('calls hook', async () => {
    await callMethod();
    expect(processGetGrantedExecutionPermissionsMock).toHaveBeenCalledWith(
      request,
      context,
    );
  });

  it('returns result from hook', async () => {
    const result = await callMethod();
    expect(result).toStrictEqual(RESULT_MOCK);
  });

  it('throws if no hook', async () => {
    await expect(
      createWalletGetGrantedExecutionPermissionsHandler({})({
        request,
      } as WalletMiddlewareParams),
    ).rejects.toThrow(
      'wallet_getGrantedExecutionPermissions - no middleware configured',
    );
  });

  describe('params validation', () => {
    it.each([
      ['undefined', undefined],
      ['empty array', []],
      ['empty object', {}],
    ])('accepts params as %s', async (_description, params) => {
      request = { ...REQUEST_MOCK, params } as unknown as JsonRpcRequest;
      expect(await callMethod()).toStrictEqual(RESULT_MOCK);
    });

    it.each([
      ['non-empty array', [1]],
      ['non-empty object', { foo: 'bar' }],
      ['string', 'invalid'],
      ['number', 123],
      ['null', null],
    ])('rejects invalid params: %s', async (_description, params) => {
      request = { ...REQUEST_MOCK, params } as unknown as JsonRpcRequest;
      await expect(callMethod()).rejects.toThrow(/Invalid params/u);
    });
  });
});
