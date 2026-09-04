import { SignTypedDataVersion, TypedDataUtils } from '@metamask/eth-sig-util';

import {
  DEFAULT_MAX_SIGNATURE_ADDRESSES,
  MAX_SIGNATURE_ADDRESSES_CEILING,
  extractSignatureAddresses,
} from './signature-address-extraction.js';

const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';
const ADDR_C = '0x3333333333333333333333333333333333333333';
const ADDR_D = '0x5555555555555555555555555555555555555555';
const SIGNER = '0x4444444444444444444444444444444444444444';
const ZERO = '0x0000000000000000000000000000000000000000';

const DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

type TypedDataFixture = {
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  domain: { verifyingContract: string };
  message: Record<string, unknown>;
};

const build = (
  primaryType: string,
  types: Record<string, { name: string; type: string }[]>,
  message: Record<string, unknown>,
): TypedDataFixture => ({
  types: { EIP712Domain: DOMAIN_TYPE, ...types },
  primaryType,
  domain: { verifyingContract: ADDR_C },
  message,
});

const addressesOf = (
  ...args: Parameters<typeof extractSignatureAddresses>
): string[] => extractSignatureAddresses(...args).addresses;

const nAddresses = (count: number): string[] =>
  Array.from(
    { length: count },
    (_, i) => `0x${(i + 1).toString(16).padStart(2, '0').repeat(20)}`,
  );

