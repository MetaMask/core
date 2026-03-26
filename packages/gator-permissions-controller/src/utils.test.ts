import type { SnapId } from '@metamask/snaps-sdk';
import { HandlerType } from '@metamask/snaps-utils';

import { GatorPermissionsProviderError } from './errors';
import type { GatorPermissionsControllerMessenger } from './GatorPermissionsController';
import { GatorPermissionsSnapRpcMethod } from './types';
import { executeSnapRpc } from './utils';

describe('executeSnapRpc', () => {
  const mockSnapId = 'npm:@metamask/test-snap' as SnapId;

  function createMockMessenger(): { call: jest.Mock } {
    return { call: jest.fn() };
  }

  function getMessenger(mock: {
    call: jest.Mock;
  }): GatorPermissionsControllerMessenger {
    return mock as unknown as GatorPermissionsControllerMessenger;
  }

  it('calls SnapController:handleRequest with correct arguments and returns response', async () => {
    const response = { result: [1, 2, 3] };
    const messenger = createMockMessenger();
    messenger.call.mockResolvedValue(response);

    const result = await executeSnapRpc<typeof response>({
      messenger: getMessenger(messenger),
      snapId: mockSnapId,
      method:
        GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
    });

    expect(messenger.call).toHaveBeenCalledTimes(1);
    expect(messenger.call).toHaveBeenCalledWith(
      'SnapController:handleRequest',
      expect.objectContaining({
        snapId: mockSnapId,
        origin: 'metamask',
        handler: HandlerType.OnRpcRequest,
        request: {
          jsonrpc: '2.0',
          method:
            GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
        },
      }),
    );
    expect(result).toStrictEqual(response);
  });

  it('includes params in request when provided', async () => {
    const params = { isRevoked: false };
    const messenger = createMockMessenger();
    messenger.call.mockResolvedValue(null);

    await executeSnapRpc({
      messenger: getMessenger(messenger),
      snapId: mockSnapId,
      method:
        GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
      params,
    });

    expect(messenger.call).toHaveBeenCalledWith(
      'SnapController:handleRequest',
      {
        snapId: mockSnapId,
        origin: 'metamask',
        handler: HandlerType.OnRpcRequest,
        request: {
          jsonrpc: '2.0',
          method:
            GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
          params,
        },
      },
    );
  });

  it('omits params from request when not provided', async () => {
    const messenger = createMockMessenger();
    messenger.call.mockResolvedValue(undefined);

    await executeSnapRpc({
      messenger: getMessenger(messenger),
      snapId: mockSnapId,
      method: GatorPermissionsSnapRpcMethod.PermissionProviderSubmitRevocation,
    });

    const callArgs = messenger.call.mock.calls[0][1];
    expect(callArgs.request).not.toHaveProperty('params');
  });

  it('throws GatorPermissionsProviderError when Snap request fails', async () => {
    const cause = new Error('Snap not found');
    const messenger = createMockMessenger();
    messenger.call.mockRejectedValue(cause);

    await expect(
      executeSnapRpc({
        messenger: getMessenger(messenger),
        snapId: mockSnapId,
        method:
          GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
      }),
    ).rejects.toThrow(GatorPermissionsProviderError);

    await expect(
      executeSnapRpc({
        messenger: getMessenger(messenger),
        snapId: mockSnapId,
        method:
          GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
      }),
    ).rejects.toMatchObject({
      cause,
      message: expect.stringContaining(
        GatorPermissionsSnapRpcMethod.PermissionProviderGetGrantedPermissions,
      ),
    });
  });
});
