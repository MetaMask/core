import {
  CAIP_ACCOUNT_ADDRESS_FIXTURES,
  CAIP_ACCOUNT_ID_FIXTURES,
  CAIP_CHAIN_ID_FIXTURES,
  CAIP_NAMESPACE_FIXTURES,
  CAIP_REFERENCE_FIXTURES,
} from './__fixtures__';
import {
  isCaipAccountAddress,
  isCaipAccountId,
  isCaipChainId,
  isCaipNamespace,
  isCaipReference,
  isCaipAssetType,
  isCaipAssetId,
  parseCaipAccountId,
  parseCaipChainId,
  toCaipChainId,
  KnownCaipNamespace,
  CAIP_NAMESPACE_REGEX,
  CAIP_REFERENCE_REGEX,
} from './caip-types';

describe('isCaipChainId', () => {
  it.each(CAIP_CHAIN_ID_FIXTURES)(
    'returns true for a valid chain id %s',
    (id) => {
      expect(isCaipChainId(id)).toBe(true);
    },
  );

  it.each([
    true,
    false,
    null,
    undefined,
    1,
    {},
    [],
    '!@#$%^&*()',
    'a',
    ':1',
    '123:',
    'abC:1',
    'eip155',
    'eip155:',
    'eip155:1:2',
    'bip122',
    'bip122:',
    'bip122:000000000019d6689c085ae165831e93:2',
  ])('returns false for an invalid chain id %s', (id) => {
    expect(isCaipChainId(id)).toBe(false);
  });
});

describe('isCaipNamespace', () => {
  it.each([...CAIP_NAMESPACE_FIXTURES])(
    'returns true for a valid namespace %s',
    (id) => {
      expect(isCaipNamespace(id)).toBe(true);
    },
  );

  it.each([true, false, null, undefined, 1, {}, [], 'abC', '12', '123456789'])(
    'returns false for an invalid namespace %s',
    (id) => {
      expect(isCaipNamespace(id)).toBe(false);
    },
  );
});

describe('isCaipReference', () => {
  it.each([...CAIP_REFERENCE_FIXTURES])(
    'returns true for a valid reference %s',
    (id) => {
      expect(isCaipReference(id)).toBe(true);
    },
  );

  it.each([
    true,
    false,
    null,
    undefined,
    1,
    {},
    [],
    '',
    '!@#$%^&*()',
    Array(33).fill('0').join(''),
  ])('returns false for an invalid reference %s', (id) => {
    expect(isCaipReference(id)).toBe(false);
  });
});

describe('isCaipAccountId', () => {
  it.each([...CAIP_ACCOUNT_ID_FIXTURES])(
    'returns true for a valid account id %s',
    (id) => {
      expect(isCaipAccountId(id)).toBe(true);
    },
  );

  it.each([
    true,
    false,
    null,
    undefined,
    1,
    {},
    [],
    '',
    '!@#$%^&*()',
    'foo',
    'eip155',
    'eip155:',
    'eip155:1',
    'eip155:1:',
    'eip155:1:0x0000000000000000000000000000000000000000:2',
    'bip122',
    'bip122:',
    'bip122:000000000019d6689c085ae165831e93',
    'bip122:000000000019d6689c085ae165831e93:',
    'bip122:000000000019d6689c085ae165831e93:0x0000000000000000000000000000000000000000:2',
  ])('returns false for an invalid account id %s', (id) => {
    expect(isCaipAccountId(id)).toBe(false);
  });
});

describe('isCaipAccountAddress', () => {
  it.each([...CAIP_ACCOUNT_ADDRESS_FIXTURES])(
    'returns true for a valid account address %s',
    (id) => {
      expect(isCaipAccountAddress(id)).toBe(true);
    },
  );

  it.each([
    true,
    false,
    null,
    undefined,
    1,
    {},
    [],
    '',
    '!@#$%^&*()',
    Array(129).fill('0').join(''),
  ])('returns false for an invalid account address %s', (id) => {
    expect(isCaipAccountAddress(id)).toBe(false);
  });
});

