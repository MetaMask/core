import type { Caveat, Hex } from '@metamask/delegation-core';

import {
  findDecodersWithMatchingCaveatAddresses,
  reconstructDecodedPermission,
  selectUniqueDecoderAndDecodedPermission,
} from './decodePermission';
import type { PermissionDecoder, PermissionType } from './types';

describe('decodePermission', () => {
  describe('findDecodersWithMatchingCaveatAddresses', () => {
    it('returns all decoders that match the given enforcers', () => {
      const matchingDecoder1 = {
        permissionType: 'matching-permission-1',
        caveatAddressesMatch: jest.fn().mockReturnValue(true),
      };
      const matchingDecoder2 = {
        permissionType: 'matching-permission-2',
        caveatAddressesMatch: jest.fn().mockReturnValue(true),
      };
      const nonMatchingDecoder = {
        permissionType: 'non-matching-permission',
        caveatAddressesMatch: jest.fn().mockReturnValue(false),
      };
      const decoders = [
        matchingDecoder1,
        matchingDecoder2,
        nonMatchingDecoder,
      ] as unknown as PermissionDecoder[];
      const rules = findDecodersWithMatchingCaveatAddresses({
        enforcers: [],
        permissionDecoders: decoders,
      });

      expect(rules).toStrictEqual([matchingDecoder1, matchingDecoder2]);
    });

    it('returns an empty array if no decoders match the given enforcers', () => {
      const nonMatchingDecoder1 = {
        permissionType: 'non-matching-permission-1',
        caveatAddressesMatch: jest.fn().mockReturnValue(false),
      };
      const nonMatchingDecoder2 = {
        permissionType: 'non-matching-permission-2',
        caveatAddressesMatch: jest.fn().mockReturnValue(false),
      };
      const nonMatchingDecoder3 = {
        permissionType: 'non-matching-permission-3',
        caveatAddressesMatch: jest.fn().mockReturnValue(false),
      };
      const decoders = [
        nonMatchingDecoder1,
        nonMatchingDecoder2,
        nonMatchingDecoder3,
      ] as unknown as PermissionDecoder[];
      const rules = findDecodersWithMatchingCaveatAddresses({
        enforcers: [],
        permissionDecoders: decoders,
      });

      expect(rules).toStrictEqual([]);
    });

    it('returns an empty array if no decoders are provided', () => {
      const rules = findDecodersWithMatchingCaveatAddresses({
        enforcers: [],
        permissionDecoders: [],
      });
      expect(rules).toStrictEqual([]);
    });

    it('calls caveatAddressesMatch with the given enforcers', () => {
      const matchingDecoder1 = {
        permissionType: 'matching-permission-1',
        caveatAddressesMatch: jest.fn().mockReturnValue(true),
      };
      const matchingDecoder2 = {
        permissionType: 'matching-permission-2',
        caveatAddressesMatch: jest.fn().mockReturnValue(true),
      };
      const enforcers: Hex[] = ['0x0000000000000000000000000000000000000000'];

      findDecodersWithMatchingCaveatAddresses({
        enforcers,
        permissionDecoders: [
          matchingDecoder1,
          matchingDecoder2,
        ] as unknown as PermissionDecoder[],
      });

      expect(matchingDecoder1.caveatAddressesMatch).toHaveBeenCalledWith(
        enforcers,
      );
      expect(matchingDecoder2.caveatAddressesMatch).toHaveBeenCalledWith(
        enforcers,
      );
    });
  });

  describe('reconstructDecodedPermission', () => {
    const chainId = 1;
    const delegator = '0x1111111111111111111111111111111111111111' as const;
    const delegate = '0x2222222222222222222222222222222222222222' as const;
    const specifiedOrigin = 'https://dapp.example';
    const justification = 'Test justification';
    const permissionType = 'selected-permission-type' as PermissionType;
    const data = {
      value: 1,
    };
    const authory =
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as const;

    it('throws if the authority is not ROOT_AUTHORITY', () => {
      const invalidAuthority =
        '0x0000000000000000000000000000000000000000' as const;
      expect(() =>
        reconstructDecodedPermission({
          chainId,
          permissionType,
          delegator,
          delegate,
          authority: invalidAuthority,
          expiry: null,
          data,
          justification,
          specifiedOrigin,
        }),
      ).toThrow('Invalid authority');
    });

    it('constructs a DecodedPermission with the specified values', () => {
      const result = reconstructDecodedPermission({
        chainId,
        permissionType,
        delegator,
        delegate,
        authority: authory,
        expiry: null,
        data,
        justification,
        specifiedOrigin,
      });

      expect(result.chainId).toBe('0x1');
      expect(result.from).toBe(delegator);
      expect(result.to).toStrictEqual(delegate);
      expect(result.permission).toStrictEqual({
        type: permissionType,
        data,
        justification,
      });
      expect(result.origin).toBe(specifiedOrigin);

      expect(result.rules).toBeUndefined();
    });

    it('constructs a DecodedPermission with specified rules', () => {
      const rules = [
        {
          type: 'mock-rule',
          data: {
            value: 1,
          },
        },
      ];

      const result = reconstructDecodedPermission({
        chainId,
        permissionType,
        delegator,
        delegate,
        authority: authory,
        expiry: null,
        data,
        justification,
        specifiedOrigin,
        rules,
      });

      expect(result.rules).toStrictEqual(rules);
    });
  });

  describe('selectUniqueDecoderAndDecodedPermission', () => {
    const caveats = [
      {
        enforcer: '0x0000000000000000000000000000000000000001',
        terms: '0x0000000000000000000000000000000000000000',
        args: '0x',
      },
    ] as Caveat<Hex>[];

    const data = {
      value: 1,
    };

    it('returns the successful decoder and decoded permission when exactly one decoder matches', () => {
      const matchingDecoder = {
        permissionType: 'matching-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockReturnValue({
          isValid: true,
          expiry: null,
          data,
        }),
      };

      const mismatchingDecoder = {
        permissionType: 'mismatching-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockReturnValue({
          isValid: false,
        }),
      };

      const result = selectUniqueDecoderAndDecodedPermission({
        candidateDecoders: [matchingDecoder, mismatchingDecoder],
        caveats,
      });

      expect(result.decoder).toBe(matchingDecoder);
      expect(result.rules).toBeUndefined();
      expect(result.data).toBe(data);
      expect(result.expiry).toBeNull();
    });

    it('throws an error if no decoder matches', () => {
      const mismatchingDecoder = {
        permissionType: 'mismatching-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockReturnValue({
          isValid: false,
          error: new Error('Failed to validate and decode permission'),
        }),
      };

      expect(() => {
        selectUniqueDecoderAndDecodedPermission({
          candidateDecoders: [mismatchingDecoder],
          caveats,
        });
      }).toThrow('Failed to validate and decode permission');
    });

    it('throws an error if the decoder throws an error', () => {
      const throwingDecoder = {
        permissionType: 'throwing-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockImplementation(() => {
          throw new Error('Failed to validate and decode permission');
        }),
      };

      expect(() => {
        selectUniqueDecoderAndDecodedPermission({
          candidateDecoders: [throwingDecoder],
          caveats,
        });
      }).toThrow('Failed to validate and decode permission');
    });

    it('throws an error if multiple decoders match', () => {
      const matchingDecoder = {
        permissionType: 'matching-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockReturnValue({
          isValid: true,
          expiry: null,
          data,
        }),
      };

      expect(() => {
        selectUniqueDecoderAndDecodedPermission({
          candidateDecoders: [matchingDecoder, matchingDecoder],
          caveats,
        });
      }).toThrow(
        'Multiple permission types validate the same delegation caveats: matching-permission-type, matching-permission-type',
      );
    });

    it('throws an error when candidate decoders are empty', () => {
      expect(() => {
        selectUniqueDecoderAndDecodedPermission({
          candidateDecoders: [],
          caveats,
        });
      }).toThrow('Unable to identify permission type');
    });

    it('throws an aggregated error when multiple decoders fail validation', () => {
      const firstFailingDecoder = {
        permissionType: 'first-failing-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockReturnValue({
          isValid: false,
          error: new Error('First decoder failed'),
        }),
      };
      const secondFailingDecoder = {
        permissionType: 'second-failing-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockReturnValue({
          isValid: false,
          error: new Error('Second decoder failed'),
        }),
      };

      expect(() => {
        selectUniqueDecoderAndDecodedPermission({
          candidateDecoders: [firstFailingDecoder, secondFailingDecoder],
          caveats,
        });
      }).toThrow(
        'No permission type could validate the delegation caveats. Attempts: first-failing-permission-type: First decoder failed; second-failing-permission-type: Second decoder failed',
      );
    });

    it('passes caveats to validateAndDecodePermission for each candidate decoder', () => {
      const matchingDecoder = {
        permissionType: 'matching-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockReturnValue({
          isValid: true,
          expiry: null,
          data,
        }),
      };
      const mismatchingDecoder = {
        permissionType: 'mismatching-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockReturnValue({
          isValid: false,
          error: new Error('Failed to validate and decode permission'),
        }),
      };

      selectUniqueDecoderAndDecodedPermission({
        candidateDecoders: [matchingDecoder, mismatchingDecoder],
        caveats,
      });

      expect(matchingDecoder.validateAndDecodePermission).toHaveBeenCalledWith(
        caveats,
      );
      expect(
        mismatchingDecoder.validateAndDecodePermission,
      ).toHaveBeenCalledWith(caveats);
    });

    it('returns rules when the selected decoder includes decoded rules', () => {
      const rules = [
        {
          type: 'mock-rule',
          data: { value: 1 },
        },
      ];
      const matchingDecoder = {
        permissionType: 'matching-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockReturnValue({
          isValid: true,
          expiry: null,
          data,
          rules,
        }),
      };

      const result = selectUniqueDecoderAndDecodedPermission({
        candidateDecoders: [matchingDecoder],
        caveats,
      });

      expect(result.rules).toStrictEqual(rules);
    });

    it('returns a non-null expiry when provided by the selected decoder', () => {
      const expiry = 1735689600;
      const matchingDecoder = {
        permissionType: 'matching-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockReturnValue({
          isValid: true,
          expiry,
          data,
        }),
      };

      const result = selectUniqueDecoderAndDecodedPermission({
        candidateDecoders: [matchingDecoder],
        caveats,
      });

      expect(result.expiry).toBe(expiry);
    });

    it('throws if any candidate decoder throws, even when another candidate validates', () => {
      const matchingDecoder = {
        permissionType: 'matching-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockReturnValue({
          isValid: true,
          expiry: null,
          data,
        }),
      };
      const throwingDecoder = {
        permissionType: 'throwing-permission-type' as PermissionType,
        requiredEnforcers: new Map([[caveats[0].enforcer, 1]]),
        optionalEnforcers: new Set([
          '0x0000000000000000000000000000000000000000' as Hex,
        ]),
        caveatAddressesMatch: jest.fn(),
        validateAndDecodePermission: jest.fn().mockImplementation(() => {
          throw new Error('Failed to validate and decode permission');
        }),
      };

      expect(() => {
        selectUniqueDecoderAndDecodedPermission({
          candidateDecoders: [matchingDecoder, throwingDecoder],
          caveats,
        });
      }).toThrow('Failed to validate and decode permission');
    });
  });
});