describe('extractSignatureAddresses', () => {
  it('extracts a permit `spender` from the schema', () => {
    const data = build(
      'Permit',
      {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
      },
      { owner: SIGNER, spender: ADDR_A, value: '1' },
    );
    expect(addressesOf(data, { exclude: [SIGNER] })).toStrictEqual([ADDR_A]);
  });

  it('extracts an EIP-3009 `to`', () => {
    const data = build(
      'ReceiveWithAuthorization',
      {
        ReceiveWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
        ],
      },
      { from: SIGNER, to: ADDR_A, value: '1' },
    );
    expect(addressesOf(data, { exclude: [SIGNER] })).toStrictEqual([ADDR_A]);
  });

  it('extracts an address field with a protocol-specific name', () => {
    const data = {
      domain: {
        name: 'HyperliquidSignTransaction',
        version: '1',
        chainId: 8453,
        verifyingContract: ZERO,
      },
      message: {
        hyperliquidChain: 'Mainnet',
        signatureChainId: '0x2105',
        agentAddress: ADDR_A,
        agentName: '',
        nonce: 1784737070579,
        type: 'approveAgent',
      },
      primaryType: 'HyperliquidTransaction:ApproveAgent',
      types: {
        EIP712Domain: DOMAIN_TYPE,
        'HyperliquidTransaction:ApproveAgent': [
          { name: 'hyperliquidChain', type: 'string' },
          { name: 'agentAddress', type: 'address' },
          { name: 'agentName', type: 'string' },
          { name: 'nonce', type: 'uint64' },
        ],
      },
    };
    expect(addressesOf(data, { exclude: [SIGNER] })).toStrictEqual([ADDR_A]);
  });

  it('extracts EVERY address field in a Seaport order (offerer/zone/token/recipient), nested structs + arrays', () => {
    const data = build(
      'OrderComponents',
      {
        OrderComponents: [
          { name: 'offerer', type: 'address' },
          { name: 'zone', type: 'address' },
          { name: 'offer', type: 'OfferItem[]' },
          { name: 'consideration', type: 'ConsiderationItem[]' },
          { name: 'startTime', type: 'uint256' },
        ],
        OfferItem: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        ConsiderationItem: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'recipient', type: 'address' },
        ],
      },
      {
        offerer: SIGNER,
        zone: ADDR_A,
        offer: [{ token: ADDR_B, amount: '1' }],
        consideration: [{ token: ADDR_C, amount: '1', recipient: ADDR_D }],
        startTime: '0',
      },
    );
    expect(addressesOf(data, { exclude: [SIGNER] })).toStrictEqual([
      ADDR_A,
      ADDR_B,
      ADDR_C,
      ADDR_D,
    ]);
  });

  it('extracts addresses from a Permit2 batch (struct array + top-level spender)', () => {
    const data = build(
      'PermitBatch',
      {
        PermitBatch: [
          { name: 'details', type: 'PermitDetails[]' },
          { name: 'spender', type: 'address' },
          { name: 'sigDeadline', type: 'uint256' },
        ],
        PermitDetails: [
          { name: 'token', type: 'address' },
          { name: 'amount', type: 'uint160' },
        ],
      },
      {
        details: [
          { token: ADDR_A, amount: '1' },
          { token: ADDR_B, amount: '2' },
        ],
        spender: ADDR_C,
        sigDeadline: '0',
      },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A, ADDR_B, ADDR_C]);
  });

  it('extracts an `address[]` field', () => {
    const data = build(
      'Airdrop',
      { Airdrop: [{ name: 'recipients', type: 'address[]' }] },
      { recipients: [ADDR_A, ADDR_B] },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A, ADDR_B]);
  });

  it('handles a fixed-size `address[N]` field', () => {
    const data = build(
      'Airdrop',
      { Airdrop: [{ name: 'recipients', type: 'address[2]' }] },
      { recipients: [ADDR_A, ADDR_B] },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A, ADDR_B]);
  });

  it('flags overflow when an address-array field value is not an array', () => {
    const data = build(
      'Airdrop',
      {
        Airdrop: [
          { name: 'recipients', type: 'address[]' },
          { name: 'to', type: 'address' },
        ],
      },
      { recipients: 'not-an-array', to: ADDR_A },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A]);
    expect(extractSignatureAddresses(data).overflow).toBe(true);
  });

  it('does not flag overflow when a non-address array type is not an array', () => {
    const data = build(
      'T',
      {
        T: [
          { name: 'amounts', type: 'uint256[]' },
          { name: 'to', type: 'address' },
        ],
      },
      { amounts: 'not-an-array', to: ADDR_A },
    );
    const result = extractSignatureAddresses(data);
    expect(result.addresses).toStrictEqual([ADDR_A]);
    expect(result.overflow).toBe(false);
  });

  it('treats `address[abc]` as an array (signer matches on a trailing `]`)', () => {
    const data = build(
      'Airdrop',
      { Airdrop: [{ name: 'recipients', type: 'address[abc]' }] },
      { recipients: [ADDR_A, ADDR_B] },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A, ADDR_B]);
  });

  it('treats a custom type named `address[]` as a struct (signer schema first)', () => {
    const data = build(
      'Mail',
      {
        Mail: [{ name: 'wrapper', type: 'address[]' }],
        'address[]': [{ name: 'to', type: 'address' }],
      },
      { wrapper: { to: ADDR_A } },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A]);
  });

  it('extracts an arbitrarily-named address field in an unknown schema', () => {
    const data = build(
      'Weird',
      {
        Weird: [
          { name: 'maker', type: 'address' },
          { name: 'superSecretSink', type: 'address' },
        ],
      },
      { maker: SIGNER, superSecretSink: ADDR_A },
    );
    expect(addressesOf(data, { exclude: [SIGNER] })).toStrictEqual([ADDR_A]);
  });

  it('ignores non-address typed fields even if the value looks like an address', () => {
    const data = build(
      'T',
      {
        T: [
          { name: 'owner', type: 'address' },
          { name: 'notAnAddress', type: 'uint256' },
          { name: 'blob', type: 'bytes32' },
        ],
      },
      // notAnAddress carries an address-shaped string but is typed uint256.
      { owner: ADDR_A, notAnAddress: ADDR_B, blob: `0x${'ab'.repeat(32)}` },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A]);
  });

  it('canonicalizes to lower case and de-duplicates case-insensitively', () => {
    const lower = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const upper = '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD';
    const data = build(
      'Two',
      {
        Two: [
          { name: 'to', type: 'address' },
          { name: 'recipient', type: 'address' },
        ],
      },
      { to: lower, recipient: upper },
    );
    expect(addressesOf(data)).toStrictEqual([lower]);
  });

  it('excludes the zero address and provided addresses', () => {
    const data = build(
      'Three',
      {
        Three: [
          { name: 'a', type: 'address' },
          { name: 'b', type: 'address' },
          { name: 'c', type: 'address' },
        ],
      },
      { a: ZERO, b: SIGNER, c: ADDR_A },
    );
    expect(addressesOf(data, { exclude: [SIGNER] })).toStrictEqual([ADDR_A]);
  });

  it('ignores non-address-like entries in the exclude list', () => {
    const data = build(
      'X',
      { X: [{ name: 'a', type: 'address' }] },
      { a: ADDR_A },
    );
    // A garbage exclude value normalizes to undefined and is skipped, so the
    // real address is still returned.
    expect(addressesOf(data, { exclude: ['not-an-address'] })).toStrictEqual([
      ADDR_A,
    ]);
  });

  it('honors excludeFields (e.g. spender handled elsewhere)', () => {
    const data = build(
      'Permit',
      {
        Permit: [
          { name: 'spender', type: 'address' },
          { name: 'to', type: 'address' },
        ],
      },
      { spender: ADDR_A, to: ADDR_B },
    );
    expect(addressesOf(data, { excludeFields: ['spender'] })).toStrictEqual([
      ADDR_B,
    ]);
  });

  it('matches excludeFields exactly (does not collect-skip `Spender` for `spender`)', () => {
    const data = build(
      'Permit',
      {
        Permit: [
          { name: 'Spender', type: 'address' },
          { name: 'to', type: 'address' },
        ],
      },
      { Spender: ADDR_A, to: ADDR_B },
    );
    expect(addressesOf(data, { excludeFields: ['spender'] })).toStrictEqual([
      ADDR_A,
      ADDR_B,
    ]);
  });

  it('only excludes fields at the top level', () => {
    const data = build(
      'Order',
      {
        Order: [
          { name: 'spender', type: 'address' },
          { name: 'inner', type: 'Inner' },
        ],
        Inner: [{ name: 'spender', type: 'address' }],
      },
      { spender: ADDR_A, inner: { spender: ADDR_B } },
    );
    expect(addressesOf(data, { excludeFields: ['spender'] })).toStrictEqual([
      ADDR_B,
    ]);
  });

  it('skips malformed schema fields', () => {
    const data = build(
      'T',
      {
        T: [
          // Malformed entries the walker must skip without throwing.
          null as unknown as { name: string; type: string },
          { name: 123 as unknown as string, type: 'address' },
          { name: 'to', type: 456 as unknown as string },
          { name: 'good', type: 'address' },
        ],
      },
      { to: ADDR_A, good: ADDR_B },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_B]);
  });

  it('normalizes decimal and non-canonical hex address encodings', () => {
    const data = build(
      'Batch',
      {
        Batch: [
          { name: 'a', type: 'address' },
          { name: 'b', type: 'address' },
        ],
      },
      { a: BigInt(ADDR_A).toString(10), b: '0x1' },
    );
    expect(addressesOf(data)).toStrictEqual([
      ADDR_A,
      '0x0000000000000000000000000000000000000001',
    ]);
  });

  it('normalizes a whitespace-padded address value', () => {
    const data = build(
      'X',
      { X: [{ name: 'a', type: 'address' }] },
      { a: `  ${ADDR_A}  ` },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A]);
  });

  it('normalizes a non-negative integer number value', () => {
    const data = build('X', { X: [{ name: 'a', type: 'address' }] }, { a: 1 });
    expect(addressesOf(data)).toStrictEqual([
      '0x0000000000000000000000000000000000000001',
    ]);
  });

  it('ignores non-address-like values (negative, float, object, null)', () => {
    const data = build(
      'X',
      {
        X: [
          { name: 'a', type: 'address' },
          { name: 'b', type: 'address' },
          { name: 'c', type: 'address' },
          { name: 'd', type: 'address' },
          { name: 'e', type: 'address' },
        ],
      },
      { a: -1, b: 1.5, c: {}, d: null, e: ADDR_A },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A]);
  });

  it('canonicalizes mixed-case addresses to lower case', () => {
    const mixed = '0xAbCdEf0000000000000000000000000000000001';
    const data = build(
      'X',
      { X: [{ name: 'a', type: 'address' }] },
      { a: mixed },
    );
    expect(addressesOf(data)).toStrictEqual([mixed.toLowerCase()]);
  });

  it('takes the leading 20 bytes of an oversized decimal address (ADDR_A * 256 + 0x42)', () => {
    // The signer encodes an address as big-endian bytes and keeps the high /
    // first 20 bytes, so a trailing extra byte is dropped.
    const oversized = (BigInt(ADDR_A) * 256n + 0x42n).toString(10);
    const data = build(
      'X',
      { X: [{ name: 'a', type: 'address' }] },
      { a: oversized },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A]);
  });

  it('takes the leading 20 bytes of an oversized hex address', () => {
    const oversizedHex = `0x${ADDR_A.slice(2)}42`;
    const data = build(
      'X',
      { X: [{ name: 'a', type: 'address' }] },
      { a: oversizedHex },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A]);
  });

  it('agrees with eth-sig-util encodeData / eip712Hash on leading-20-byte addresses', () => {
    const types = {
      EIP712Domain: DOMAIN_TYPE,
      Mail: [{ name: 'to', type: 'address' }],
    };
    const domain = {
      name: 't',
      version: '1',
      chainId: 1,
      verifyingContract: ADDR_C,
    };
    const oversized = (BigInt(ADDR_A) * 256n + 0x42n).toString(10);
    const canonical = build('Mail', { Mail: types.Mail }, { to: ADDR_A });
    const shifted = build('Mail', { Mail: types.Mail }, { to: oversized });

    expect(
      TypedDataUtils.encodeData(
        'Mail',
        { to: oversized },
        types,
        SignTypedDataVersion.V4,
      ),
    ).toStrictEqual(
      TypedDataUtils.encodeData(
        'Mail',
        { to: ADDR_A },
        types,
        SignTypedDataVersion.V4,
      ),
    );
    expect(
      TypedDataUtils.eip712Hash(
        { types, primaryType: 'Mail', domain, message: { to: oversized } },
        SignTypedDataVersion.V4,
      ),
    ).toStrictEqual(
      TypedDataUtils.eip712Hash(
        { types, primaryType: 'Mail', domain, message: { to: ADDR_A } },
        SignTypedDataVersion.V4,
      ),
    );
    expect(addressesOf(shifted)).toStrictEqual([ADDR_A]);
    expect(addressesOf(canonical)).toStrictEqual([ADDR_A]);
  });

  it('agrees with eth-sig-util on odd-length 0x-hex (isStrictHexString is true)', () => {
    // Odd-length 0x-hex is still isStrictHexString in @metamask/utils, so the
    // signer hexToBytes-pads the nibble and takes 20 bytes — same as we do.
    // It does not fall through to reallyStrangeAddressToBytes.
    const types = {
      EIP712Domain: DOMAIN_TYPE,
      Mail: [{ name: 'to', type: 'address' }],
    };
    const oddShort = '0x1';
    const oddPadded = '0x0111111111111111111111111111111111111111';
    const odd39 = `0x${'1'.repeat(39)}`;

    expect(
      TypedDataUtils.encodeData(
        'Mail',
        { to: oddShort },
        types,
        SignTypedDataVersion.V4,
      ),
    ).toStrictEqual(
      TypedDataUtils.encodeData(
        'Mail',
        { to: '0x0000000000000000000000000000000000000001' },
        types,
        SignTypedDataVersion.V4,
      ),
    );
    expect(
      addressesOf(build('Mail', { Mail: types.Mail }, { to: oddShort })),
    ).toStrictEqual(['0x0000000000000000000000000000000000000001']);

    expect(
      TypedDataUtils.encodeData(
        'Mail',
        { to: odd39 },
        types,
        SignTypedDataVersion.V4,
      ),
    ).toStrictEqual(
      TypedDataUtils.encodeData(
        'Mail',
        { to: oddPadded },
        types,
        SignTypedDataVersion.V4,
      ),
    );
    expect(
      addressesOf(build('Mail', { Mail: types.Mail }, { to: odd39 })),
    ).toStrictEqual([oddPadded]);
  });

  it('does not treat oversized 0x-hex as a signable address (encoder rejects 21 bytes)', () => {
    const types = {
      EIP712Domain: DOMAIN_TYPE,
      Mail: [{ name: 'to', type: 'address' }],
    };
    const oversizedHex = `0x${ADDR_A.slice(2)}42`;

    expect(() =>
      TypedDataUtils.encodeData(
        'Mail',
        { to: oversizedHex },
        types,
        SignTypedDataVersion.V4,
      ),
    ).toThrow(/21 bytes/u);

    // We still collect the leading 20 bytes. That is an extra scan of a value
    // that cannot be signed, not a signed-but-unscanned address.
    expect(
      addressesOf(build('Mail', { Mail: types.Mail }, { to: oversizedHex })),
    ).toStrictEqual([ADDR_A]);
  });

  it('bounds traversal work for a very large array', () => {
    const huge = Array.from({ length: 100000 }, () => ADDR_A);
    const data = build(
      'Batch',
      { Batch: [{ name: 'recipients', type: 'address[]' }] },
      { recipients: huge },
    );
    // Returns the distinct address without walking every element.
    expect(addressesOf(data)).toStrictEqual([ADDR_A]);
  });

  it('does not flag overflow at exactly the cap', () => {
    const data = build(
      'Airdrop',
      { Airdrop: [{ name: 'recipients', type: 'address[]' }] },
      { recipients: nAddresses(10) },
    );
    const result = extractSignatureAddresses(data);
    expect(result.addresses).toHaveLength(10);
    expect(result.overflow).toBe(false);
  });

  it('caps returned addresses and flags overflow past the cap', () => {
    const data = build(
      'Airdrop',
      { Airdrop: [{ name: 'recipients', type: 'address[]' }] },
      { recipients: nAddresses(15) },
    );
    const result = extractSignatureAddresses(data);
    expect(result.addresses).toHaveLength(DEFAULT_MAX_SIGNATURE_ADDRESSES);
    expect(result.overflow).toBe(true);
    expect(result.maxAddresses).toBe(DEFAULT_MAX_SIGNATURE_ADDRESSES);
  });

  describe('maxAddresses', () => {
    const permitBatch = (tokenCount: number): TypedDataFixture =>
      build(
        'PermitBatch',
        {
          PermitBatch: [
            { name: 'details', type: 'PermitDetails[]' },
            { name: 'spender', type: 'address' },
            { name: 'sigDeadline', type: 'uint256' },
          ],
          PermitDetails: [
            { name: 'token', type: 'address' },
            { name: 'amount', type: 'uint160' },
          ],
        },
        {
          details: nAddresses(tokenCount).map((token) => ({
            token,
            amount: '1',
          })),
          spender: ADDR_D,
          sigDeadline: '1',
        },
      );

    it('honors a caller override below the ceiling', () => {
      const data = build(
        'Airdrop',
        { Airdrop: [{ name: 'recipients', type: 'address[]' }] },
        { recipients: nAddresses(20) },
      );
      const result = extractSignatureAddresses(data, { maxAddresses: 20 });
      expect(result.addresses).toHaveLength(20);
      expect(result.overflow).toBe(false);
      expect(result.maxAddresses).toBe(20);
    });

    it('clamps an override above the ceiling', () => {
      const data = build(
        'Airdrop',
        { Airdrop: [{ name: 'recipients', type: 'address[]' }] },
        { recipients: nAddresses(MAX_SIGNATURE_ADDRESSES_CEILING + 5) },
      );
      const result = extractSignatureAddresses(data, { maxAddresses: 100 });
      expect(result.addresses).toHaveLength(MAX_SIGNATURE_ADDRESSES_CEILING);
      expect(result.overflow).toBe(true);
      expect(result.maxAddresses).toBe(MAX_SIGNATURE_ADDRESSES_CEILING);
    });

    it('uses the default for non-finite or sub-one values', () => {
      const data = build(
        'Airdrop',
        { Airdrop: [{ name: 'recipients', type: 'address[]' }] },
        { recipients: nAddresses(15) },
      );
      for (const maxAddresses of [
        NaN,
        Infinity,
        -1,
        0,
        0.4,
        '20' as unknown as number,
      ]) {
        const result = extractSignatureAddresses(data, { maxAddresses });
        expect(result.addresses).toHaveLength(DEFAULT_MAX_SIGNATURE_ADDRESSES);
        expect(result.overflow).toBe(true);
        expect(result.maxAddresses).toBe(DEFAULT_MAX_SIGNATURE_ADDRESSES);
      }
    });

    it('floors a fractional override', () => {
      const data = build(
        'Airdrop',
        { Airdrop: [{ name: 'recipients', type: 'address[]' }] },
        { recipients: nAddresses(15) },
      );
      const result = extractSignatureAddresses(data, { maxAddresses: 12.9 });
      expect(result.addresses).toHaveLength(12);
      expect(result.overflow).toBe(true);
      expect(result.maxAddresses).toBe(12);
    });

    it('does not overflow a 10-token PermitBatch when spender is excluded', () => {
      const result = extractSignatureAddresses(permitBatch(10), {
        excludeFields: ['spender'],
      });
      expect(result.addresses).toHaveLength(10);
      expect(result.overflow).toBe(false);
    });

    it('overflows an 11-token PermitBatch when spender is excluded', () => {
      const result = extractSignatureAddresses(permitBatch(11), {
        excludeFields: ['spender'],
      });
      expect(result.addresses).toHaveLength(10);
      expect(result.overflow).toBe(true);
    });

    it('overflows a 10-token PermitBatch when spender is not excluded', () => {
      const result = extractSignatureAddresses(permitBatch(10));
      expect(result.addresses).toHaveLength(10);
      expect(result.overflow).toBe(true);
    });

    it('returns the resolved cap for an unwalkable payload', () => {
      expect(
        extractSignatureAddresses(null, { maxAddresses: 25 }),
      ).toStrictEqual({
        addresses: [],
        fields: {},
        overflow: false,
        maxAddresses: 25,
      });
    });
  });

  it('flags overflow when the work budget truncates the walk', () => {
    // A long run of non-address nodes ahead of a trailing address exhausts the
    // node budget, so the address is never reached.
    const pad = Array.from({ length: 6000 }, (_, i) => i);
    const data = build(
      'Batch',
      {
        Batch: [
          { name: 'pad', type: 'uint256[]' },
          { name: 'evil', type: 'address' },
        ],
      },
      { pad, evil: ADDR_A },
    );
    const result = extractSignatureAddresses(data);
    expect(result.addresses).toStrictEqual([]);
    expect(result.overflow).toBe(true);
  });

  it('flags overflow when nesting exceeds the depth limit', () => {
    const depth = 14;
    const types: Record<string, { name: string; type: string }[]> = {};
    for (let i = 0; i < depth; i++) {
      types[`L${i}`] = [
        i < depth - 1
          ? { name: 'next', type: `L${i + 1}` }
          : { name: 'addr', type: 'address' },
      ];
    }
    let message: Record<string, unknown> = { addr: ADDR_A };
    for (let i = depth - 2; i >= 0; i--) {
      message = { next: message };
    }
    const result = extractSignatureAddresses(build('L0', types, message));
    expect(result.addresses).toStrictEqual([]);
    expect(result.overflow).toBe(true);
  });

  it('reports the field name each address was found under', () => {
    const data = build(
      'T',
      {
        T: [
          { name: 'to', type: 'address' },
          { name: 'spender', type: 'address' },
        ],
      },
      { to: ADDR_A, spender: ADDR_B },
    );
    expect(extractSignatureAddresses(data).fields).toStrictEqual({
      [ADDR_A]: 'to',
      [ADDR_B]: 'spender',
    });
  });

  it('returns the full result shape with defaults for a benign payload', () => {
    const data = build(
      'T',
      { T: [{ name: 'to', type: 'address' }] },
      { to: ADDR_A },
    );
    expect(extractSignatureAddresses(data)).toStrictEqual({
      addresses: [ADDR_A],
      fields: { [ADDR_A]: 'to' },
      overflow: false,
      maxAddresses: DEFAULT_MAX_SIGNATURE_ADDRESSES,
    });
  });

  it('flags overflow when an address-bearing struct field value is not an object', () => {
    const data = build(
      'Order',
      {
        Order: [
          { name: 'inner', type: 'Inner' },
          { name: 'to', type: 'address' },
        ],
        Inner: [{ name: 'addr', type: 'address' }],
      },
      { inner: 'not-an-object', to: ADDR_A },
    );
    expect(addressesOf(data)).toStrictEqual([ADDR_A]);
    expect(extractSignatureAddresses(data).overflow).toBe(true);
  });

  it('does not flag overflow for a cyclic non-address struct whose value is not an object', () => {
    const data = build(
      'Order',
      {
        Order: [
          { name: 'inner', type: 'Loop' },
          { name: 'to', type: 'address' },
        ],
        Loop: [{ name: 'next', type: 'Loop' }],
      },
      { inner: 'not-an-object', to: ADDR_A },
    );
    const result = extractSignatureAddresses(data);
    expect(result.addresses).toStrictEqual([ADDR_A]);
    expect(result.overflow).toBe(false);
  });

  it('does not flag overflow when a non-address struct value is not an object', () => {
    const data = build(
      'Order',
      {
        Order: [
          { name: 'inner', type: 'Inner' },
          { name: 'to', type: 'address' },
        ],
        Inner: [{ name: 'amount', type: 'uint256' }],
      },
      { inner: 'not-an-object', to: ADDR_A },
    );
    const result = extractSignatureAddresses(data);
    expect(result.addresses).toStrictEqual([ADDR_A]);
    expect(result.overflow).toBe(false);
  });

  it('returns [] for nullish payloads, missing types, or unknown primaryType', () => {
    expect(addressesOf(undefined)).toStrictEqual([]);
    expect(addressesOf(null)).toStrictEqual([]);
    expect(
      addressesOf({ primaryType: 'X', message: { to: ADDR_A } }),
    ).toStrictEqual([]);
    expect(
      addressesOf({
        types: { Y: [{ name: 'to', type: 'address' }] },
        primaryType: 'X',
        message: { to: ADDR_A },
      }),
    ).toStrictEqual([]);
    // primaryType present, types present, but message missing/invalid.
    expect(
      addressesOf({
        types: { X: [{ name: 'to', type: 'address' }] },
        primaryType: 'X',
        message: null,
      }),
    ).toStrictEqual([]);
  });
});