describe('isCaipAssetType', () => {
  // Imported from: https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-19.md#test-cases
  it.each([
    'eip155:1/slip44:60',
    'bip122:000000000019d6689c085ae165831e93/slip44:0',
    'cosmos:cosmoshub-3/slip44:118',
    'bip122:12a765e31ffd4059bada1e25190f6e98/slip44:2',
    'cosmos:Binance-Chain-Tigris/slip44:714',
    'cosmos:iov-mainnet/slip44:234',
    'lip9:9ee11e9df416b18b/slip44:134',
    'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
    'eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d',
  ])('returns true for a valid asset type %s', (id) => {
    expect(isCaipAssetType(id)).toBe(true);
  });

  it.each([
    true,
    false,
    null,
    undefined,
    1,
    {},
    [],
    '',
    '!@#$%^&*()',
    'foo',
    'eip155',
    'eip155:',
    'eip155:1',
    'eip155:1:',
    'eip155:1:0x0000000000000000000000000000000000000000:2',
    'bip122',
    'bip122:',
    'bip122:000000000019d6689c085ae165831e93',
    'bip122:000000000019d6689c085ae165831e93/',
    'bip122:000000000019d6689c085ae165831e93/tooooooolong',
    'bip122:000000000019d6689c085ae165831e93/tooooooolong:asset',
    'eip155:1/erc721',
    'eip155:1/erc721:',
    'eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/',
  ])('returns false for an invalid asset type %s', (id) => {
    expect(isCaipAssetType(id)).toBe(false);
  });
});

describe('isCaipAssetId', () => {
  // Imported from: https://github.com/ChainAgnostic/CAIPs/blob/main/CAIPs/caip-19.md#test-cases
  it.each([
    'eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769',
    'hedera:mainnet/nft:0.0.55492/12',
  ])('returns true for a valid asset id %s', (id) => {
    expect(isCaipAssetId(id)).toBe(true);
  });

  it.each([
    true,
    false,
    null,
    undefined,
    1,
    {},
    [],
    '',
    '!@#$%^&*()',
    'foo',
    'eip155',
    'eip155:',
    'eip155:1',
    'eip155:1:',
    'eip155:1:0x0000000000000000000000000000000000000000:2',
    'bip122',
    'bip122:',
    'bip122:000000000019d6689c085ae165831e93',
    'bip122:000000000019d6689c085ae165831e93/',
    'bip122:000000000019d6689c085ae165831e93/tooooooolong',
    'bip122:000000000019d6689c085ae165831e93/tooooooolong:asset',
    'eip155:1/erc721',
    'eip155:1/erc721:',
    'eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/',
  ])('returns false for an invalid asset id %s', (id) => {
    expect(isCaipAssetType(id)).toBe(false);
  });
});

describe('parseCaipChainId', () => {
  it('parses valid chain ids', () => {
    expect(parseCaipChainId('eip155:1')).toMatchInlineSnapshot(`
      {
        "namespace": "eip155",
        "reference": "1",
      }
    `);

    expect(parseCaipChainId('bip122:000000000019d6689c085ae165831e93'))
      .toMatchInlineSnapshot(`
      {
        "namespace": "bip122",
        "reference": "000000000019d6689c085ae165831e93",
      }
    `);

    expect(parseCaipChainId('cosmos:cosmoshub-3')).toMatchInlineSnapshot(`
      {
        "namespace": "cosmos",
        "reference": "cosmoshub-3",
      }
    `);

    expect(parseCaipChainId('polkadot:b0a8d493285c2df73290dfb7e61f870f'))
      .toMatchInlineSnapshot(`
      {
        "namespace": "polkadot",
        "reference": "b0a8d493285c2df73290dfb7e61f870f",
      }
    `);
  });

  it.each([
    true,
    false,
    null,
    undefined,
    1,
    'foo',
    'foobarbazquz:1',
    'foo:',
    'foo:foobarbazquzfoobarbazquzfoobarbazquzfoobarbazquzfoobarbazquzfoobarbazquz',
  ])('throws for invalid input %s', (input) => {
    expect(() => parseCaipChainId(input as any)).toThrow(
      'Invalid CAIP chain ID.',
    );
  });
});

