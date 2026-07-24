import { createAllowedCalldataTerms } from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import type { ChecksumCaveat } from '../types.js';
import { getChecksumEnforcersByChainId } from '../utils.js';
import { erc20PayeeRule } from './erc20PayeeRule.js';

describe('erc20PayeeRule', () => {
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][CHAIN_ID.sepolia];
  const contractAddresses = getChecksumEnforcersByChainId(contracts);
  const { allowedCalldataEnforcer, nonceEnforcer } = contractAddresses;
  const requiredEnforcers = new Map<Hex, number>([[nonceEnforcer, 1]]);

  const PAYEE_ADDRESS: Hex = '0x3333333333333333333333333333333333333333';
  const CHECKSUM_PAYEE_INPUT: Hex =
    '0x8617e340b3d01fa5f11f306f4090fd50e238070d';
  const paddedPayee: Hex = `0x${PAYEE_ADDRESS.slice(2).padStart(64, '0')}`;

  const validPayeeCaveat: ChecksumCaveat = {
    enforcer: allowedCalldataEnforcer,
    terms: createAllowedCalldataTerms({
      startIndex: 4,
      value: paddedPayee,
    }),
    args: '0x' as Hex,
  };

  it('returns null when no AllowedCalldataEnforcer caveat is present', () => {
    const caveats: ChecksumCaveat[] = [
      { enforcer: nonceEnforcer, terms: '0x' as Hex, args: '0x' as Hex },
    ];

    expect(
      erc20PayeeRule({ contractAddresses, caveats, requiredEnforcers }),
    ).toBeNull();
  });

  it('returns a payee rule with the decoded checksummed address', () => {
    expect(
      erc20PayeeRule({
        contractAddresses,
        caveats: [validPayeeCaveat],
        requiredEnforcers,
      }),
    ).toStrictEqual({
      type: 'payee',
      data: { addresses: [getChecksumAddress(PAYEE_ADDRESS)] },
    });
  });

  it('returns a checksummed payee address when encoded address is lowercase', () => {
    const paddedLowercasePayee: Hex = `0x${CHECKSUM_PAYEE_INPUT.slice(2).padStart(64, '0')}`;
    const caveat: ChecksumCaveat = {
      enforcer: allowedCalldataEnforcer,
      terms: createAllowedCalldataTerms({
        startIndex: 4,
        value: paddedLowercasePayee,
      }),
      args: '0x' as Hex,
    };

    expect(
      erc20PayeeRule({
        contractAddresses,
        caveats: [caveat],
        requiredEnforcers,
      }),
    ).toStrictEqual({
      type: 'payee',
      data: { addresses: [getChecksumAddress(CHECKSUM_PAYEE_INPUT)] },
    });
  });

  it('throws when allowedCalldataEnforcer is configured as required', () => {
    const requiredWithPayee = new Map<Hex, number>([
      [nonceEnforcer, 1],
      [allowedCalldataEnforcer, 1],
    ]);

    expect(() =>
      erc20PayeeRule({
        contractAddresses,
        caveats: [validPayeeCaveat],
        requiredEnforcers: requiredWithPayee,
      }),
    ).toThrow(
      'Invalid payee caveats: payee enforcer may not be a required caveat',
    );
  });

  it('throws when more than one AllowedCalldataEnforcer caveat is present', () => {
    expect(() =>
      erc20PayeeRule({
        contractAddresses,
        caveats: [validPayeeCaveat, validPayeeCaveat],
        requiredEnforcers,
      }),
    ).toThrow(
      'Invalid payee caveats: multiple AllowedCalldataEnforcer caveats',
    );
  });

  it('throws when startIndex is not 4', () => {
    const caveat: ChecksumCaveat = {
      enforcer: allowedCalldataEnforcer,
      terms: createAllowedCalldataTerms({
        startIndex: 0,
        value: paddedPayee,
      }),
      args: '0x' as Hex,
    };

    expect(() =>
      erc20PayeeRule({
        contractAddresses,
        caveats: [caveat],
        requiredEnforcers,
      }),
    ).toThrow(
      'Invalid payee caveat: AllowedCalldataEnforcer startIndex must be 4',
    );
  });

  it('throws when the encoded value is not 32 bytes long', () => {
    const shortValue: Hex = `0x${PAYEE_ADDRESS.slice(2)}`;
    const caveat: ChecksumCaveat = {
      enforcer: allowedCalldataEnforcer,
      terms: createAllowedCalldataTerms({
        startIndex: 4,
        value: shortValue,
      }),
      args: '0x' as Hex,
    };

    expect(() =>
      erc20PayeeRule({
        contractAddresses,
        caveats: [caveat],
        requiredEnforcers,
      }),
    ).toThrow(
      'Invalid payee caveat: AllowedCalldataEnforcer value must be 32 bytes long',
    );
  });
});
