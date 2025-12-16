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
import { hexToBigInt, numberToHex } from '@metamask/utils';

import {
  getPermissionDataAndExpiry,
  identifyPermissionByEnforcers,
  reconstructDecodedPermission,
} from './decodePermission';
import type {
  DecodedPermission,
  DeployedContractsByName,
  PermissionType,
} from './types';

// These tests use the live deployments table for version 1.3.0 to
// construct deterministic caveat address sets for a known chain.

describe('decodePermission', () => {
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][chainId];

  const {
    ExactCalldataEnforcer,
    TimestampEnforcer,
    ValueLteEnforcer,
    ERC20StreamingEnforcer,
    ERC20PeriodTransferEnforcer,
    NativeTokenStreamingEnforcer,
    NativeTokenPeriodTransferEnforcer,
    NonceEnforcer,
  } = contracts;

  describe('identifyPermissionByEnforcers()', () => {
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
        identifyPermissionByEnforcers({
          enforcers,
          contracts: contractsWithDuplicates,
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
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
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
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ExactCalldataEnforcer];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          NativeTokenStreamingEnforcer.toLowerCase() as unknown as Hex,
          ExactCalldataEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe('native-token-stream');
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
          identifyPermissionByEnforcers({
            enforcers,
            contracts: contractsWithoutTimestampEnforcer,
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
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          NativeTokenPeriodTransferEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
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
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ExactCalldataEnforcer];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          NativeTokenPeriodTransferEnforcer.toLowerCase() as unknown as Hex,
          ExactCalldataEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
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
          identifyPermissionByEnforcers({
            enforcers,
            contracts: contractsWithoutTimestampEnforcer,
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
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          ERC20StreamingEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
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
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ERC20StreamingEnforcer];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          ERC20StreamingEnforcer.toLowerCase() as unknown as Hex,
          ValueLteEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
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
          identifyPermissionByEnforcers({
            enforcers,
            contracts: contractsWithoutTimestampEnforcer,
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
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          ERC20PeriodTransferEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
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
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ERC20PeriodTransferEnforcer];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          ERC20PeriodTransferEnforcer.toLowerCase() as unknown as Hex,
          ValueLteEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
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
          identifyPermissionByEnforcers({
            enforcers,
            contracts: contractsWithoutTimestampEnforcer,
          }),
        ).toThrow('Contract not found: TimestampEnforcer');
      });
    });

    describe('erc20-token-revocation', () => {
      const expectedPermissionType = 'erc20-token-revocation';
      const { AllowedCalldataEnforcer } = contracts;

      it('matches with two AllowedCalldataEnforcer and ValueLteEnforcer and NonceEnforcer', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
      });

      it('rejects when only one AllowedCalldataEnforcer is provided', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, contracts }),
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
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when ValueLteEnforcer is missing', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          AllowedCalldataEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, contracts }),
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
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          AllowedCalldataEnforcer.toLowerCase() as unknown as Hex,
          AllowedCalldataEnforcer.toLowerCase() as unknown as Hex,
          ValueLteEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, contracts });
        expect(result).toBe(expectedPermissionType);
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
          identifyPermissionByEnforcers({
            enforcers,
            contracts: contractsWithoutAllowedCalldataEnforcer,
          }),
        ).toThrow('Contract not found: AllowedCalldataEnforcer');
      });
    });
  });

  describe('getPermissionDataAndExpiry', () => {
    const timestampBeforeThreshold = 1720000;
    const timestampAfterThreshold = 0;

    const expiryCaveat = {
      enforcer: TimestampEnforcer,
      terms: createTimestampTerms({
        timestampAfterThreshold,
        timestampBeforeThreshold,
      }),
      args: '0x',
    } as const;

    it('throws if an invalid permission type is provided', () => {
      const caveats = [expiryCaveat];
      expect(() => {
        getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType:
            'invalid-permission-type' as unknown as PermissionType,
        });
      }).toThrow('Invalid permission type');
    });

    describe('native-token-stream', () => {
      const permissionType = 'native-token-stream';

      const initialAmount = 123456n;
      const maxAmount = 999999n;
      const amountPerSecond = 1n;
      const startTime = 1715664;

      it('returns the correct expiry and data', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount,
                maxAmount,
                amountPerSecond,
                startTime,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        const { expiry, data } = getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType,
        });

        expect(expiry).toBe(timestampBeforeThreshold);
        expect(hexToBigInt(data.initialAmount)).toBe(initialAmount);
        expect(hexToBigInt(data.maxAmount)).toBe(maxAmount);
        expect(hexToBigInt(data.amountPerSecond)).toBe(amountPerSecond);
        expect(data.startTime).toBe(startTime);
      });

      it('returns null expiry, and correct data if no expiry caveat is provided', () => {
        const caveats = [
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount,
                maxAmount,
                amountPerSecond,
                startTime,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        const { expiry, data } = getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType,
        });

        expect(expiry).toBeNull();
        expect(hexToBigInt(data.initialAmount)).toBe(initialAmount);
        expect(hexToBigInt(data.maxAmount)).toBe(maxAmount);
        expect(hexToBigInt(data.amountPerSecond)).toBe(amountPerSecond);
        expect(data.startTime).toBe(startTime);
      });

      it('rejects invalid expiry with timestampAfterThreshold', () => {
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: createTimestampTerms({
              timestampAfterThreshold: 1,
              timestampBeforeThreshold,
            }),
            args: '0x',
          } as const,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount,
                maxAmount,
                amountPerSecond,
                startTime,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow('Invalid expiry: timestampAfterThreshold must be 0');
      });

      it('rejects invalid nativeTokenStream terms', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: '0x00',
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow('Value must be a hexadecimal string.');
      });

      it('rejects expiry terms that are too short', () => {
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: '0x1234' as Hex,
            args: '0x',
          } as const,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount,
                maxAmount,
                amountPerSecond,
                startTime,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow(
          'Invalid TimestampEnforcer terms length: expected 66 characters (0x + 64 hex), got 6',
        );
      });

      it('rejects expiry terms that are too long', () => {
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: `0x${'0'.repeat(68)}` as const,
            args: '0x',
          } as const,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount,
                maxAmount,
                amountPerSecond,
                startTime,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow(
          'Invalid TimestampEnforcer terms length: expected 66 characters (0x + 64 hex), got 70',
        );
      });

      it('rejects expiry timestamp that is not a safe integer', () => {
        // Use maximum uint128 value which exceeds Number.MAX_SAFE_INTEGER
        const maxUint128 = 'f'.repeat(32);
        const termsHex = `0x${'0'.repeat(32)}${maxUint128}` as Hex;
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: termsHex,
            args: '0x',
          } as const,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount,
                maxAmount,
                amountPerSecond,
                startTime,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow('Value is not a safe integer');
      });

      it('handles large valid expiry timestamp', () => {
        // Use a large but valid timestamp (year 9999: 253402300799)
        const largeTimestamp = 253402300799;
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: createTimestampTerms({
              timestampAfterThreshold: 0,
              timestampBeforeThreshold: largeTimestamp,
            }),
            args: '0x',
          } as const,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount,
                maxAmount,
                amountPerSecond,
                startTime,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        const { expiry, data } = getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType,
        });

        expect(expiry).toBe(largeTimestamp);
        expect(hexToBigInt(data.initialAmount)).toBe(initialAmount);
      });

      it('rejects when expiry timestamp is 0', () => {
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: createTimestampTerms({
              timestampAfterThreshold: 0,
              timestampBeforeThreshold: 0,
            }),
            args: '0x',
          } as const,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount,
                maxAmount,
                amountPerSecond,
                startTime,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow(
          'Invalid expiry: timestampBeforeThreshold must be greater than 0',
        );
      });
    });

    describe('native-token-periodic', () => {
      const permissionType = 'native-token-periodic';

      const periodAmount = 123456n;
      const periodDuration = 3600;
      const startDate = 1715664;

      it('returns the correct expiry and data', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: NativeTokenPeriodTransferEnforcer,
            terms: createNativeTokenPeriodTransferTerms(
              {
                periodAmount,
                periodDuration,
                startDate,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        const { expiry, data } = getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType,
        });

        expect(expiry).toBe(timestampBeforeThreshold);
        expect(hexToBigInt(data.periodAmount)).toBe(periodAmount);
        expect(data.periodDuration).toBe(periodDuration);
        expect(data.startTime).toBe(startDate);
      });

      it('returns null expiry, and correct data if no expiry caveat is provided', () => {
        const caveats = [
          {
            enforcer: NativeTokenPeriodTransferEnforcer,
            terms: createNativeTokenPeriodTransferTerms(
              {
                periodAmount,
                periodDuration,
                startDate,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        const { expiry, data } = getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType,
        });

        expect(expiry).toBeNull();
        expect(hexToBigInt(data.periodAmount)).toBe(periodAmount);
        expect(data.periodDuration).toBe(periodDuration);
        expect(data.startTime).toBe(startDate);
      });

      it('rejects invalid expiry with timestampAfterThreshold', () => {
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: createTimestampTerms({
              timestampAfterThreshold: 1,
              timestampBeforeThreshold,
            }),
            args: '0x',
          } as const,
          {
            enforcer: NativeTokenPeriodTransferEnforcer,
            terms: createNativeTokenPeriodTransferTerms(
              {
                periodAmount,
                periodDuration,
                startDate,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow('Invalid expiry: timestampAfterThreshold must be 0');
      });

      it('rejects invalid nativeTokenPeriodic terms', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: NativeTokenPeriodTransferEnforcer,
            terms: '0x00',
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow('Value must be a hexadecimal string.');
      });
    });

    describe('erc20-token-stream', () => {
      const permissionType = 'erc20-token-stream';

      const tokenAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
      const initialAmount = 555n;
      const maxAmount = 999n;
      const amountPerSecond = 2n;
      const startTime = 1715665;

      it('returns the correct expiry and data', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: ERC20StreamingEnforcer,
            terms: createERC20StreamingTerms(
              {
                tokenAddress,
                initialAmount,
                maxAmount,
                amountPerSecond,
                startTime,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        const { expiry, data } = getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType,
        });

        expect(expiry).toBe(timestampBeforeThreshold);
        expect(data.tokenAddress).toBe(tokenAddress);
        expect(hexToBigInt(data.initialAmount)).toBe(initialAmount);
        expect(hexToBigInt(data.maxAmount)).toBe(maxAmount);
        expect(hexToBigInt(data.amountPerSecond)).toBe(amountPerSecond);
        expect(data.startTime).toBe(startTime);
      });

      it('returns null expiry, and correct data if no expiry caveat is provided', () => {
        const caveats = [
          {
            enforcer: ERC20StreamingEnforcer,
            terms: createERC20StreamingTerms(
              {
                tokenAddress,
                initialAmount,
                maxAmount,
                amountPerSecond,
                startTime,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        const { expiry, data } = getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType,
        });

        expect(expiry).toBeNull();
        expect(data.tokenAddress).toBe(tokenAddress);
        expect(hexToBigInt(data.initialAmount)).toBe(initialAmount);
        expect(hexToBigInt(data.maxAmount)).toBe(maxAmount);
        expect(hexToBigInt(data.amountPerSecond)).toBe(amountPerSecond);
        expect(data.startTime).toBe(startTime);
      });

      it('rejects invalid expiry with timestampAfterThreshold', () => {
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: createTimestampTerms({
              timestampAfterThreshold: 1,
              timestampBeforeThreshold,
            }),
            args: '0x',
          } as const,
          {
            enforcer: ERC20StreamingEnforcer,
            terms: createERC20StreamingTerms(
              {
                tokenAddress,
                initialAmount,
                maxAmount,
                amountPerSecond,
                startTime,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow('Invalid expiry: timestampAfterThreshold must be 0');
      });

      it('rejects invalid erc20-token-stream terms', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: ERC20StreamingEnforcer,
            terms: '0x00',
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow('Value must be a hexadecimal string.');
      });
    });

    describe('erc20-token-periodic', () => {
      const permissionType = 'erc20-token-periodic';

      const tokenAddress = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
      const periodAmount = 123n;
      const periodDuration = 86400;
      const startDate = 1715666;

      it('returns the correct expiry and data', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: ERC20PeriodTransferEnforcer,
            terms: createERC20TokenPeriodTransferTerms(
              {
                tokenAddress,
                periodAmount,
                periodDuration,
                startDate,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        const { expiry, data } = getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType,
        });

        expect(expiry).toBe(timestampBeforeThreshold);
        expect(data.tokenAddress).toBe(tokenAddress);
        expect(hexToBigInt(data.periodAmount)).toBe(periodAmount);
        expect(data.periodDuration).toBe(periodDuration);
        expect(data.startTime).toBe(startDate);
      });

      it('returns null expiry, and correct data if no expiry caveat is provided', () => {
        const caveats = [
          {
            enforcer: ERC20PeriodTransferEnforcer,
            terms: createERC20TokenPeriodTransferTerms(
              {
                tokenAddress,
                periodAmount,
                periodDuration,
                startDate,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        const { expiry, data } = getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType,
        });

        expect(expiry).toBeNull();
        expect(data.tokenAddress).toBe(tokenAddress);
        expect(hexToBigInt(data.periodAmount)).toBe(periodAmount);
        expect(data.periodDuration).toBe(periodDuration);
        expect(data.startTime).toBe(startDate);
      });

      it('rejects invalid expiry with timestampAfterThreshold', () => {
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: createTimestampTerms({
              timestampAfterThreshold: 1,
              timestampBeforeThreshold,
            }),
            args: '0x',
          } as const,
          {
            enforcer: ERC20PeriodTransferEnforcer,
            terms: createERC20TokenPeriodTransferTerms(
              {
                tokenAddress,
                periodAmount,
                periodDuration,
                startDate,
              },
              { out: 'hex' },
            ),
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow('Invalid expiry: timestampAfterThreshold must be 0');
      });

      it('rejects invalid erc20-token-periodic terms', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: ERC20PeriodTransferEnforcer,
            terms: '0x00',
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow('Value must be a hexadecimal string.');
      });
    });

    describe('erc20-token-revocation', () => {
      const permissionType = 'erc20-token-revocation';

      it('returns the correct expiry and data', () => {
        const caveats = [expiryCaveat];

        const { expiry, data } = getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType,
        });

        expect(expiry).toStrictEqual(timestampBeforeThreshold);
        expect(data).toStrictEqual({});
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
      expect(result.address).toBe(delegator);
      expect(result.signer).toStrictEqual({
        type: 'account',
        data: { address: delegate },
      });
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
});
