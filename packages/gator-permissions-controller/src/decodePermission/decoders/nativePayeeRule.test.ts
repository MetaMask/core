import { createAllowedTargetsTerms } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { ChecksumCaveat } from '../types';
import { getChecksumEnforcersByChainId } from '../utils';
import { nativePayeeRule } from './nativePayeeRule';

describe('nativePayeeRule', () => {
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][CHAIN_ID.sepolia];
  const contractAddresses = getChecksumEnforcersByChainId(contracts);
  const { allowedTargetsEnforcer, nonceEnforcer } = contractAddresses;
  const requiredEnforcers = new Map<Hex, number>([[nonceEnforcer, 1]]);

  const PAYEE_A: Hex = '0x4444444444444444444444444444444444444444';
  const PAYEE_B: Hex = '0x5555555555555555555555555555555555555555';
  const CHECKSUM_PAYEE_INPUT: Hex =
    '0xde709f2102306220921060314715629080e2fb77';

  it('returns null when no AllowedTargetsEnforcer caveat is present', () => {
    const caveats: ChecksumCaveat[] = [
      { enforcer: nonceEnforcer, terms: '0x' as Hex, args: '0x' as Hex },
    ];

    expect(
      nativePayeeRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toBeNull();
  });

  it('returns a payee rule with a single decoded checksummed address', () => {
    const caveats: ChecksumCaveat[] = [
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [PAYEE_A] }),
        args: '0x' as Hex,
      },
    ];

    expect(
      nativePayeeRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toStrictEqual({
      type: 'payee',
      data: { addresses: [getChecksumAddress(PAYEE_A)] },
    });
  });

  it('returns a payee rule with multiple decoded checksummed addresses', () => {
    const caveats: ChecksumCaveat[] = [
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [PAYEE_A, PAYEE_B] }),
        args: '0x' as Hex,
      },
    ];

    expect(
      nativePayeeRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toStrictEqual({
      type: 'payee',
      data: {
        addresses: [getChecksumAddress(PAYEE_A), getChecksumAddress(PAYEE_B)],
      },
    });
  });

  it('returns checksummed payee addresses', () => {
    const caveats: ChecksumCaveat[] = [
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [CHECKSUM_PAYEE_INPUT] }),
        args: '0x' as Hex,
      },
    ];

    expect(
      nativePayeeRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toStrictEqual({
      type: 'payee',
      data: { addresses: [getChecksumAddress(CHECKSUM_PAYEE_INPUT)] },
    });
  });

  it('throws when allowedTargetsEnforcer is configured as required', () => {
    const requiredWithPayee = new Map<Hex, number>([
      [nonceEnforcer, 1],
      [allowedTargetsEnforcer, 1],
    ]);
    const caveats: ChecksumCaveat[] = [
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [PAYEE_A] }),
        args: '0x' as Hex,
      },
    ];

    expect(() =>
      nativePayeeRule({
        contractAddresses,
        caveats,
        requiredEnforcers: requiredWithPayee,
      }),
    ).toThrow(
      'Invalid payee caveats: payee enforcer may not be a required caveat',
    );
  });

  it('throws when more than one AllowedTargetsEnforcer caveat is present', () => {
    const caveats: ChecksumCaveat[] = [
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [PAYEE_A] }),
        args: '0x' as Hex,
      },
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [PAYEE_B] }),
        args: '0x' as Hex,
      },
    ];

    expect(() =>
      nativePayeeRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toThrow('Invalid payee caveats: multiple AllowedTargetsEnforcer caveats');
  });
});
