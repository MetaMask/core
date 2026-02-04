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
    AllowedCalldataEnforcer,
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

      it('rejects terms with zero initialAmount', () => {
        const ZERO_32 = '0'.repeat(64);
        const maxHex = maxAmount.toString(16).padStart(64, '0');
        const amountPerSecondHex = amountPerSecond.toString(16).padStart(64, '0');
        const startTimeHex = startTime.toString(16).padStart(64, '0');
        const terms = `0x${ZERO_32}${maxHex}${amountPerSecondHex}${startTimeHex}` as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms,
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
          'Invalid native-token-stream terms: initialAmount must be a positive number',
        );
      });

      it('rejects terms with zero maxAmount', () => {
        const initialHex = initialAmount.toString(16).padStart(64, '0');
        const ZERO_32 = '0'.repeat(64);
        const amountPerSecondHex = amountPerSecond.toString(16).padStart(64, '0');
        const startTimeHex = startTime.toString(16).padStart(64, '0');
        const terms = `0x${initialHex}${ZERO_32}${amountPerSecondHex}${startTimeHex}` as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms,
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
          'Invalid native-token-stream terms: maxAmount must be a positive number',
        );
      });

      it('rejects terms with zero amountPerSecond', () => {
        const initialHex = initialAmount.toString(16).padStart(64, '0');
        const maxHex = maxAmount.toString(16).padStart(64, '0');
        const ZERO_32 = '0'.repeat(64);
        const startTimeHex = startTime.toString(16).padStart(64, '0');
        const terms = `0x${initialHex}${maxHex}${ZERO_32}${startTimeHex}` as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms,
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
          'Invalid native-token-stream terms: amountPerSecond must be a positive number',
        );
      });

      it('rejects terms with zero startTime', () => {
        const initialHex = initialAmount.toString(16).padStart(64, '0');
        const maxHex = maxAmount.toString(16).padStart(64, '0');
        const amountPerSecondHex = amountPerSecond.toString(16).padStart(64, '0');
        const startTimeZero = '0'.repeat(64);
        const terms = `0x${initialHex}${maxHex}${amountPerSecondHex}${startTimeZero}` as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms,
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
          'Invalid native-token-stream terms: startTime must be a positive number',
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

      it('rejects terms with zero periodDuration', () => {
        const periodAmountHex = periodAmount.toString(16).padStart(64, '0');
        const periodDurationZero = '0'.repeat(64);
        const startDateHex = startDate.toString(16).padStart(64, '0');
        const terms = `0x${periodAmountHex}${periodDurationZero}${startDateHex}` as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: NativeTokenPeriodTransferEnforcer,
            terms,
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
          'Invalid native-token-periodic terms: periodDuration must be a positive number',
        );
      });

      it('rejects terms with zero startTime', () => {
        const periodAmountHex = periodAmount.toString(16).padStart(64, '0');
        const periodDurationHex = periodDuration.toString(16).padStart(64, '0');
        const startTimeZero = '0'.repeat(64);
        const terms = `0x${periodAmountHex}${periodDurationHex}${startTimeZero}` as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: NativeTokenPeriodTransferEnforcer,
            terms,
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
          'Invalid native-token-periodic terms: startTime must be a positive number',
        );
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

      it('rejects terms when maxAmount is less than initialAmount', () => {
        const tokenHex = tokenAddress.slice(2);
        const initialAmountHex = (1000n).toString(16).padStart(64, '0');
        const maxAmountHex = (100n).toString(16).padStart(64, '0');
        const amountPerSecondHex = amountPerSecond.toString(16).padStart(64, '0');
        const startTimeHex = startTime.toString(16).padStart(64, '0');
        const terms = `0x${tokenHex}${initialAmountHex}${maxAmountHex}${amountPerSecondHex}${startTimeHex}` as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: ERC20StreamingEnforcer,
            terms,
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
          'Invalid erc20-token-stream terms: maxAmount must be greater than initialAmount',
        );
      });

      it('rejects terms with zero startTime', () => {
        const tokenHex = tokenAddress.slice(2);
        const initialAmountHex = initialAmount.toString(16).padStart(64, '0');
        const maxAmountHex = maxAmount.toString(16).padStart(64, '0');
        const amountPerSecondHex = amountPerSecond.toString(16).padStart(64, '0');
        const startTimeZero = '0'.repeat(64);
        const terms = `0x${tokenHex}${initialAmountHex}${maxAmountHex}${amountPerSecondHex}${startTimeZero}` as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: ERC20StreamingEnforcer,
            terms,
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
          'Invalid erc20-token-stream terms: startTime must be a positive number',
        );
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

      it('rejects terms with zero periodDuration', () => {
        const tokenHex = tokenAddress.slice(2);
        const periodAmountHex = periodAmount.toString(16).padStart(64, '0');
        const periodDurationZero = '0'.repeat(64);
        const startDateHex = startDate.toString(16).padStart(64, '0');
        const terms = `0x${tokenHex}${periodAmountHex}${periodDurationZero}${startDateHex}` as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: ERC20PeriodTransferEnforcer,
            terms,
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
          'Invalid erc20-token-periodic terms: periodDuration must be a positive number',
        );
      });

      it('rejects terms with zero startTime', () => {
        const tokenHex = tokenAddress.slice(2);
        const periodAmountHex = periodAmount.toString(16).padStart(64, '0');
        const periodDurationHex = periodDuration.toString(16).padStart(64, '0');
        const startTimeZero = '0'.repeat(64);
        const terms = `0x${tokenHex}${periodAmountHex}${periodDurationHex}${startTimeZero}` as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: ERC20PeriodTransferEnforcer,
            terms,
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
          'Invalid erc20-token-periodic terms: startTime must be a positive number',
        );
      });
    });

    describe('erc20-token-revocation', () => {
      const permissionType = 'erc20-token-revocation';
      const approveSelectorTerms =
        '0x0000000000000000000000000000000000000000000000000000000000000000095ea7b3' as Hex;
      const zeroAmountTerms =
        '0x00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000000' as Hex;
      const zeroValueLteTerms =
        '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;

      it('returns the correct expiry and data', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: AllowedCalldataEnforcer,
            terms: approveSelectorTerms,
            args: '0x',
          } as const,
          {
            enforcer: AllowedCalldataEnforcer,
            terms: zeroAmountTerms,
            args: '0x',
          } as const,
          {
            enforcer: ValueLteEnforcer,
            terms: zeroValueLteTerms,
            args: '0x',
          } as const,
        ];

        const { expiry, data } = getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType,
        });

        expect(expiry).toStrictEqual(timestampBeforeThreshold);
        expect(data).toStrictEqual({});
      });

      it('rejects invalid allowed calldata terms', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: AllowedCalldataEnforcer,
            terms:
              '0x0000000000000000000000000000000000000000000000000000000000000000deadbeef' as Hex,
            args: '0x',
          } as const,
          {
            enforcer: AllowedCalldataEnforcer,
            terms: zeroAmountTerms,
            args: '0x',
          } as const,
          {
            enforcer: ValueLteEnforcer,
            terms: zeroValueLteTerms,
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
          'Invalid erc20-token-revocation terms: expected approve selector and zero amount constraints',
        );
      });

      it('rejects non-zero valueLte terms', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: AllowedCalldataEnforcer,
            terms: approveSelectorTerms,
            args: '0x',
          } as const,
          {
            enforcer: AllowedCalldataEnforcer,
            terms: zeroAmountTerms,
            args: '0x',
          } as const,
          {
            enforcer: ValueLteEnforcer,
            terms:
              '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType,
          }),
        ).toThrow('Invalid ValueLteEnforcer terms: maxValue must be 0');
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
    describe('identifyPermissionByEnforcers()', () => {
      it('rejects empty enforcer list', () => {
        expect(() =>
          identifyPermissionByEnforcers({ enforcers: [], contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects enforcer list with only unknown/forbidden addresses', () => {
        const unknown = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' as Hex;
        expect(() =>
          identifyPermissionByEnforcers({
            enforcers: [unknown],
            contracts,
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
          identifyPermissionByEnforcers({ enforcers, contracts }),
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
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects exactly one AllowedCalldataEnforcer for erc20-token-revocation (wrong multiplicity)', () => {
        const enforcers = [
          AllowedCalldataEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, contracts }),
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
          identifyPermissionByEnforcers({ enforcers, contracts }),
        ).toThrow('Unable to identify permission type');
      });
    });

    describe('getPermissionDataAndExpiry()', () => {
      const timestampBeforeThreshold = 1720000;
      const expiryCaveat = {
        enforcer: TimestampEnforcer,
        terms: createTimestampTerms({
          timestampAfterThreshold: 0,
          timestampBeforeThreshold,
        }),
        args: '0x',
      } as const;

      it('rejects duplicate caveats for same enforcer (e.g. two TimestampEnforcer)', () => {
        const caveats = [
          expiryCaveat,
          {
            enforcer: TimestampEnforcer,
            terms: createTimestampTerms({
              timestampAfterThreshold: 0,
              timestampBeforeThreshold: 9999,
            }),
            args: '0x',
          } as const,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount: 1n,
                maxAmount: 2n,
                amountPerSecond: 1n,
                startTime: 1715664,
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
            permissionType: 'native-token-stream',
          }),
        ).toThrow('Invalid caveats');
      });

      it('rejects duplicate permission-type enforcer caveats (e.g. two ERC20StreamingEnforcer)', () => {
        const tokenAddress =
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
        const terms = createERC20StreamingTerms(
          {
            tokenAddress,
            initialAmount: 1n,
            maxAmount: 2n,
            amountPerSecond: 1n,
            startTime: 1715664,
          },
          { out: 'hex' },
        );
        const caveats = [
          expiryCaveat,
          { enforcer: ERC20StreamingEnforcer, terms, args: '0x' as const },
          { enforcer: ERC20StreamingEnforcer, terms, args: '0x' as const },
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType: 'erc20-token-stream',
          }),
        ).toThrow('Invalid caveats');
      });

      it('rejects TimestampEnforcer terms with non-hex characters', () => {
        const invalidTerms =
          '0x00000000000000000000000000000000zz000000000000000000000000001a3b80' as Hex;
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: invalidTerms,
            args: '0x',
          } as const,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount: 1n,
                maxAmount: 2n,
                amountPerSecond: 1n,
                startTime: 1715664,
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
            permissionType: 'native-token-stream',
          }),
        ).toThrow();
      });

      it('rejects permission-type terms shorter than expected (truncated payload)', () => {
        // ERC20 stream expects [20, 32, 32, 32, 32] bytes = 148 bytes = 296 hex chars.
        // Provide only 100 hex chars so last segments are truncated; hexToNumber may throw or mis-parse.
        const truncatedTerms = `0x${'a'.repeat(100)}` as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: ERC20StreamingEnforcer,
            terms: truncatedTerms,
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType: 'erc20-token-stream',
          }),
        ).toThrow();
      });

      it('rejects native-token-stream terms shorter than expected', () => {
        const truncatedTerms = `0x${'00'.repeat(50)}` as Hex; // 50 bytes, need 128
        const caveats = [
          expiryCaveat,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: truncatedTerms,
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType: 'native-token-stream',
          }),
        ).toThrow();
      });

      it('rejects erc20-token-revocation with only approve selector (missing zero-amount constraint)', () => {
        const approveSelectorTerms =
          '0x0000000000000000000000000000000000000000000000000000000000000000095ea7b3' as Hex;
        const zeroValueLteTerms =
          '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: AllowedCalldataEnforcer,
            terms: approveSelectorTerms,
            args: '0x',
          } as const,
          {
            enforcer: AllowedCalldataEnforcer,
            terms: approveSelectorTerms,
            args: '0x',
          } as const,
          {
            enforcer: ValueLteEnforcer,
            terms: zeroValueLteTerms,
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType: 'erc20-token-revocation',
          }),
        ).toThrow(
          'Invalid erc20-token-revocation terms: expected approve selector and zero amount constraints',
        );
      });

      it('rejects erc20-token-revocation with only zero-amount constraint (missing approve selector)', () => {
        const zeroAmountTerms =
          '0x00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000000' as Hex;
        const zeroValueLteTerms =
          '0x0000000000000000000000000000000000000000000000000000000000000000' as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: AllowedCalldataEnforcer,
            terms: zeroAmountTerms,
            args: '0x',
          } as const,
          {
            enforcer: AllowedCalldataEnforcer,
            terms: zeroAmountTerms,
            args: '0x',
          } as const,
          {
            enforcer: ValueLteEnforcer,
            terms: zeroValueLteTerms,
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType: 'erc20-token-revocation',
          }),
        ).toThrow(
          'Invalid erc20-token-revocation terms: expected approve selector and zero amount constraints',
        );
      });

      it('rejects erc20-token-revocation when ValueLteEnforcer terms are non-zero', () => {
        const approveSelectorTerms =
          '0x0000000000000000000000000000000000000000000000000000000000000000095ea7b3' as Hex;
        const zeroAmountTerms =
          '0x00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000000' as Hex;
        const nonZeroValueLteTerms =
          '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;
        const caveats = [
          expiryCaveat,
          {
            enforcer: AllowedCalldataEnforcer,
            terms: approveSelectorTerms,
            args: '0x',
          } as const,
          {
            enforcer: AllowedCalldataEnforcer,
            terms: zeroAmountTerms,
            args: '0x',
          } as const,
          {
            enforcer: ValueLteEnforcer,
            terms: nonZeroValueLteTerms,
            args: '0x',
          } as const,
        ];

        expect(() =>
          getPermissionDataAndExpiry({
            contracts,
            caveats,
            permissionType: 'erc20-token-revocation',
          }),
        ).toThrow('Invalid ValueLteEnforcer terms: maxValue must be 0');
      });

      it('rejects TimestampEnforcer terms with wrong length (66 required)', () => {
        const badLengthTerms = `0x${'0'.repeat(65)}` as Hex; // 65 hex chars after 0x
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: badLengthTerms,
            args: '0x',
          } as const,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount: 1n,
                maxAmount: 2n,
                amountPerSecond: 1n,
                startTime: 1715664,
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
            permissionType: 'native-token-stream',
          }),
        ).toThrow('Invalid TimestampEnforcer terms length');
      });

      it('rejects expiry timestampBeforeThreshold zero', () => {
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
                initialAmount: 1n,
                maxAmount: 2n,
                amountPerSecond: 1n,
                startTime: 1715664,
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
            permissionType: 'native-token-stream',
          }),
        ).toThrow(
          'Invalid expiry: timestampBeforeThreshold must be greater than 0',
        );
      });

      it('rejects expiry timestampAfterThreshold non-zero', () => {
        const caveats = [
          {
            enforcer: TimestampEnforcer,
            terms: createTimestampTerms({
              timestampAfterThreshold: 1,
              timestampBeforeThreshold: 1720000,
            }),
            args: '0x',
          } as const,
          {
            enforcer: NativeTokenStreamingEnforcer,
            terms: createNativeTokenStreamingTerms(
              {
                initialAmount: 1n,
                maxAmount: 2n,
                amountPerSecond: 1n,
                startTime: 1715664,
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
            permissionType: 'native-token-stream',
          }),
        ).toThrow('Invalid expiry: timestampAfterThreshold must be 0');
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

  describe('adversarial: intent violations — decoder accepts inputs that may not meet semantic expectations', () => {
    const expiryCaveat = {
      enforcer: TimestampEnforcer,
      terms: createTimestampTerms({
        timestampAfterThreshold: 0,
        timestampBeforeThreshold: 1720000,
      }),
      args: '0x',
    } as const;

    it('successfully decodes erc20-token-stream with zero token address (no validation that token is non-zero)', () => {
      const zeroAddress =
        '0x0000000000000000000000000000000000000000' as Hex;
      const caveats = [
        expiryCaveat,
        {
          enforcer: ERC20StreamingEnforcer,
          terms: createERC20StreamingTerms(
            {
              tokenAddress: zeroAddress,
              initialAmount: 1n,
              maxAmount: 2n,
              amountPerSecond: 1n,
              startTime: 1715664,
            },
            { out: 'hex' },
          ),
          args: '0x',
        } as const,
      ];

      const { expiry, data } = getPermissionDataAndExpiry({
        contracts,
        caveats,
        permissionType: 'erc20-token-stream',
      });

      expect(expiry).toBe(1720000);
      expect(data.tokenAddress).toBe(zeroAddress);
    });

    it('rejects native-token-stream with all-zero amounts (validates amounts are positive)', () => {
      const ZERO_32 = '0'.repeat(64);
      const startTimeHex = '1a2b50'.padStart(64, '0');
      const terms = `0x${ZERO_32}${ZERO_32}${ZERO_32}${startTimeHex}` as Hex;

      const caveats = [
        expiryCaveat,
        {
          enforcer: NativeTokenStreamingEnforcer,
          terms,
          args: '0x',
        } as const,
      ];

      expect(() =>
        getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType: 'native-token-stream',
        }),
      ).toThrow(
        'Invalid native-token-stream terms: initialAmount must be a positive number',
      );
    });

    it('rejects erc20-token-periodic with periodDuration 0 (validates duration is positive)', () => {
      const tokenAddress =
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
      const periodAmountHex = (100n).toString(16).padStart(64, '0');
      const periodDurationZero = '0'.repeat(64);
      const startDateHex = (1715664).toString(16).padStart(64, '0');
      const terms = `0x${tokenAddress.slice(2)}${periodAmountHex}${periodDurationZero}${startDateHex}` as Hex;

      const caveats = [
        expiryCaveat,
        {
          enforcer: ERC20PeriodTransferEnforcer,
          terms,
          args: '0x',
        } as const,
      ];

      expect(() =>
        getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType: 'erc20-token-periodic',
        }),
      ).toThrow(
        'Invalid erc20-token-periodic terms: periodDuration must be a positive number',
      );
    });

    it('rejects erc20-token-stream when initialAmount exceeds maxAmount (validates maxAmount >= initialAmount)', () => {
      const tokenAddress =
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Hex;
      const initialAmountHex = (1000n).toString(16).padStart(64, '0');
      const maxAmountHex = (100n).toString(16).padStart(64, '0');
      const amountPerSecondHex = (1n).toString(16).padStart(64, '0');
      const startTimeHex = (1715664).toString(16).padStart(64, '0');
      const terms = `0x${tokenAddress.slice(2)}${initialAmountHex}${maxAmountHex}${amountPerSecondHex}${startTimeHex}` as Hex;

      const caveats = [
        expiryCaveat,
        {
          enforcer: ERC20StreamingEnforcer,
          terms,
          args: '0x',
        } as const,
      ];

      expect(() =>
        getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType: 'erc20-token-stream',
        }),
      ).toThrow(
        'Invalid erc20-token-stream terms: maxAmount must be greater than initialAmount',
      );
    });

    it('successfully decodes when terms are longer than expected format (trailing bytes ignored; no validation of total terms length)', () => {
      const tokenAddress =
        '0xcccccccccccccccccccccccccccccccccccccccc' as Hex;
      const validTerms = createERC20StreamingTerms(
        {
          tokenAddress,
          initialAmount: 42n,
          maxAmount: 100n,
          amountPerSecond: 1n,
          startTime: 1715664,
        },
        { out: 'hex' },
      );
      const termsWithTrailingGarbage = `${validTerms}deadbeef` as Hex;

      const caveats = [
        expiryCaveat,
        {
          enforcer: ERC20StreamingEnforcer,
          terms: termsWithTrailingGarbage,
          args: '0x',
        } as const,
      ];

      const { data } = getPermissionDataAndExpiry({
        contracts,
        caveats,
        permissionType: 'erc20-token-stream',
      });

      expect(data.tokenAddress).toBe(tokenAddress);
      expect(hexToBigInt(data.initialAmount)).toBe(42n);
      expect(hexToBigInt(data.maxAmount)).toBe(100n);
      expect(data.startTime).toBe(1715664);
    });

    it('rejects native-token-stream with startTime 0 (validates startTime is positive)', () => {
      const oneHex = (1n).toString(16).padStart(64, '0');
      const twoHex = (2n).toString(16).padStart(64, '0');
      const startTimeZero = '0'.repeat(64);
      const terms = `0x${oneHex}${twoHex}${oneHex}${startTimeZero}` as Hex;

      const caveats = [
        expiryCaveat,
        {
          enforcer: NativeTokenStreamingEnforcer,
          terms,
          args: '0x',
        } as const,
      ];

      expect(() =>
        getPermissionDataAndExpiry({
          contracts,
          caveats,
          permissionType: 'native-token-stream',
        }),
      ).toThrow(
        'Invalid native-token-stream terms: startTime must be a positive number',
      );
    });
  });
});
