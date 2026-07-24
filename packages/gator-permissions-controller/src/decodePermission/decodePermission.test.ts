import { ROOT_AUTHORITY } from '@metamask/delegation-core';
import type { Hex } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import { numberToHex } from '@metamask/utils';

import {
  findDecodersWithMatchingCaveatAddresses,
  reconstructDecodedPermission,
  selectUniqueDecoderAndDecodedPermission,
} from './decodePermission.js';
import { createPermissionDecodersForContracts } from './decoders/index.js';
import type {
  DecodedPermission,
  DeployedContractsByName,
  PermissionDecoder,
} from './types.js';
import { getChecksumEnforcersByChainId } from './utils.js';

// These tests use the live deployments table for version 1.3.0 to
// construct deterministic caveat address sets for a known chain.

describe('decodePermission', () => {
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][chainId];

  const {
    ExactCalldataEnforcer,
    TimestampEnforcer,
    ValueLteEnforcer,
    AllowedCalldataEnforcer,
    ERC20StreamingEnforcer,
    ERC20PeriodTransferEnforcer,
    NativeTokenStreamingEnforcer,
    NativeTokenPeriodTransferEnforcer,
    NonceEnforcer,
    RedeemerEnforcer,
  } = contracts;
  const { approvalRevocationEnforcer } =
    getChecksumEnforcersByChainId(contracts);

  describe('findDecodersWithMatchingCaveatAddresses()', () => {
    const zeroAddress = '0x0000000000000000000000000000000000000000' as Hex;

    it('returns all matching rules from findDecodersWithMatchingCaveatAddresses', () => {
      const enforcers = [ExactCalldataEnforcer, NonceEnforcer, zeroAddress];
      const contractsWithDuplicates = {
        ...contracts,
        NativeTokenStreamingEnforcer: zeroAddress,
        NativeTokenPeriodTransferEnforcer: zeroAddress,
      } as unknown as DeployedContractsByName;

      const rules = findDecodersWithMatchingCaveatAddresses({
        enforcers,
        permissionDecoders: createPermissionDecodersForContracts(
          contractsWithDuplicates,
        ),
      });

      expect(rules).toHaveLength(3);
      expect(
        rules.map((matchingRule) => matchingRule.permissionType).sort(),
      ).toStrictEqual(
        [
          'native-token-periodic',
          'native-token-stream',
          'native-token-allowance',
        ].sort(),
      );
    });

    describe('native-token-stream', () => {
      const expectedPermissionType = 'native-token-stream';

      it('matches with required caveats', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('allows RedeemerEnforcer as extra', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          RedeemerEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('allows TimestampEnforcer and RedeemerEnforcer as extras', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
          RedeemerEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('rejects forbidden extra caveat', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          // Not allowed for native-token-stream
          ValueLteEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ExactCalldataEnforcer];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          NativeTokenStreamingEnforcer.toLowerCase() as unknown as Hex,
          ExactCalldataEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual(['native-token-stream']);
      });

      it('throws if a contract is not found', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
        ];
        const contractsWithoutTimestampEnforcer = {
          ...contracts,
          TimestampEnforcer: undefined,
        } as unknown as DeployedContractsByName;

        expect(() =>
          findDecodersWithMatchingCaveatAddresses({
            enforcers,
            permissionDecoders: createPermissionDecodersForContracts(
              contractsWithoutTimestampEnforcer,
            ),
          }),
        ).toThrow('Contract not found: TimestampEnforcer');
      });
    });

    describe('native-token-periodic', () => {
      const expectedPermissionType = 'native-token-periodic';
      it('matches with required caveats alongside native-token-allowance', () => {
        const enforcers = [
          NativeTokenPeriodTransferEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType).sort(),
        ).toStrictEqual(
          [expectedPermissionType, 'native-token-allowance'].sort(),
        );
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          NativeTokenPeriodTransferEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType).sort(),
        ).toStrictEqual(
          [expectedPermissionType, 'native-token-allowance'].sort(),
        );
      });

      it('rejects forbidden extra caveat', () => {
        const enforcers = [
          NativeTokenPeriodTransferEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          // Not allowed for native-token-periodic
          ValueLteEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ExactCalldataEnforcer];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          NativeTokenPeriodTransferEnforcer.toLowerCase() as unknown as Hex,
          ExactCalldataEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType).sort(),
        ).toStrictEqual(
          [expectedPermissionType, 'native-token-allowance'].sort(),
        );
      });

      it('throws if a contract is not found', () => {
        const enforcers = [
          NativeTokenPeriodTransferEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
        ];
        const contractsWithoutTimestampEnforcer = {
          ...contracts,
          TimestampEnforcer: undefined,
        } as unknown as DeployedContractsByName;

        expect(() =>
          findDecodersWithMatchingCaveatAddresses({
            enforcers,
            permissionDecoders: createPermissionDecodersForContracts(
              contractsWithoutTimestampEnforcer,
            ),
          }),
        ).toThrow('Contract not found: TimestampEnforcer');
      });
    });

    describe('erc20-token-stream', () => {
      const expectedPermissionType = 'erc20-token-stream';
      it('matches with required caveats', () => {
        const enforcers = [
          ERC20StreamingEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          ERC20StreamingEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('rejects forbidden extra caveat', () => {
        const enforcers = [
          ERC20StreamingEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          // Not allowed for erc20-token-stream
          ExactCalldataEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ERC20StreamingEnforcer];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          ERC20StreamingEnforcer.toLowerCase() as unknown as Hex,
          ValueLteEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('throws if a contract is not found', () => {
        const enforcers = [
          ERC20StreamingEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const contractsWithoutTimestampEnforcer = {
          ...contracts,
          TimestampEnforcer: undefined,
        } as unknown as DeployedContractsByName;

        expect(() =>
          findDecodersWithMatchingCaveatAddresses({
            enforcers,
            permissionDecoders: createPermissionDecodersForContracts(
              contractsWithoutTimestampEnforcer,
            ),
          }),
        ).toThrow('Contract not found: TimestampEnforcer');
      });
    });

    describe('erc20-token-periodic', () => {
      const expectedPermissionType = 'erc20-token-periodic';
      it('matches with required caveats alongside erc20-token-allowance', () => {
        const enforcers = [
          ERC20PeriodTransferEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType).sort(),
        ).toStrictEqual(
          [expectedPermissionType, 'erc20-token-allowance'].sort(),
        );
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          ERC20PeriodTransferEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType).sort(),
        ).toStrictEqual(
          [expectedPermissionType, 'erc20-token-allowance'].sort(),
        );
      });

      it('rejects forbidden extra caveat', () => {
        const enforcers = [
          ERC20PeriodTransferEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          // Not allowed for erc20-token-periodic
          ExactCalldataEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ERC20PeriodTransferEnforcer];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          ERC20PeriodTransferEnforcer.toLowerCase() as unknown as Hex,
          ValueLteEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType).sort(),
        ).toStrictEqual(
          [expectedPermissionType, 'erc20-token-allowance'].sort(),
        );
      });

      it('throws if a contract is not found', () => {
        const enforcers = [
          ERC20PeriodTransferEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const contractsWithoutTimestampEnforcer = {
          ...contracts,
          TimestampEnforcer: undefined,
        } as unknown as DeployedContractsByName;

        expect(() =>
          findDecodersWithMatchingCaveatAddresses({
            enforcers,
            permissionDecoders: createPermissionDecodersForContracts(
              contractsWithoutTimestampEnforcer,
            ),
          }),
        ).toThrow('Contract not found: TimestampEnforcer');
      });
    });

    describe('erc20-token-revocation', () => {
      const expectedPermissionType = 'erc20-token-revocation';

      it('matches with two AllowedCalldataEnforcer and ValueLteEnforcer and NonceEnforcer', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('rejects when only one AllowedCalldataEnforcer is provided', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects when three AllowedCalldataEnforcer are provided', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects when ValueLteEnforcer is missing', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          NonceEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects forbidden extra caveat', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          // Not allowed for erc20-token-revocation
          ExactCalldataEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          AllowedCalldataEnforcer.toLowerCase() as unknown as Hex,
          AllowedCalldataEnforcer.toLowerCase() as unknown as Hex,
          ValueLteEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('throws if a contract is not found', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const contractsWithoutAllowedCalldataEnforcer = {
          ...contracts,
          AllowedCalldataEnforcer: undefined,
        } as unknown as DeployedContractsByName;

        expect(() =>
          findDecodersWithMatchingCaveatAddresses({
            enforcers,
            permissionDecoders: createPermissionDecodersForContracts(
              contractsWithoutAllowedCalldataEnforcer,
            ),
          }),
        ).toThrow('Contract not found: AllowedCalldataEnforcer');
      });
    });

    describe('token-approval-revocation', () => {
      const expectedPermissionType = 'token-approval-revocation';
      const findMatchingDecoders = (enforcers: Hex[]): PermissionDecoder[] =>
        findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });

      it('matches with ApprovalRevocationEnforcer and NonceEnforcer', () => {
        const enforcers = [approvalRevocationEnforcer, NonceEnforcer];
        const rules = findMatchingDecoders(enforcers);
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          approvalRevocationEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const rules = findMatchingDecoders(enforcers);
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });

      it('rejects when NonceEnforcer is missing', () => {
        const enforcers = [approvalRevocationEnforcer];
        const rules = findMatchingDecoders(enforcers);
        expect(rules).toStrictEqual([]);
      });

      it('rejects forbidden extra caveat', () => {
        const enforcers = [
          approvalRevocationEnforcer,
          NonceEnforcer,
          ValueLteEnforcer,
        ];
        const rules = findMatchingDecoders(enforcers);
        expect(rules).toStrictEqual([]);
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          approvalRevocationEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const rules = findMatchingDecoders(enforcers);
        expect(
          rules.map((matchingRule) => matchingRule.permissionType),
        ).toStrictEqual([expectedPermissionType]);
      });
    });
  });

  describe('reconstructDecodedPermission', () => {
    const delegator = '0x1111111111111111111111111111111111111111' as Hex;
    const delegate = '0x2222222222222222222222222222222222222222' as Hex;
    const specifiedOrigin = 'https://dapp.example';
    const justification = 'Test justification';

    it('constructs DecodedPermission with expiry', () => {
      const permissionType = 'native-token-stream' as const;
      const data: DecodedPermission['permission']['data'] = {
        initialAmount: '0x01',
        maxAmount: '0x02',
        amountPerSecond: '0x03',
        startTime: 1715664,
      } as const;
      const expiry = 1720000;

      const result = reconstructDecodedPermission({
        chainId,
        permissionType,
        delegator,
        delegate,
        authority: ROOT_AUTHORITY,
        expiry,
        data,
        justification,
        specifiedOrigin,
      });

      expect(result.chainId).toBe(numberToHex(chainId));
      expect(result.from).toBe(delegator);
      expect(result.to).toStrictEqual(delegate);
      expect(result.permission).toStrictEqual({
        type: permissionType,
        data,
        justification,
      });
      expect(result.expiry).toBe(expiry);
      expect(result.origin).toBe(specifiedOrigin);
    });

    it('includes rules when provided', () => {
      const permissionType = 'native-token-stream' as const;
      const data: DecodedPermission['permission']['data'] = {
        initialAmount: '0x01',
        maxAmount: '0x02',
        amountPerSecond: '0x03',
        startTime: 1715664,
      } as const;
      const rules = [
        {
          type: 'redeemer' as const,
          data: {
            addresses: ['0x1111111111111111111111111111111111111111' as Hex],
          },
        },
      ];

      const result = reconstructDecodedPermission({
        chainId,
        permissionType,
        delegator,
        delegate,
        authority: ROOT_AUTHORITY,
        expiry: null,
        data,
        justification,
        specifiedOrigin,
        rules,
      });

      expect(result.rules).toStrictEqual(rules);
    });

    it('constructs DecodedPermission with null expiry', () => {
      const permissionType = 'erc20-token-periodic' as const;
      const data: DecodedPermission['permission']['data'] = {
        tokenAddress: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        periodAmount: '0x2a',
        periodDuration: 3600,
        startTime: 1715666,
      } as const;

      const result = reconstructDecodedPermission({
        chainId,
        permissionType,
        delegator,
        delegate,
        authority: ROOT_AUTHORITY,
        expiry: null,
        data,
        justification,
        specifiedOrigin,
      });

      expect(result.chainId).toBe(numberToHex(chainId));
      expect(result.expiry).toBeNull();
      expect(result.permission.type).toBe(permissionType);
      expect(result.permission.data).toStrictEqual(data);
    });

    it('throws on invalid authority', () => {
      const permissionType = 'native-token-stream' as const;
      const data: DecodedPermission['permission']['data'] = {
        initialAmount: '0x01',
        maxAmount: '0x02',
        amountPerSecond: '0x03',
        startTime: 1715664,
      } as const;

      expect(() =>
        reconstructDecodedPermission({
          chainId,
          permissionType,
          delegator,
          delegate,
          authority: '0x0000000000000000000000000000000000000000' as Hex,
          expiry: 1720000,
          data,
          justification,
          specifiedOrigin,
        }),
      ).toThrow('Invalid authority');
    });
  });

  describe('selectUniqueDecoderAndDecodedPermission', () => {
    const emptyCaveats: Parameters<
      PermissionDecoder['validateAndDecodePermission']
    >[0] = [];

    const dummyDecoderFields = {
      requiredEnforcers: new Map<Hex, number>(),
      optionalEnforcers: new Set<Hex>(),
      caveatAddressesMatch: () => true,
    } as const;

    it('returns the unique rule when exactly one candidate validates', () => {
      const data = {
        initialAmount: '0x1',
        maxAmount: '0x2',
        amountPerSecond: '0x3',
        startTime: 1,
      } as DecodedPermission['permission']['data'];

      const decoders: PermissionDecoder[] = [
        {
          ...dummyDecoderFields,
          permissionType: 'native-token-stream',
          validateAndDecodePermission: () => ({
            isValid: true,
            expiry: 9,
            data,
          }),
        },
        {
          ...dummyDecoderFields,
          permissionType: 'native-token-periodic',
          validateAndDecodePermission: () => ({
            isValid: false,
            error: new Error('bad terms for periodic'),
          }),
        },
      ];

      const result = selectUniqueDecoderAndDecodedPermission({
        candidateDecoders: decoders,
        caveats: emptyCaveats,
      });

      expect(result.decoder.permissionType).toBe('native-token-stream');
      expect(result.expiry).toBe(9);
      expect(result.data).toStrictEqual(data);
    });

    it('throws when no candidate rules are provided', () => {
      expect(() =>
        selectUniqueDecoderAndDecodedPermission({
          candidateDecoders: [],
          caveats: emptyCaveats,
        }),
      ).toThrow('Unable to identify permission type');
    });

    it('rethrows the validation error when only one candidate exists and it fails', () => {
      const originalError = new Error('stream validation failed');
      const decoders: PermissionDecoder[] = [
        {
          ...dummyDecoderFields,
          permissionType: 'native-token-stream',
          validateAndDecodePermission: () => ({
            isValid: false,
            error: originalError,
          }),
        },
      ];

      expect(() =>
        selectUniqueDecoderAndDecodedPermission({
          candidateDecoders: decoders,
          caveats: emptyCaveats,
        }),
      ).toThrow(originalError);
    });

    it('throws when more than one candidate validates', () => {
      const data = {
        initialAmount: '0x1',
        maxAmount: '0x2',
        amountPerSecond: '0x3',
        startTime: 1,
      } as DecodedPermission['permission']['data'];

      const decoders: PermissionDecoder[] = [
        {
          ...dummyDecoderFields,
          permissionType: 'native-token-stream',
          validateAndDecodePermission: () => ({
            isValid: true,
            expiry: 1,
            data,
          }),
        },
        {
          ...dummyDecoderFields,
          permissionType: 'native-token-periodic',
          validateAndDecodePermission: () => ({
            isValid: true,
            expiry: 1,
            data,
          }),
        },
      ];

      expect(() =>
        selectUniqueDecoderAndDecodedPermission({
          candidateDecoders: decoders,
          caveats: emptyCaveats,
        }),
      ).toThrow(
        'Multiple permission types validate the same delegation caveats: native-token-stream, native-token-periodic',
      );
    });

    it('throws with attempt details when no candidate validates', () => {
      const decoders: PermissionDecoder[] = [
        {
          ...dummyDecoderFields,
          permissionType: 'native-token-stream',
          validateAndDecodePermission: () => ({
            isValid: false,
            error: new Error('stream failed'),
          }),
        },
        {
          ...dummyDecoderFields,
          permissionType: 'native-token-periodic',
          validateAndDecodePermission: () => ({
            isValid: false,
            error: new Error('periodic failed'),
          }),
        },
      ];

      expect(() =>
        selectUniqueDecoderAndDecodedPermission({
          candidateDecoders: decoders,
          caveats: emptyCaveats,
        }),
      ).toThrow(
        'No permission type could validate the delegation caveats. Attempts: native-token-stream: stream failed; native-token-periodic: periodic failed',
      );
    });
  });

  describe('adversarial: attempts to violate decoder expectations', () => {
    describe('getPermissionDecoderMatchingCaveatTypes()', () => {
      it('rejects empty enforcer list', () => {
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers: [],
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects enforcer list with only unknown/forbidden addresses', () => {
        const unknown = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers: [unknown],
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects when required enforcer count is exceeded (e.g. duplicate NonceEnforcer)', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          NonceEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects mix of valid known enforcers and valid but unknown enforcer address', () => {
        const unknownEnforcer =
          '0xbadbadbadbadbadbadbadbadbadbadbadbadbadb' as Hex;
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          unknownEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects exactly one AllowedCalldataEnforcer for erc20-token-revocation (wrong multiplicity)', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });

      it('rejects three AllowedCalldataEnforcer for erc20-token-revocation (excess multiplicity)', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const rules = findDecodersWithMatchingCaveatAddresses({
          enforcers,
          permissionDecoders: createPermissionDecodersForContracts(contracts),
        });
        expect(rules).toStrictEqual([]);
      });
    });

    describe('reconstructDecodedPermission()', () => {
      const delegator = '0x1111111111111111111111111111111111111111' as Hex;
      const delegate = '0x2222222222222222222222222222222222222222' as Hex;
      const data: DecodedPermission['permission']['data'] = {
        initialAmount: '0x01',
        maxAmount: '0x02',
        amountPerSecond: '0x03',
        startTime: 1715664,
      } as const;

      it('rejects authority that is not ROOT_AUTHORITY (one byte different)', () => {
        const wrongAuthority =
          '0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe' as Hex;
        expect(() =>
          reconstructDecodedPermission({
            chainId,
            permissionType: 'native-token-stream',
            delegator,
            delegate,
            authority: wrongAuthority,
            expiry: 1720000,
            data,
            justification: 'test',
            specifiedOrigin: 'https://example.com',
          }),
        ).toThrow('Invalid authority');
      });

      it('rejects authority that looks like ROOT_AUTHORITY but with wrong length', () => {
        const wrongAuthority =
          '0xffffffffffffffffffffffffffffffffffffffff' as Hex;
        expect(() =>
          reconstructDecodedPermission({
            chainId,
            permissionType: 'native-token-stream',
            delegator,
            delegate,
            authority: wrongAuthority,
            expiry: 1720000,
            data,
            justification: 'test',
            specifiedOrigin: 'https://example.com',
          }),
        ).toThrow('Invalid authority');
      });
    });
  });
});
