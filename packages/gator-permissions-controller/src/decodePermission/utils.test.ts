import type { Caveat } from '@metamask/delegation-core';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { DeployedContractsByName } from './types';
import {
  createPermissionRulesForChainId,
  getChecksumEnforcersByChainId,
  getTermsByEnforcer,
  isSubset,
  splitHex,
} from './utils';

// Helper to build a contracts map with lowercase addresses
const buildContracts = (): DeployedContractsByName => ({
  ERC20PeriodTransferEnforcer: '0x1111111111111111111111111111111111111111',
  ERC20StreamingEnforcer: '0x2222222222222222222222222222222222222222',
  ExactCalldataEnforcer: '0x3333333333333333333333333333333333333333',
  NativeTokenPeriodTransferEnforcer:
    '0x4444444444444444444444444444444444444444',
  NativeTokenStreamingEnforcer: '0x5555555555555555555555555555555555555555',
  TimestampEnforcer: '0x6666666666666666666666666666666666666666',
  ValueLteEnforcer: '0x7777777777777777777777777777777777777777',
  NonceEnforcer: '0x8888888888888888888888888888888888888888',
  AllowedCalldataEnforcer: '0x9999999999999999999999999999999999999999',
});

describe('getChecksumEnforcersByChainId', () => {
  it('returns checksummed addresses for all known enforcers', () => {
    const contracts = buildContracts();
    const result = getChecksumEnforcersByChainId(contracts);

    expect(result).toStrictEqual({
      erc20StreamingEnforcer: getChecksumAddress(
        contracts.ERC20StreamingEnforcer,
      ),
      erc20PeriodicEnforcer: getChecksumAddress(
        contracts.ERC20PeriodTransferEnforcer,
      ),
      nativeTokenStreamingEnforcer: getChecksumAddress(
        contracts.NativeTokenStreamingEnforcer,
      ),
      nativeTokenPeriodicEnforcer: getChecksumAddress(
        contracts.NativeTokenPeriodTransferEnforcer,
      ),
      exactCalldataEnforcer: getChecksumAddress(
        contracts.ExactCalldataEnforcer,
      ),
      valueLteEnforcer: getChecksumAddress(contracts.ValueLteEnforcer),
      timestampEnforcer: getChecksumAddress(contracts.TimestampEnforcer),
      nonceEnforcer: getChecksumAddress(contracts.NonceEnforcer),
      allowedCalldataEnforcer: getChecksumAddress(
        contracts.AllowedCalldataEnforcer,
      ),
    });
  });

  it('throws if a required contract is missing', () => {
    const contracts = buildContracts();
    delete contracts.ValueLteEnforcer;
    expect(() => getChecksumEnforcersByChainId(contracts)).toThrow(
      'Contract not found: ValueLteEnforcer',
    );
  });
});