describe('parseCaipAccountId', () => {
  it('parses valid account ids', () => {
    expect(
      parseCaipAccountId('eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb'),
    ).toMatchInlineSnapshot(`
      {
        "address": "0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb",
        "chain": {
          "namespace": "eip155",
          "reference": "1",
        },
        "chainId": "eip155:1",
      }
    `);

    expect(
      parseCaipAccountId(
        'bip122:000000000019d6689c085ae165831e93:128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6',
      ),
    ).toMatchInlineSnapshot(`
      {
        "address": "128Lkh3S7CkDTBZ8W7BbpsN3YYizJMp8p6",
        "chain": {
          "namespace": "bip122",
          "reference": "000000000019d6689c085ae165831e93",
        },
        "chainId": "bip122:000000000019d6689c085ae165831e93",
      }
    `);

    expect(
      parseCaipAccountId(
        'cosmos:cosmoshub-3:cosmos1t2uflqwqe0fsj0shcfkrvpukewcw40yjj6hdc0',
      ),
    ).toMatchInlineSnapshot(`
      {
        "address": "cosmos1t2uflqwqe0fsj0shcfkrvpukewcw40yjj6hdc0",
        "chain": {
          "namespace": "cosmos",
          "reference": "cosmoshub-3",
        },
        "chainId": "cosmos:cosmoshub-3",
      }
    `);

    expect(
      parseCaipAccountId(
        'polkadot:b0a8d493285c2df73290dfb7e61f870f:5hmuyxw9xdgbpptgypokw4thfyoe3ryenebr381z9iaegmfy',
      ),
    ).toMatchInlineSnapshot(`
      {
        "address": "5hmuyxw9xdgbpptgypokw4thfyoe3ryenebr381z9iaegmfy",
        "chain": {
          "namespace": "polkadot",
          "reference": "b0a8d493285c2df73290dfb7e61f870f",
        },
        "chainId": "polkadot:b0a8d493285c2df73290dfb7e61f870f",
      }
    `);
  });

  it.each([
    true,
    false,
    null,
    undefined,
    1,
    'foo',
    'foobarbazquz:1',
    'foo:',
    'foo:foobarbazquzfoobarbazquzfoobarbazquzfoobarbazquzfoobarbazquzfoobarbazquz',
    'eip155:1',
    'eip155:1:',
  ])('throws for invalid input %s', (input) => {
    expect(() => parseCaipAccountId(input as any)).toThrow(
      'Invalid CAIP account ID.',
    );
  });
});

describe('toCaipChainId', () => {
  // This function relies on @metamask/utils CAIP helpers. Those are being
  // tested with a variety of inputs.
  // Here we mainly focus on our own wrapper around those:

  it('returns a valid CAIP-2 chain ID when given a valid namespace and reference', () => {
    const namespace = 'abc';
    const reference = '1';
    expect(toCaipChainId(namespace, reference)).toBe(
      `${namespace}:${reference}`,
    );
  });

  it.each(Object.values(KnownCaipNamespace))(
    'treats %s as a valid namespace',
    (namespace) => {
      expect(isCaipNamespace(namespace)).toBe(true);
    },
  );

  it.each([
    // Too short, must have 3 chars at least
    '',
    'xs',
    // Not matching
    '!@#$%^&*()',
    // Too long
    'namespacetoolong',
  ])('throws for invalid namespaces: %s', (namespace) => {
    const reference = '1';
    expect(() => toCaipChainId(namespace, reference)).toThrow(
      `Invalid "namespace", must match: ${CAIP_NAMESPACE_REGEX.toString()}`,
    );
  });

  it.each([
    // Too short, must have 1 char at least
    '',
    // Not matching
    '!@#$%^&*()',
    // Too long
    '012345678901234567890123456789012', // 33 chars
  ])('throws for invalid reference: %s', (reference) => {
    const namespace = 'abc';
    expect(() => toCaipChainId(namespace, reference)).toThrow(
      `Invalid "reference", must match: ${CAIP_REFERENCE_REGEX.toString()}`,
    );
  });
});
