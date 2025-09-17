import type { DecodedPermission } from '@metamask/gator-permissions-controller';
import type { Json } from '@metamask/utils';

import {
  decodePermissionFromRequest,
  isDelegationRequest,
} from './execution-permissions';
import type { SignatureControllerMessenger } from '../SignatureController';
import type {
  MessageParamsTyped,
  MessageParamsTypedDataWithMetadata,
} from '../types';

describe('execution-permissions utils', () => {
  describe('isDelegationRequest', () => {
    it('returns true for object data with primaryType Delegation', () => {
      const result = isDelegationRequest({
        data: {
          types: {},
          domain: {},
          primaryType: 'Delegation',
          message: {},
        },
      });
      expect(result).toBe(true);
    });

    it('returns false for object data with non-delegation primaryType', () => {
      const result = isDelegationRequest({
        data: {
          types: {},
          domain: {},
          primaryType: 'Permit',
          message: {},
        },
      });
      expect(result).toBe(false);
    });

    it('returns true for stringified data with primaryType Delegation', () => {
      const json = JSON.stringify({
        types: {},
        domain: {},
        primaryType: 'Delegation',
        message: {},
      });
      const result = isDelegationRequest({ data: json });
      expect(result).toBe(true);
    });

    it('returns false for invalid JSON string', () => {
      const result = isDelegationRequest({ data: 'invalid json' });
      expect(result).toBe(false);
    });
  });

  describe('decodePermissionFromRequest', () => {
    const origin = 'npm:@metamask/gator-permissions-snap';
    const specifiedOrigin = 'http://example.com';
    const delegate = '0x1111111111111111111111111111111111111111';
    const delegator = '0x2222222222222222222222222222222222222222';
    const authority = '0x1234abcd';
    const caveats: Json[] = [];
    const justification = 'Need to perform actions on behalf of user';
    const chainIdString = '1';
    const decodedPermissionResult: DecodedPermission = {
      kind: 'decoded-permission',
    } as unknown as DecodedPermission;
    const validData = {
      types: {},
      domain: { chainId: chainIdString },
      primaryType: 'Delegation',
      message: {
        delegate,
        delegator,
        authority,
        caveats,
      },
      metadata: { origin: specifiedOrigin, justification },
    };

    const messageParams: MessageParamsTyped = {
      from: delegator,
      data: validData,
    };
    let messenger: SignatureControllerMessenger;

    beforeEach(() => {
      messenger = {
        call: jest.fn().mockResolvedValue(decodedPermissionResult),
      } as unknown as SignatureControllerMessenger;
    });

    it('calls messenger and returns decoded permission for valid input (object data)', async () => {
      const result = await decodePermissionFromRequest({
        messageParams,
        messenger,
        origin,
      });

      expect(result).toBe(decodedPermissionResult);
      expect(messenger.call).toHaveBeenCalledWith(
        'GatorPermissionsController:decodePermissionFromPermissionContextForOrigin',
        {
          origin,
          chainId: 1,
          delegation: { delegate, delegator, caveats, authority },
          metadata: { justification, origin: specifiedOrigin },
        },
      );
    });

    it('supports stringified data as input', async () => {
      messageParams.data = JSON.stringify(validData);

      const result = await decodePermissionFromRequest({
        messageParams,
        messenger,
        origin,
      });
      expect(result).toBe(decodedPermissionResult);
      expect(messenger.call).toHaveBeenCalledTimes(1);
    });

    it('throws for missing metadata', async () => {
      messageParams.data = {
        types: {},
        domain: { chainId: chainIdString },
        primaryType: 'Delegation',
        message: { delegate, delegator, authority, caveats },
        metadata:
          undefined as unknown as MessageParamsTypedDataWithMetadata['metadata'],
      } as MessageParamsTypedDataWithMetadata;

      await expect(
        decodePermissionFromRequest({ messageParams, messenger, origin }),
      ).rejects.toThrow('Invalid metadata');
      expect(messenger.call).not.toHaveBeenCalled();
    });

    it('throws for invalid delegation data', async () => {
      messageParams.data = {
        types: {},
        domain: { chainId: chainIdString },
        primaryType: 'Delegation',
        message: { delegate: '0x1234', delegator, authority, caveats },
        metadata: { origin: specifiedOrigin, justification },
      } as MessageParamsTypedDataWithMetadata;

      await expect(
        decodePermissionFromRequest({ messageParams, messenger, origin }),
      ).rejects.toThrow('Invalid delegation data');
      expect(messenger.call).not.toHaveBeenCalled();
    });
  });
});
