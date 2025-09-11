import {
  createNativeTokenStreamingTerms,
  createNativeTokenPeriodTransferTerms,
  createERC20StreamingTerms,
  createERC20TokenPeriodTransferTerms,
  createTimestampTerms,
  type Hex,
} from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import { hexToBigInt, hexToNumber } from '@metamask/utils';

import {
  DELEGATION_FRAMEWORK_VERSION,
  getPermissionDataAndExpiry,
  identifyPermissionByEnforcers,
} from './decodePermission';

// These tests use the live deployments table for version 1.3.0 to
// construct deterministic caveat address sets for a known chain.

describe('decodePermission', () => {
  const invalidChainId = 99999999;
  const chainId = CHAIN_ID.sepolia;
  const contracts = DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION][chainId];

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

  describe('identifyPermissionByCaveats()', () => {
    describe('native-token-stream', () => {
      const expectedPermissionType = 'native-token-stream';

      it('matches with required caveats', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
        expect(result).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
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
          identifyPermissionByEnforcers({ enforcers, chainId }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ExactCalldataEnforcer];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, chainId }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects invalid chainId', () => {
        const enforcers = [
          NativeTokenStreamingEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, chainId: invalidChainId }),
        ).toThrow('Contracts not found for chainId');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          NativeTokenStreamingEnforcer.toLowerCase() as unknown as Hex,
          ExactCalldataEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
        expect(result).toBe('native-token-stream');
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
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
        expect(result).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          NativeTokenPeriodTransferEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
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
          identifyPermissionByEnforcers({ enforcers, chainId }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ExactCalldataEnforcer];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, chainId }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects invalid chainId', () => {
        const enforcers = [
          NativeTokenPeriodTransferEnforcer,
          ExactCalldataEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, chainId: invalidChainId }),
        ).toThrow('Contracts not found for chainId');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          NativeTokenPeriodTransferEnforcer.toLowerCase() as unknown as Hex,
          ExactCalldataEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
        expect(result).toBe(expectedPermissionType);
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
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
        expect(result).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          ERC20StreamingEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
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
          identifyPermissionByEnforcers({ enforcers, chainId }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ERC20StreamingEnforcer];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, chainId }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects invalid chainId', () => {
        const enforcers = [
          ERC20StreamingEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, chainId: invalidChainId }),
        ).toThrow('Contracts not found for chainId');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          ERC20StreamingEnforcer.toLowerCase() as unknown as Hex,
          ValueLteEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
        expect(result).toBe(expectedPermissionType);
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
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
        expect(result).toBe(expectedPermissionType);
      });

      it('allows TimestampEnforcer as extra', () => {
        const enforcers = [
          ERC20PeriodTransferEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
          TimestampEnforcer,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
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
          identifyPermissionByEnforcers({ enforcers, chainId }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects when required caveats are missing', () => {
        const enforcers = [ERC20PeriodTransferEnforcer];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, chainId }),
        ).toThrow('Unable to identify permission type');
      });

      it('rejects invalid chainId', () => {
        const enforcers = [
          ERC20PeriodTransferEnforcer,
          ValueLteEnforcer,
          NonceEnforcer,
        ];
        expect(() =>
          identifyPermissionByEnforcers({ enforcers, chainId: invalidChainId }),
        ).toThrow('Contracts not found for chainId');
      });

      it('accepts lowercased addresses', () => {
        const enforcers: Hex[] = [
          ERC20PeriodTransferEnforcer.toLowerCase() as unknown as Hex,
          ValueLteEnforcer.toLowerCase() as unknown as Hex,
          NonceEnforcer.toLowerCase() as unknown as Hex,
        ];
        const result = identifyPermissionByEnforcers({ enforcers, chainId });
        expect(result).toBe(expectedPermissionType);
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
          chainId,
          caveats,
          permissionType,
        });

        expect(expiry).toBe(timestampBeforeThreshold);
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
            chainId,
            caveats,
            permissionType,
          }),
        ).toThrow('Invalid expiry');
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
            chainId,
            caveats,
            permissionType,
          }),
        ).toThrow('Value must be a hexadecimal string.');
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
          chainId,
          caveats,
          permissionType,
        });

        expect(expiry).toBe(timestampBeforeThreshold);
        expect(hexToBigInt(data.periodAmount)).toBe(periodAmount);
        expect(hexToNumber(data.periodDuration)).toBe(periodDuration);
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
            chainId,
            caveats,
            permissionType,
          }),
        ).toThrow('Invalid expiry');
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
            chainId,
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
          chainId,
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
            chainId,
            caveats,
            permissionType,
          }),
        ).toThrow('Invalid expiry');
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
            chainId,
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
          chainId,
          caveats,
          permissionType,
        });

        expect(expiry).toBe(timestampBeforeThreshold);
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
            chainId,
            caveats,
            permissionType,
          }),
        ).toThrow('Invalid expiry');
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
            chainId,
            caveats,
            permissionType,
          }),
        ).toThrow('Value must be a hexadecimal string.');
      });
    });
  });
});
