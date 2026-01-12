import type { Hex, Json, JsonRpcRequest } from '@metamask/utils';

import type {
  GetSupportedExecutionPermissionsResult,
  ProcessGetSupportedExecutionPermissionsHook,
} from './wallet-get-supported-execution-permissions';
import { createWalletGetSupportedExecutionPermissionsHandler } from './wallet-get-supported-execution-permissions';
import type { WalletMiddlewareParams } from '../wallet';

const RESULT_MOCK: GetSupportedExecutionPermissionsResult = {
  'native-token-allowance': {
    chainIds: ['0x123', '0x345'] as Hex[],
    ruleTypes: ['expiry'],
  },
  'erc20-token-allowance': {
    chainIds: ['0x123'] as Hex[],
    ruleTypes: [],
  },
  'erc721-token-allowance': {
    chainIds: ['0x123'] as Hex[],
    ruleTypes: ['expiry'],
  },
};

const REQUEST_MOCK = {
  params: [],
} as unknown as JsonRpcRequest;

describe('wallet_getSupportedExecutionPermissions', () => {
  let request: JsonRpcRequest;
  let processGetSupportedExecutionPermissionsMock: jest.MockedFunction<ProcessGetSupportedExecutionPermissionsHook>;
  let context: WalletMiddlewareParams['context'];

  const callMethod = async (): Promise<Readonly<Json> | undefined> => {
    const handler = createWalletGetSupportedExecutionPermissionsHandler({
      processGetSupportedExecutionPermissions:
        processGetSupportedExecutionPermissionsMock,
    });
    return handler({ request, context } as WalletMiddlewareParams);
  };

  beforeEach(() => {
    jest.resetAllMocks();

    request = { ...REQUEST_MOCK };

    context = new Map([
      ['origin', 'test-origin'],
    ]) as WalletMiddlewareParams['context'];

    processGetSupportedExecutionPermissionsMock = jest.fn();
    processGetSupportedExecutionPermissionsMock.mockResolvedValue(RESULT_MOCK);
  });

  it('calls hook', async () => {
    await callMethod();
    expect(processGetSupportedExecutionPermissionsMock).toHaveBeenCalledWith(
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
      createWalletGetSupportedExecutionPermissionsHandler({})({
        request,
      } as WalletMiddlewareParams),
    ).rejects.toThrow(
      'wallet_getSupportedExecutionPermissions - no middleware configured',
    );
  });
});
