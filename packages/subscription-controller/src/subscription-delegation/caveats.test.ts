import {
  decodeAllowedCalldataTerms,
  decodeERC20TokenPeriodTransferTerms,
  ROOT_AUTHORITY,
} from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

import { SubscriptionDelegationServiceErrorMessage } from '../constants.js';
import {
  buildSubscriptionCaveats,
  buildUnsignedSubscriptionDelegation,
  encodeTransferToCalldataPrefix,
} from './caveats.js';

const PERIOD_ENFORCER = '0x2222222222222222222222222222222222222222' as Hex;
const TOKEN_ADDRESS = '0x3333333333333333333333333333333333333333' as Hex;
const DELEGATE = '0x4444444444444444444444444444444444444444' as Hex;
const DELEGATOR = '0x5555555555555555555555555555555555555555' as Hex;
const ALLOWED_CALLDATA_ENFORCER =
  '0x6666666666666666666666666666666666666666' as Hex;
const RECIPIENT = '0x77777777777777777777777777777777777777ab' as Hex;

const ENFORCERS = {
  erc20TokenPeriodTransfer: PERIOD_ENFORCER,
  allowedCalldata: ALLOWED_CALLDATA_ENFORCER,
};

describe('encodeTransferToCalldataPrefix', () => {
  it('encodes the transfer selector followed by the ABI-encoded recipient', () => {
    expect(encodeTransferToCalldataPrefix(RECIPIENT)).toBe(
      `0xa9059cbb${'0'.repeat(24)}77777777777777777777777777777777777777ab`,
    );
  });

  it.each([
    ['too short', '0x1234'],
    ['non-hex', '0x7777777777777777777777777777777777777zab'],
    ['bad checksum', '0xaBcdEFABcdEFabcdEfAbCdefabcdeFABcDEFabCD'],
  ] as const)('throws for a %s address', (_label, address) => {
    expect(() => encodeTransferToCalldataPrefix(address)).toThrow(
      SubscriptionDelegationServiceErrorMessage.InvalidRecipientAddress,
    );
  });
});

describe('buildSubscriptionCaveats', () => {
  it('builds only ERC20TokenPeriodTransfer and AllowedCalldata caveats', () => {
    const caveats = buildSubscriptionCaveats({
      enforcers: ENFORCERS,
      delegateAddress: DELEGATE,
      recipientAddress: RECIPIENT,
      tokenAddress: TOKEN_ADDRESS,
      periodAmount: 10n * 10n ** 18n,
      periodDuration: 28 * 86_400,
      startDate: 1_700_000_000,
    });

    expect(caveats).toHaveLength(2);
    const [periodCaveat, allowedCalldataCaveat] = caveats;
    expect(periodCaveat?.enforcer).toBe(PERIOD_ENFORCER);
    expect(allowedCalldataCaveat?.enforcer).toBe(ALLOWED_CALLDATA_ENFORCER);
    expect(
      decodeAllowedCalldataTerms(allowedCalldataCaveat?.terms ?? '0x'),
    ).toStrictEqual({
      startIndex: 0,
      value: encodeTransferToCalldataPrefix(RECIPIENT),
    });
    expect(allowedCalldataCaveat?.args).toBe('0x');
    expect(
      decodeERC20TokenPeriodTransferTerms(periodCaveat?.terms ?? '0x'),
    ).toStrictEqual({
      tokenAddress: TOKEN_ADDRESS,
      periodAmount: 10n * 10n ** 18n,
      periodDuration: 28 * 86_400,
      startDate: 1_700_000_000,
    });
  });
});

describe('buildUnsignedSubscriptionDelegation', () => {
  it('builds a root unsigned delegation with a 32-byte salt', () => {
    const salt =
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Hex;
    const unsigned = buildUnsignedSubscriptionDelegation({
      delegateAddress: DELEGATE,
      delegatorAddress: DELEGATOR,
      recipientAddress: RECIPIENT,
      enforcers: ENFORCERS,
      tokenAddress: TOKEN_ADDRESS,
      periodAmount: 100n,
      periodDuration: 365 * 86_400,
      startDate: 1_700_000_000,
      salt,
    });

    expect(unsigned).toStrictEqual({
      delegate: DELEGATE,
      delegator: DELEGATOR,
      authority: ROOT_AUTHORITY,
      caveats: expect.any(Array),
      salt,
    });
    expect(unsigned.salt).toMatch(/^0x[0-9a-fA-F]{64}$/u);
    expect(unsigned.caveats).toHaveLength(2);
    expect(unsigned.caveats[0]?.enforcer).toBe(PERIOD_ENFORCER);
    expect(unsigned.caveats[1]?.enforcer).toBe(ALLOWED_CALLDATA_ENFORCER);
  });

  it('generates a random 32-byte salt when omitted', () => {
    const unsigned = buildUnsignedSubscriptionDelegation({
      delegateAddress: DELEGATE,
      delegatorAddress: DELEGATOR,
      recipientAddress: RECIPIENT,
      enforcers: ENFORCERS,
      tokenAddress: TOKEN_ADDRESS,
      periodAmount: 100n,
      periodDuration: 28 * 86_400,
      startDate: 1_700_000_000,
    });

    expect(unsigned.salt).toMatch(/^0x[0-9a-fA-F]{64}$/u);
  });
});
