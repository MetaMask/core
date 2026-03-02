import {
  createNativeTokenStreamingTerms,
  createNativeTokenPeriodTransferTerms,
  createERC20StreamingTerms,
  createERC20TokenPeriodTransferTerms,
  createTimestampTerms,
  ROOT_AUTHORITY,
} from '@metamask/delegation-core';
import type { Hex } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import { numberToHex } from '@metamask/utils';

import {
  findRuleWithMatchingCaveatAddresses,
  reconstructDecodedPermission,
} from './decodePermission';
import type {
  DecodedPermission,
  DeployedContractsByName,
  PermissionType,
} from './types';
import type { PermissionRule } from './types';
import { createPermissionRulesForContracts } from './rules';

/** Mock rule whose validateAndDecodePermission returns invalid (for error-path tests). */
function createMockPermissionRuleThatReturnsInvalid(errorMessage: string): PermissionRule {
  return {
    permissionType: 'native-token-stream',
    requiredEnforcers: new Map(),
    optionalEnforcers: new Set(),
    caveatAddressesMatch: () => true,
    validateAndDecodePermission: () => ({
      isValid: false,
      error: new Error(errorMessage),
    }),
  };
}

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
  } = contracts;

  describe('getPermissionRuleMatchingCaveatTypes()', () => {
    const zeroAddress = '0x0000000000000000000000000000000000000000' as Hex;

    it('throws if multiple permission types match', () => {
      // this test is a little convoluted, because in reality it can only happen
      // if the deployed contracts are invalid, or the rules are malformed. In
      // order to test the case, we are creating a contract set where the
      // enforcers match both native-token-stream and native-token-periodic.
      const enforcers = [ExactCalldataEnforcer, NonceEnforcer, zeroAddress];
      const contractsWithDuplicates = {
        ...contracts,
        NativeTokenStreamingEnforcer: zeroAddress,
        NativeTokenPeriodTransferEnforcer: zeroAddress,
      } as unknown as DeployedContractsByName;

      expect(() => {
        findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contractsWithDuplicates),
        });
      }).toThrow('Multiple permission types match');
    });

    describe('native-token-stream', () => {
      const expectedPermissionType = 'native-token-stream';

      it('matches with required caveats', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
      });

      it('rejects forbidden extra caveat', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          // Not allowed for native-token-stream
          ValueLteEnforcer,
        ];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ExactCalldataEnforcer];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          NativeTokenStreamingEnforcer.toLowerCase() as unknown as Hex,
          ExactCalldataEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe('native-token-stream');
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
          findRuleWithMatchingCaveatAddresses({
            enforcers,
            permissionRules: createPermissionRulesForContracts(contractsWithoutTimestampEnforcer),
          }),
        ).toThrow('Contract not found: TimestampEnforcer');
      });
    });

    describe('native-token-periodic', () => {
      const expectedPermissionType = 'native-token-periodic';
      it('matches with required caveats', () => {
        const enforcers = [
          NativeTokenPeriodTransferEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          NativeTokenPeriodTransferEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
      });

      it('rejects forbidden extra caveat', () => {
        const enforcers = [
          NativeTokenPeriodTransferEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          // Not allowed for native-token-periodic
          ValueLteEnforcer,
        ];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ExactCalldataEnforcer];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          NativeTokenPeriodTransferEnforcer.toLowerCase() as unknown as Hex,
          ExactCalldataEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
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
          findRuleWithMatchingCaveatAddresses({
            enforcers,
            permissionRules: createPermissionRulesForContracts(contractsWithoutTimestampEnforcer),
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
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          ERC20StreamingEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
      });

      it('rejects forbidden extra caveat', () => {
        const enforcers = [
          ERC20StreamingEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          // Not allowed for erc20-token-stream
          ExactCalldataEnforcer,
        ];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ERC20StreamingEnforcer];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          ERC20StreamingEnforcer.toLowerCase() as unknown as Hex,
          ValueLteEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
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
          findRuleWithMatchingCaveatAddresses({
            enforcers,
            permissionRules: createPermissionRulesForContracts(contractsWithoutTimestampEnforcer),
          }),
        ).toThrow('Contract not found: TimestampEnforcer');
      });
    });

    describe('erc20-token-periodic', () => {
      const expectedPermissionType = 'erc20-token-periodic';
      it('matches with required caveats', () => {
        const enforcers = [
          ERC20PeriodTransferEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          ERC20PeriodTransferEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
      });

      it('rejects forbidden extra caveat', () => {
        const enforcers = [
          ERC20PeriodTransferEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          // Not allowed for erc20-token-periodic
          ExactCalldataEnforcer,
        ];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ERC20PeriodTransferEnforcer];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          ERC20PeriodTransferEnforcer.toLowerCase() as unknown as Hex,
          ValueLteEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
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
          findRuleWithMatchingCaveatAddresses({
            enforcers,
            permissionRules: createPermissionRulesForContracts(contractsWithoutTimestampEnforcer),
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
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
      });

      it('rejects when only one AllowedCalldataEnforcer is provided', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when three AllowedCalldataEnforcer are provided', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when ValueLteEnforcer is missing', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
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
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          AllowedCalldataEnforcer.toLowerCase() as unknown as Hex,
          AllowedCalldataEnforcer.toLowerCase() as unknown as Hex,
          ValueLteEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        });
        expect(result.permissionType).toBe(expectedPermissionType);
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
          findRuleWithMatchingCaveatAddresses({
            enforcers,
            permissionRules: createPermissionRulesForContracts(contractsWithoutAllowedCalldataEnforcer),
          }),
        ).toThrow('Contract not found: AllowedCalldataEnforcer');
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

  describe('adversarial: attempts to violate decoder expectations', () => {
    describe('getPermissionRuleMatchingCaveatTypes()', () => {
      it('rejects empty enforcer list', () => {
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers: [],
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects enforcer list with only unknown/forbidden addresses', () => {
        const unknown = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
            enforcers: [unknown],
            permissionRules: createPermissionRulesForContracts(contracts),
          }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required enforcer count is exceeded (e.g. duplicate NonceEnforcer)', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
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
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects exactly one AllowedCalldataEnforcer for erc20-token-revocation (wrong multiplicity)', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects three AllowedCalldataEnforcer for erc20-token-revocation (excess multiplicity)', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          findRuleWithMatchingCaveatAddresses({
          enforcers,
          permissionRules: createPermissionRulesForContracts(contracts),
        }),
        ).toThrow('Unable to identify permission type');
      });
    });

    describe('reconstructDecodedPermission()', () => {
      const delegator =
        '0x1111111111111111111111111111111111111111' as Hex;
      const delegate =
        '0x2222222222222222222222222222222222222222' as Hex;
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
