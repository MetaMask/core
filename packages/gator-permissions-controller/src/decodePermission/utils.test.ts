import type { Caveat } from '@metamask/delegation-core';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { createPermissionDecodersForContracts } from './decoders';
import type { DeployedContractsByName } from './types';
import {
  extractExpiryFromCaveatTerms,
  getChecksumEnforcersByChainId,
  getTermsByEnforcer,
  splitHex,
} from './utils';

// Helper to build a contracts map with lowercase addresses
const buildContracts = (): DeployedContractsByName => ({
  ERC20PeriodTransferEnforcer: '0x1111111111111111111111111111111111111111',
  ERC20StreamingEnforcer: '0x2222222222222222222222222222222222222222',
  ApprovalRevocationEnforcer: '0x1212121212121212121212121212121212121212',
  ExactCalldataEnforcer: '0x3333333333333333333333333333333333333333',
  NativeTokenPeriodTransferEnforcer:
    '0x4444444444444444444444444444444444444444',
  NativeTokenStreamingEnforcer: '0x5555555555555555555555555555555555555555',
  TimestampEnforcer: '0x6666666666666666666666666666666666666666',
  ValueLteEnforcer: '0x7777777777777777777777777777777777777777',
  NonceEnforcer: '0x8888888888888888888888888888888888888888',
  AllowedCalldataEnforcer: '0x9999999999999999999999999999999999999999',
  AllowedTargetsEnforcer: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  RedeemerEnforcer: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
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
      approvalRevocationEnforcer: getChecksumAddress(
        contracts.ApprovalRevocationEnforcer,
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
      allowedTargetsEnforcer: getChecksumAddress(
        contracts.AllowedTargetsEnforcer,
      ),
      redeemerEnforcer: getChecksumAddress(contracts.RedeemerEnforcer),
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

describe('createPermissionDecodersForContracts', () => {
  it('builds canonical decoders with correct required and allowed enforcers', () => {
    const contracts = buildContracts();
    const {
      erc20StreamingEnforcer,
      erc20PeriodicEnforcer,
      nativeTokenStreamingEnforcer,
      nativeTokenPeriodicEnforcer,
      approvalRevocationEnforcer,
      exactCalldataEnforcer,
      valueLteEnforcer,
      timestampEnforcer,
      nonceEnforcer,
      allowedCalldataEnforcer,
      allowedTargetsEnforcer,
      redeemerEnforcer,
    } = getChecksumEnforcersByChainId(contracts);

    // erc20-token-stream
    // erc20-token-periodic
    // erc20-token-allowance
    // native-token-stream
    // native-token-periodic
    // native-token-allowance
    // token-approval-revocation
    const permissionTypeCount = 7;
    const decoders = createPermissionDecodersForContracts(contracts);
    expect(decoders).toHaveLength(permissionTypeCount);

    const byType = Object.fromEntries(
      decoders.map((decoder) => [decoder.permissionType, decoder]),
    );

    // native-token-stream
    expect(byType['native-token-stream']).toBeDefined();
    expect(byType['native-token-stream'].permissionType).toBe(
      'native-token-stream',
    );
    expect(byType['native-token-stream'].optionalEnforcers.size).toBe(3);
    expect(
      byType['native-token-stream'].optionalEnforcers.has(timestampEnforcer),
    ).toBe(true);
    expect(
      byType['native-token-stream'].optionalEnforcers.has(redeemerEnforcer),
    ).toBe(true);
    expect(
      byType['native-token-stream'].optionalEnforcers.has(
        allowedTargetsEnforcer,
      ),
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
    expect(byType['native-token-periodic'].optionalEnforcers.size).toBe(3);
    expect(
      byType['native-token-periodic'].optionalEnforcers.has(timestampEnforcer),
    ).toBe(true);
    expect(
      byType['native-token-periodic'].optionalEnforcers.has(redeemerEnforcer),
    ).toBe(true);
    expect(
      byType['native-token-periodic'].optionalEnforcers.has(
        allowedTargetsEnforcer,
      ),
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
    expect(byType['erc20-token-stream'].optionalEnforcers.size).toBe(3);
    expect(
      byType['erc20-token-stream'].optionalEnforcers.has(timestampEnforcer),
    ).toBe(true);
    expect(
      byType['erc20-token-stream'].optionalEnforcers.has(redeemerEnforcer),
    ).toBe(true);
    expect(
      byType['erc20-token-stream'].optionalEnforcers.has(
        allowedCalldataEnforcer,
      ),
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
    expect(byType['erc20-token-periodic'].optionalEnforcers.size).toBe(3);
    expect(
      byType['erc20-token-periodic'].optionalEnforcers.has(timestampEnforcer),
    ).toBe(true);
    expect(
      byType['erc20-token-periodic'].optionalEnforcers.has(redeemerEnforcer),
    ).toBe(true);
    expect(
      byType['erc20-token-periodic'].optionalEnforcers.has(
        allowedCalldataEnforcer,
      ),
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

    // native-token-allowance
    expect(byType['native-token-allowance']).toBeDefined();
    expect(byType['native-token-allowance'].permissionType).toBe(
      'native-token-allowance',
    );
    expect(byType['native-token-allowance'].optionalEnforcers.size).toBe(3);
    expect(
      byType['native-token-allowance'].optionalEnforcers.has(timestampEnforcer),
    ).toBe(true);
    expect(
      byType['native-token-allowance'].optionalEnforcers.has(redeemerEnforcer),
    ).toBe(true);
    expect(
      byType['native-token-allowance'].optionalEnforcers.has(
        allowedTargetsEnforcer,
      ),
    ).toBe(true);
    expect(byType['native-token-allowance'].requiredEnforcers.size).toBe(3);
    expect(
      Array.from(byType['native-token-allowance'].requiredEnforcers.entries()),
    ).toStrictEqual(
      expect.arrayContaining([
        [nativeTokenPeriodicEnforcer, 1],
        [exactCalldataEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
    );

    // erc20-token-allowance
    expect(byType['erc20-token-allowance']).toBeDefined();
    expect(byType['erc20-token-allowance'].permissionType).toBe(
      'erc20-token-allowance',
    );
    expect(byType['erc20-token-allowance'].optionalEnforcers.size).toBe(3);
    expect(
      byType['erc20-token-allowance'].optionalEnforcers.has(timestampEnforcer),
    ).toBe(true);
    expect(
      byType['erc20-token-allowance'].optionalEnforcers.has(redeemerEnforcer),
    ).toBe(true);
    expect(
      byType['erc20-token-allowance'].optionalEnforcers.has(
        allowedCalldataEnforcer,
      ),
    ).toBe(true);
    expect(byType['erc20-token-allowance'].requiredEnforcers.size).toBe(3);
    expect(
      Array.from(byType['erc20-token-allowance'].requiredEnforcers.entries()),
    ).toStrictEqual(
      expect.arrayContaining([
        [erc20PeriodicEnforcer, 1],
        [valueLteEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
    );

    // token-approval-revocation
    expect(byType['token-approval-revocation']).toBeDefined();
    expect(byType['token-approval-revocation'].permissionType).toBe(
      'token-approval-revocation',
    );
    expect(byType['token-approval-revocation'].optionalEnforcers.size).toBe(1);
    expect(
      byType['token-approval-revocation'].optionalEnforcers.has(
        timestampEnforcer,
      ),
    ).toBe(true);
    expect(byType['token-approval-revocation'].requiredEnforcers.size).toBe(2);
    expect(
      Array.from(
        byType['token-approval-revocation'].requiredEnforcers.entries(),
      ),
    ).toStrictEqual(
      expect.arrayContaining([
        [approvalRevocationEnforcer, 1],
        [nonceEnforcer, 1],
      ]),
    );
  });

  it('each decoder has caveatAddressesMatch and validateAndDecodePermission', () => {
    const contracts = buildContracts();
    const decoders = createPermissionDecodersForContracts(contracts);
    const {
      nativeTokenStreamingEnforcer,
      exactCalldataEnforcer,
      nonceEnforcer,
      timestampEnforcer,
    } = getChecksumEnforcersByChainId(contracts);

    for (const decoder of decoders) {
      expect(typeof decoder.caveatAddressesMatch).toBe('function');
      expect(typeof decoder.validateAndDecodePermission).toBe('function');
    }

    const nativeStreamDecoder = decoders.find(
      (candidate) => candidate.permissionType === 'native-token-stream',
    );
    expect(nativeStreamDecoder).toBeDefined();
    if (!nativeStreamDecoder) {
      throw new Error('Decoder not found');
    }

    const matchingCaveatAddresses: Hex[] = [
      nativeTokenStreamingEnforcer,
      exactCalldataEnforcer,
      nonceEnforcer,
      timestampEnforcer,
    ];
    expect(
      nativeStreamDecoder.caveatAddressesMatch(matchingCaveatAddresses),
    ).toBe(true);
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

describe('extractExpiryFromCaveatTerms', () => {
  it('returns expiry from valid TimestampEnforcer terms', () => {
    const expiry = 1735689600n;
    const terms = `0x${'0'.repeat(32)}${expiry.toString(16).padStart(32, '0')}` as Hex;

    expect(extractExpiryFromCaveatTerms(terms)).toBe(Number(expiry));
  });

  it('throws if terms length is not 66 characters', () => {
    const invalidTerms = '0x1234' as Hex;
    expect(() => extractExpiryFromCaveatTerms(invalidTerms)).toThrow(
      'Invalid TimestampEnforcer terms length: expected 66 characters (0x + 64 hex), got 6',
    );
  });

  it('throws if timestampAfterThreshold is non-zero', () => {
    const terms =
      '0x0000000000000000000000000000000100000000000000000000000000000001' as Hex;

    expect(() => extractExpiryFromCaveatTerms(terms)).toThrow(
      'Invalid expiry: timestampAfterThreshold must be 0',
    );
  });

  it('throws if timestampBeforeThreshold is zero', () => {
    const terms = `0x${'0'.repeat(64)}` as Hex;

    expect(() => extractExpiryFromCaveatTerms(terms)).toThrow(
      'Invalid expiry: timestampBeforeThreshold must be greater than 0',
    );
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