describe('createPermissionRulesForChainId', () => {
  it('builds canonical rules with correct required and allowed enforcers', () => {
    const contracts = buildContracts();
    const {
      erc20StreamingEnforcer,
      erc20PeriodicEnforcer,
      nativeTokenStreamingEnforcer,
      nativeTokenPeriodicEnforcer,
      exactCalldataEnforcer,
      valueLteEnforcer,
      timestampEnforcer,
      nonceEnforcer,
      allowedCalldataEnforcer,
    } = getChecksumEnforcersByChainId(contracts);

    // erc20-token-stream
    // erc20-token-periodic
    // native-token-stream
    // native-token-periodic
    // erc20-token-revocation
    const permissionTypeCount = 5;
    const rules = createPermissionRulesForChainId(contracts);
    expect(rules).toHaveLength(permissionTypeCount);

    const byType = Object.fromEntries(rules.map((r) => [r.permissionType, r]));

    // native-token-stream
    expect(byType['native-token-stream']).toBeDefined();
    expect(byType['native-token-stream'].permissionType).toBe(
      'native-token-stream',
    );
    expect(byType['native-token-stream'].optionalEnforcers.size).toBe(1);
    expect(
      byType['native-token-stream'].optionalEnforcers.has(timestampEnforcer),
    ).toBe(true);
    expect(byType['native-token-stream'].requiredEnforcers.size).toBe(3);
    expect(
      Array.from(byType['native-token-stream'].requiredEnforcers.entries()),
    ).toStrictEqual(
      expect.arrayContaining([
        [nativeTokenStreamingEnforcer, 1],
        [exactCalldataEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
    );

    // native-token-periodic
    expect(byType['native-token-periodic']).toBeDefined();
    expect(byType['native-token-periodic'].permissionType).toBe(
      'native-token-periodic',
    );
    expect(byType['native-token-periodic'].optionalEnforcers.size).toBe(1);
    expect(
      byType['native-token-periodic'].optionalEnforcers.has(timestampEnforcer),
    ).toBe(true);
    expect(byType['native-token-periodic'].requiredEnforcers.size).toBe(3);
    expect(
      Array.from(byType['native-token-periodic'].requiredEnforcers.entries()),
    ).toStrictEqual(
      expect.arrayContaining([
        [nativeTokenPeriodicEnforcer, 1],
        [exactCalldataEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
    );

    // erc20-token-stream
    expect(byType['erc20-token-stream']).toBeDefined();
    expect(byType['erc20-token-stream'].permissionType).toBe(
      'erc20-token-stream',
    );
    expect(byType['erc20-token-stream'].optionalEnforcers.size).toBe(1);
    expect(
      byType['erc20-token-stream'].optionalEnforcers.has(timestampEnforcer),
    ).toBe(true);
    expect(byType['erc20-token-stream'].requiredEnforcers.size).toBe(3);
    expect(
      Array.from(byType['erc20-token-stream'].requiredEnforcers.entries()),
    ).toStrictEqual(
      expect.arrayContaining([
        [erc20StreamingEnforcer, 1],
        [valueLteEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
    );

    // erc20-token-periodic
    expect(byType['erc20-token-periodic']).toBeDefined();
    expect(byType['erc20-token-periodic'].permissionType).toBe(
      'erc20-token-periodic',
    );
    expect(byType['erc20-token-periodic'].optionalEnforcers.size).toBe(1);
    expect(
      byType['erc20-token-periodic'].optionalEnforcers.has(timestampEnforcer),
    ).toBe(true);
    expect(byType['erc20-token-periodic'].requiredEnforcers.size).toBe(3);
    expect(
      Array.from(byType['erc20-token-periodic'].requiredEnforcers.entries()),
    ).toStrictEqual(
      expect.arrayContaining([
        [erc20PeriodicEnforcer, 1],
        [valueLteEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
    );

    // erc20-token-revocation
    expect(byType['erc20-token-revocation']).toBeDefined();
    expect(byType['erc20-token-revocation'].permissionType).toBe(
      'erc20-token-revocation',
    );
    expect(byType['erc20-token-revocation'].optionalEnforcers.size).toBe(1);
    expect(
      byType['erc20-token-revocation'].optionalEnforcers.has(timestampEnforcer),
    ).toBe(true);
    expect(byType['erc20-token-revocation'].requiredEnforcers.size).toBe(3);
    expect(
      Array.from(byType['erc20-token-revocation'].requiredEnforcers.entries()),
    ).toStrictEqual(
      expect.arrayContaining([
        [allowedCalldataEnforcer, 2],
        [valueLteEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
    );
  });
});

describe('isSubset', () => {
  it('returns true when subset is contained', () => {
    expect(isSubset(new Set([1, 2]), new Set([1, 2, 3]))).toBe(true);
  });

  it('returns false when subset has an extra element', () => {
    expect(isSubset(new Set([1, 4]), new Set([1, 2, 3]))).toBe(false);
  });

  it('returns true for empty subset', () => {
    expect(isSubset(new Set(), new Set([1, 2, 3]))).toBe(true);
  });
});

describe('getTermsByEnforcer', () => {
  const ENFORCER: Hex = '0x9999999999999999999999999999999999999999' as Hex;
  const OTHER: Hex = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
  const TERMS: Hex = '0x1234' as Hex;

  it('returns the terms when exactly one matching caveat exists', () => {
    const caveats: Caveat<Hex>[] = [
      { enforcer: OTHER, terms: '0x00' as Hex, args: '0x' as Hex },
      { enforcer: ENFORCER, terms: TERMS, args: '0x' as Hex },
    ];

    expect(getTermsByEnforcer({ caveats, enforcer: ENFORCER })).toBe(TERMS);
  });

  it('throws for zero matches', () => {
    const caveats: Caveat<Hex>[] = [
      { enforcer: OTHER, terms: '0x00' as Hex, args: '0x' as Hex },
    ];
    expect(() => getTermsByEnforcer({ caveats, enforcer: ENFORCER })).toThrow(
      'Invalid caveats',
    );
  });

  it('throws for zero matches if throwIfNotFound is true', () => {
    const caveats: Caveat<Hex>[] = [
      { enforcer: OTHER, terms: '0x00' as Hex, args: '0x' as Hex },
    ];
    expect(() =>
      getTermsByEnforcer({
        caveats,
        enforcer: ENFORCER,
        throwIfNotFound: true,
      }),
    ).toThrow('Invalid caveats');
  });

  it('returns null for zero matches if throwIfNotFound is false', () => {
    const caveats: Caveat<Hex>[] = [
      { enforcer: OTHER, terms: '0x00' as Hex, args: '0x' as Hex },
    ];
    expect(
      getTermsByEnforcer({
        caveats,
        enforcer: ENFORCER,
        throwIfNotFound: false,
      }),
    ).toBeNull();
  });

  it('throws for multiple matches', () => {
    const caveats: Caveat<Hex>[] = [
      { enforcer: ENFORCER, terms: TERMS, args: '0x' as Hex },
      { enforcer: ENFORCER, terms: TERMS, args: '0x' as Hex },
    ];
    expect(() => getTermsByEnforcer({ caveats, enforcer: ENFORCER })).toThrow(
      'Invalid caveats',
    );
  });

  it('throws for multiple matches if throwIfNotFound is true', () => {
    const caveats: Caveat<Hex>[] = [
      { enforcer: ENFORCER, terms: TERMS, args: '0x' as Hex },
      { enforcer: ENFORCER, terms: TERMS, args: '0x' as Hex },
    ];
    expect(() =>
      getTermsByEnforcer({
        caveats,
        enforcer: ENFORCER,
        throwIfNotFound: true,
      }),
    ).toThrow('Invalid caveats');
  });
});

describe('splitHex', () => {
  it('splits per byte lengths and preserves leading zeros', () => {
    const value = '0x00a0b0' as Hex; // 3 bytes
    expect(splitHex(value, [1, 2])).toStrictEqual(['0x00', '0xa0b0']);
  });

  it('splits example input correctly', () => {
    const value = '0x12345678' as Hex;
    expect(splitHex(value, [1, 3])).toStrictEqual(['0x12', '0x345678']);
  });
});
