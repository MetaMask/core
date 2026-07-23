import {
  createAllowedCalldataTerms,
  createAllowedTargetsTerms,
  createTimestampTerms,
} from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import { getChecksumAddress } from '@metamask/utils';
import type { Hex } from '@metamask/utils';

import { getChecksumEnforcersByChainId } from '../utils.js';
import { erc20PayeeRule } from './erc20PayeeRule.js';
import { expiryRule } from './expiryRule.js';
import { makePermissionDecoder } from './makePermissionDecoder.js';
import { nativePayeeRule } from './nativePayeeRule.js';
import { redeemerRule } from './redeemerRule.js';

describe('makePermissionDecoder', () => {
  const contracts = DELEGATOR_CONTRACTS['1.3.0'][CHAIN_ID.sepolia];
  const contractAddresses = getChecksumEnforcersByChainId(contracts);
  const {
    timestampEnforcer,
    nonceEnforcer: requiredEnforcer,
    redeemerEnforcer,
    allowedCalldataEnforcer,
    allowedTargetsEnforcer,
  } = contractAddresses;

  it('calls validate callback when decoding succeeds and extracts expiry', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [timestampEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [expiryRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: timestampEnforcer,
        terms: createTimestampTerms({
          afterThreshold: 0,
          beforeThreshold: 1720000,
        }),
        args: '0x' as Hex,
      },
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.expiry).toBe(1720000);
    expect(result.data).toStrictEqual({});
    expect(validateAndDecodeData).toHaveBeenCalled();
  });

  it('rejects when any caveat terms are not valid hex (invalid characters)', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [timestampEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [expiryRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: timestampEnforcer,
        terms: '0xgg' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(false);
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }
    expect(result.error.message).toBe('Invalid terms: must be a hex string');
    expect(validateAndDecodeData).not.toHaveBeenCalled();
  });

  it('rejects when any caveat terms contain non-hex characters after 0x prefix', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [timestampEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [expiryRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: timestampEnforcer,
        terms:
          '0x000000000000000000000000000000000000000000000000000000000000000z' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(false);
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }
    expect(result.error.message).toBe('Invalid terms: must be a hex string');
    expect(validateAndDecodeData).not.toHaveBeenCalled();
  });

  it('rejects when required enforcer terms are not valid hex', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [timestampEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [expiryRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: timestampEnforcer,
        terms: createTimestampTerms({
          afterThreshold: 0,
          beforeThreshold: 1720000,
        }),
        args: '0x' as Hex,
      },
      {
        enforcer: requiredEnforcer,
        terms: '0xNOTHEX' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(false);
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }
    expect(result.error.message).toBe('Invalid terms: must be a hex string');
    expect(validateAndDecodeData).not.toHaveBeenCalled();
  });

  it('accepts caveat terms with mixed-case hex', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [timestampEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [expiryRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: timestampEnforcer,
        terms: createTimestampTerms({
          afterThreshold: 0,
          beforeThreshold: 1720000,
        }),
        args: '0x' as Hex,
      },
      {
        enforcer: requiredEnforcer,
        terms:
          '0x000000000000000000000000000000000000000000000000000000000000abAB' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.expiry).toBe(1720000);
    expect(validateAndDecodeData).toHaveBeenCalled();
  });

  it('accepts caveat terms with empty hex', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(validateAndDecodeData).toHaveBeenCalled();
  });

  it('includes redeemer rule when RedeemerEnforcer caveat is present', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});
    // Raw packed 20-byte address (40 hex chars), not ABI-padded 32-byte words.
    const packedAddr = '1111111111111111111111111111111111111111' as const;

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [redeemerEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [redeemerRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: redeemerEnforcer,
        terms: `0x${packedAddr}` as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.rules).toStrictEqual([
      {
        type: 'redeemer',
        data: {
          addresses: [
            getChecksumAddress(
              '0x1111111111111111111111111111111111111111' as Hex,
            ),
          ],
        },
      },
    ]);
  });

  it('includes payee rule when AllowedTargetsEnforcer caveat is present (native)', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});
    const payeeAddress = '0x2222222222222222222222222222222222222222' as Hex;

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [allowedTargetsEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [nativePayeeRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [payeeAddress] }),
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.rules).toStrictEqual([
      {
        type: 'payee',
        data: {
          addresses: [getChecksumAddress(payeeAddress)],
        },
      },
    ]);
  });

  it('includes payee rule when AllowedCalldataEnforcer caveat is present (erc20)', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});
    const payeeAddress = '0x3333333333333333333333333333333333333333' as Hex;
    const paddedAddress = `0x${payeeAddress.slice(2).padStart(64, '0')}`;

    const decoder = makePermissionDecoder({
      permissionType: 'erc20-token-stream',
      contractAddresses,
      optionalEnforcers: [allowedCalldataEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [erc20PayeeRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedCalldataEnforcer,
        terms: createAllowedCalldataTerms({
          startIndex: 4,
          value: paddedAddress,
        }),
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.rules).toStrictEqual([
      {
        type: 'payee',
        data: {
          addresses: [getChecksumAddress(payeeAddress)],
        },
      },
    ]);
  });

  it('does not include payee rule when no matching payee caveat is present (erc20 decoder, AllowedTargets caveat)', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});
    const payeeAddress = '0x2222222222222222222222222222222222222222' as Hex;

    const decoder = makePermissionDecoder({
      permissionType: 'erc20-token-stream',
      contractAddresses,
      optionalEnforcers: [allowedTargetsEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [erc20PayeeRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [payeeAddress] }),
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.rules).toBeUndefined();
  });

  it('rejects multiple AllowedCalldataEnforcer caveats for erc20 payee decoding', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});
    const payeeAddress1 = '0x2222222222222222222222222222222222222222' as Hex;
    const payeeAddress2 = '0x3333333333333333333333333333333333333333' as Hex;
    const padded1 = `0x${payeeAddress1.slice(2).padStart(64, '0')}`;
    const padded2 = `0x${payeeAddress2.slice(2).padStart(64, '0')}`;

    const decoder = makePermissionDecoder({
      permissionType: 'erc20-token-stream',
      contractAddresses,
      optionalEnforcers: [allowedCalldataEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [erc20PayeeRule],
      validateAndDecodeData,
    });

    const result = decoder.validateAndDecodePermission([
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedCalldataEnforcer,
        terms: createAllowedCalldataTerms({
          startIndex: 4,
          value: padded1,
        }),
        args: '0x' as Hex,
      },
      {
        enforcer: allowedCalldataEnforcer,
        terms: createAllowedCalldataTerms({
          startIndex: 4,
          value: padded2,
        }),
        args: '0x' as Hex,
      },
    ]);

    expect(result.isValid).toBe(false);
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }
    expect(result.error.message).toBe(
      'Invalid payee caveats: multiple AllowedCalldataEnforcer caveats',
    );
  });

  it('includes payee rule with multiple addresses via AllowedTargetsEnforcer (native)', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});
    const payeeAddress1 = '0x4444444444444444444444444444444444444444' as Hex;
    const payeeAddress2 = '0x5555555555555555555555555555555555555555' as Hex;

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [allowedTargetsEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [nativePayeeRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({
          targets: [payeeAddress1, payeeAddress2],
        }),
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.rules).toStrictEqual([
      {
        type: 'payee',
        data: {
          addresses: [
            getChecksumAddress(payeeAddress1),
            getChecksumAddress(payeeAddress2),
          ],
        },
      },
    ]);
  });

  it('does not include payee rule when no matching payee caveat is present (native decoder, AllowedCalldata caveat)', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});
    const payeeAddress = '0x3333333333333333333333333333333333333333' as Hex;
    const paddedAddress = `0x${payeeAddress.slice(2).padStart(64, '0')}`;

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [allowedCalldataEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [nativePayeeRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedCalldataEnforcer,
        terms: createAllowedCalldataTerms({
          startIndex: 4,
          value: paddedAddress,
        }),
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.rules).toBeUndefined();
  });

  it('includes both redeemer and payee rules when both caveats present', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});
    const redeemerAddr = '1111111111111111111111111111111111111111' as const;
    const payeeAddress = '0x2222222222222222222222222222222222222222' as Hex;

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [redeemerEnforcer, allowedTargetsEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [redeemerRule, nativePayeeRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: redeemerEnforcer,
        terms: `0x${redeemerAddr}` as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [payeeAddress] }),
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.rules).toHaveLength(2);
    expect(result.rules).toStrictEqual([
      {
        type: 'redeemer',
        data: {
          addresses: [getChecksumAddress(`0x${redeemerAddr}` as Hex)],
        },
      },
      {
        type: 'payee',
        data: {
          addresses: [getChecksumAddress(payeeAddress)],
        },
      },
    ]);
  });

  it('does not include payee rule when no payee caveat is present', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [allowedTargetsEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [nativePayeeRule],
      validateAndDecodeData,
    });

    const caveats = [
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
    ];

    const result = decoder.validateAndDecodePermission(caveats);

    expect(result.isValid).toBe(true);
    if (!result.isValid) {
      throw new Error('Expected valid result');
    }
    expect(result.rules).toBeUndefined();
  });

  it('returns true from caveatAddressesMatch when enforcers match', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [timestampEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [expiryRule],
      validateAndDecodeData,
    });

    expect(
      decoder.caveatAddressesMatch([requiredEnforcer, timestampEnforcer]),
    ).toBe(true);
    expect(decoder.caveatAddressesMatch([requiredEnforcer])).toBe(true);
    expect(decoder.caveatAddressesMatch([])).toBe(false);
  });

  it('rejects when payee enforcer is configured as a required enforcer', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});
    const payeeAddress = '0x2222222222222222222222222222222222222222' as Hex;

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [],
      requiredEnforcers: {
        [requiredEnforcer]: 1,
        [allowedTargetsEnforcer]: 1,
      },
      rules: [nativePayeeRule],
      validateAndDecodeData,
    });

    const result = decoder.validateAndDecodePermission([
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [payeeAddress] }),
        args: '0x' as Hex,
      },
    ]);

    expect(result.isValid).toBe(false);
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }
    expect(result.error.message).toBe(
      'Invalid payee caveats: payee enforcer may not be a required caveat',
    );
  });

  it('rejects an ERC20 payee caveat with the wrong calldata start index', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});
    const payeeAddress = '0x3333333333333333333333333333333333333333' as const;
    const paddedAddress =
      `0x${payeeAddress.slice(2).padStart(64, '0')}` as const;

    const decoder = makePermissionDecoder({
      permissionType: 'erc20-token-stream',
      contractAddresses,
      optionalEnforcers: [allowedCalldataEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [erc20PayeeRule],
      validateAndDecodeData,
    });

    const result = decoder.validateAndDecodePermission([
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedCalldataEnforcer,
        terms: createAllowedCalldataTerms({
          startIndex: 36,
          value: paddedAddress,
        }),
        args: '0x' as Hex,
      },
    ]);

    expect(result.isValid).toBe(false);
  });

  it('rejects an ERC20 payee caveat when the calldata value is not one address', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const decoder = makePermissionDecoder({
      permissionType: 'erc20-token-stream',
      contractAddresses,
      optionalEnforcers: [allowedCalldataEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [erc20PayeeRule],
      validateAndDecodeData,
    });

    const result = decoder.validateAndDecodePermission([
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedCalldataEnforcer,
        terms: createAllowedCalldataTerms({
          startIndex: 4,
          value: '0x1234',
        }),
        args: '0x' as Hex,
      },
    ]);

    expect(result.isValid).toBe(false);
  });

  it('rejects a native payee caveat with no targets', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [allowedTargetsEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [nativePayeeRule],
      validateAndDecodeData,
    });

    const result = decoder.validateAndDecodePermission([
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedTargetsEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
    ]);

    expect(result.isValid).toBe(false);
  });

  it('rejects multiple AllowedTargetsEnforcer caveats for native payee decoding', () => {
    const validateAndDecodeData = jest.fn().mockReturnValue({});
    const payeeAddress1 = '0x2222222222222222222222222222222222222222' as Hex;
    const payeeAddress2 = '0x3333333333333333333333333333333333333333' as Hex;

    const decoder = makePermissionDecoder({
      permissionType: 'native-token-stream',
      contractAddresses,
      optionalEnforcers: [allowedTargetsEnforcer],
      requiredEnforcers: { [requiredEnforcer]: 1 },
      rules: [nativePayeeRule],
      validateAndDecodeData,
    });

    const result = decoder.validateAndDecodePermission([
      {
        enforcer: requiredEnforcer,
        terms: '0x' as Hex,
        args: '0x' as Hex,
      },
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [payeeAddress1] }),
        args: '0x' as Hex,
      },
      {
        enforcer: allowedTargetsEnforcer,
        terms: createAllowedTargetsTerms({ targets: [payeeAddress2] }),
        args: '0x' as Hex,
      },
    ]);

    expect(result.isValid).toBe(false);
    if (result.isValid) {
      throw new Error('Expected invalid result');
    }
    expect(result.error.message).toBe(
      'Invalid payee caveats: multiple AllowedTargetsEnforcer caveats',
    );
  });
});
