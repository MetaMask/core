import type { DecodedPermission } from '@metamask/gator-permissions-controller';
import type { Json } from '@metamask/utils';

import {
  decodePermissionFromRequest,
  isDelegationRequest,
  validateExecutionPermissionMetadata,
} from './delegations';
import type { SignatureControllerMessenger } from '../SignatureController';
import type { MessageParamsTyped, MessageParamsTypedData } from '../types';

describe('delegations utils', () => {
  describe('isDelegationRequest', () => {
    it('returns true for object data with primaryType Delegation', () => {
      const result = isDelegationRequest({
        types: {},
        domain: {},
        primaryType: 'Delegation',
        message: {},
      });
      expect(result).toBe(true);
    });

    it('returns false for object data with non-delegation primaryType', () => {
      const result = isDelegationRequest({
        types: {},
        domain: {},
        primaryType: 'Permit',
        message: {},
      });
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
    const chainId = 1;
    const decodedPermissionResult: DecodedPermission = {
      kind: 'decoded-permission',
    } as unknown as DecodedPermission;
    const validData = {
      types: {},
      domain: { chainId },
      primaryType: 'Delegation',
      message: {
        delegate,
        delegator,
        authority,
        caveats,
      },
      metadata: { origin: specifiedOrigin, justification },
    };

    let messenger: SignatureControllerMessenger;

    beforeEach(() => {
      messenger = {
        call: jest.fn().mockReturnValue(decodedPermissionResult),
      } as unknown as SignatureControllerMessenger;
    });

    it('calls messenger and returns decoded permission for valid input (object data)', () => {
      const result = decodePermissionFromRequest({
        data: validData,
        messenger,
        origin,
      });

      expect(result).toBe(decodedPermissionResult);
      expect(messenger.call).toHaveBeenCalledWith(
        'GatorPermissionsController:decodePermissionFromPermissionContextForOrigin',
        {
          origin,
          chainId,
          delegation: { delegate, delegator, caveats, authority },
          metadata: { justification, origin: specifiedOrigin },
        },
      );
    });

    it('throws an error if chainId is not a number', () => {
      expect(() =>
        decodePermissionFromRequest({
          data: { ...validData, domain: { chainId: '1' } },
          messenger,
          origin,
        }),
      ).toThrow('Invalid chainId');
    });

    it.each([
      [
        'Invalid delegate',
        {
          delegate: '0x1234abcd',
          delegator,
          authority,
          caveats,
        } as unknown as MessageParamsTyped,
      ],
      [
        'Invalid delegator',
        {
          delegate,
          delegator: '0x1234abcd',
          authority,
          caveats,
        } as unknown as MessageParamsTyped,
      ],
      [
        'Invalid authority',
        {
          delegate,
          delegator,
          authority: '0x1234abcd',
          caveats,
        } as unknown as MessageParamsTyped,
      ],
      [
        'Missing delegate',
        {
          delegator,
          authority,
          caveats,
        } as unknown as MessageParamsTyped,
      ],
      [
        'Missing authority',
        {
          delegate,
          authority,
          caveats,
        } as unknown as MessageParamsTyped,
      ],
      [
        'Missing authority',
        {
          delegate,
          delegator,
          caveats,
        } as unknown as MessageParamsTyped,
      ],
      [
        'Missing caveats',
        {
          delegate,
          delegator,
          authority,
        } as unknown as MessageParamsTyped,
      ],
    ])('returns undefined for invalid delegation data. %s', ([, message]) => {
      const invalidData = {
        ...validData,
        message,
      };

      const result = decodePermissionFromRequest({
        data: invalidData,
        messenger,
        origin,
      });

      expect(result).toBeUndefined();
    });
  });
});

describe('validateExecutionPermissionMetadata', () => {
  it('throws if metadata is missing', () => {
    expect(() =>
      validateExecutionPermissionMetadata({} as MessageParamsTypedData),
    ).toThrow('Invalid metadata');
  });

  it('does not throw for valid metadata', () => {
    expect(() =>
      validateExecutionPermissionMetadata({
        types: {},
        domain: {},
        primaryType: 'Delegation',
        message: {},
        // @ts-expect-error - augmenting with metadata for runtime validation
        metadata: { origin: 'https://dapp.example', justification: 'Needed' },
      }),
    ).not.toThrow();
  });

  it('throws if metadata is null', () => {
    expect(() =>
      validateExecutionPermissionMetadata({
        types: {},
        domain: {},
        primaryType: 'Delegation',
        message: {},
        // @ts-expect-error - intentionally invalid to test runtime validation
        metadata: null,
      }),
    ).toThrow('Invalid metadata');
  });

  it('throws if origin is missing', () => {
    expect(() =>
      validateExecutionPermissionMetadata({
        types: {},
        domain: {},
        primaryType: 'Delegation',
        message: {},
        // @ts-expect-error - intentionally invalid to test runtime validation
        metadata: { justification: 'why' },
      }),
    ).toThrow('Invalid metadata');
  });

  it('throws if justification is missing', () => {
    expect(() =>
      validateExecutionPermissionMetadata({
        types: {},
        domain: {},
        primaryType: 'Delegation',
        message: {},
        // @ts-expect-error - intentionally invalid to test runtime validation
        metadata: { origin: 'https://dapp.example' },
      }),
    ).toThrow('Invalid metadata');
  });

  it('throws if origin is not a string', () => {
    expect(() =>
      validateExecutionPermissionMetadata({
        types: {},
        domain: {},
        primaryType: 'Delegation',
        message: {},
        // @ts-expect-error - intentionally invalid to test runtime validation
        metadata: { origin: 123, justification: 'why' },
      }),
    ).toThrow('Invalid metadata');
  });

  it('throws if justification is not a string', () => {
    expect(() =>
      validateExecutionPermissionMetadata({
        types: {},
        domain: {},
        primaryType: 'Delegation',
        message: {},
        // @ts-expect-error - intentionally invalid to test runtime validation
        metadata: { origin: 'https://dapp.example', justification: {} },
      }),
    ).toThrow('Invalid metadata');
  });

  it('accepts empty strings for origin and justification', () => {
    expect(() =>
      validateExecutionPermissionMetadata({
        types: {},
        domain: {},
        primaryType: 'Delegation',
        message: {},
        // @ts-expect-error - augmenting with metadata for runtime validation
        metadata: { origin: '', justification: '' },
      }),
    ).not.toThrow();
  });
});
