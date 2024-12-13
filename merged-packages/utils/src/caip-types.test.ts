import {
  CAIP_ACCOUNT_ADDRESS_FIXTURES,
  CAIP_ACCOUNT_ID_FIXTURES,
  CAIP_ASSET_ID_FIXTURES,
  CAIP_ASSET_NAMESPACE_FIXTURES,
  CAIP_ASSET_REFERENCE_FIXTURES,
  CAIP_ASSET_TYPE_FIXTURES,
  CAIP_CHAIN_ID_FIXTURES,
  CAIP_NAMESPACE_FIXTURES,
  CAIP_REFERENCE_FIXTURES,
} from './__fixtures__';
import {
  CAIP_ACCOUNT_ADDRESS_REGEX,
  CAIP_ASSET_NAMESPACE_REGEX,
  CAIP_ASSET_REFERENCE_REGEX,
  CAIP_NAMESPACE_REGEX,
  CAIP_REFERENCE_REGEX,
  CAIP_TOKEN_ID_REGEX,
  isCaipAccountAddress,
  isCaipAccountId,
  isCaipAssetId,
  isCaipAssetNamespace,
  isCaipAssetReference,
  isCaipAssetType,
  isCaipChainId,
  isCaipNamespace,
  isCaipReference,
  KnownCaipNamespace,
  parseCaipAccountId,
  parseCaipAssetId,
  parseCaipAssetType,
  parseCaipChainId,
  toCaipAccountId,
  toCaipAssetId,
  toCaipAssetType,
  toCaipChainId,
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

describe('isCaipAssetNamespace', () => {
  it.each([...CAIP_ASSET_NAMESPACE_FIXTURES])(
    'returns true for a valid asset namespace %s',
    (assetNamespace) => {
      expect(isCaipAssetNamespace(assetNamespace)).toBe(true);
    },
  );

  it.each([true, false, null, undefined, 1, {}, [], 'abC', '12', '123456789'])(
    'returns false for an invalid asset namespace %s',
    (assetNamespace) => {
      expect(isCaipAssetNamespace(assetNamespace)).toBe(false);
    },
  );
});

describe('isCaipAssetReference', () => {
  it.each([...CAIP_ASSET_REFERENCE_FIXTURES])(
    'returns true for a valid asset reference %s',
    (assetReference) => {
      expect(isCaipAssetReference(assetReference)).toBe(true);
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
  ])('returns false for an invalid asset reference %s', (assetReference) => {
    expect(isCaipAssetReference(assetReference)).toBe(false);
  });
});

describe('isCaipAssetType', () => {
  it.each([...CAIP_ASSET_TYPE_FIXTURES])(
    'returns true for a valid asset type %s',
    (assetType) => {
      expect(isCaipAssetType(assetType)).toBe(true);
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
  it.each([...CAIP_ASSET_ID_FIXTURES])(
    'returns true for a valid asset id %s',
    (id) => {
      expect(isCaipAssetId(id)).toBe(true);
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

describe('parseCaipAssetType', () => {
  it('parses valid asset types', () => {
    expect(parseCaipAssetType('eip155:1/slip44:60')).toMatchInlineSnapshot(`
      {
        "assetNamespace": "slip44",
        "assetReference": "60",
        "chain": {
          "namespace": "eip155",
          "reference": "1",
        },
        "chainId": "eip155:1",
      }
    `);

    expect(
      parseCaipAssetType('bip122:000000000019d6689c085ae165831e93/slip44:0'),
    ).toMatchInlineSnapshot(`
      {
        "assetNamespace": "slip44",
        "assetReference": "0",
        "chain": {
          "namespace": "bip122",
          "reference": "000000000019d6689c085ae165831e93",
        },
        "chainId": "bip122:000000000019d6689c085ae165831e93",
      }
    `);

    expect(parseCaipAssetType('cosmos:cosmoshub-3/slip44:118'))
      .toMatchInlineSnapshot(`
      {
        "assetNamespace": "slip44",
        "assetReference": "118",
        "chain": {
          "namespace": "cosmos",
          "reference": "cosmoshub-3",
        },
        "chainId": "cosmos:cosmoshub-3",
      }
    `);

    expect(
      parseCaipAssetType(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/nft:Fz6LxeUg5qjesYX3BdmtTwyyzBtMxk644XiTqU5W3w9w',
      ),
    ).toMatchInlineSnapshot(`
      {
        "assetNamespace": "nft",
        "assetReference": "Fz6LxeUg5qjesYX3BdmtTwyyzBtMxk644XiTqU5W3w9w",
        "chain": {
          "namespace": "solana",
          "reference": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        },
        "chainId": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
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
    expect(() => parseCaipAssetType(input as any)).toThrow(
      'Invalid CAIP asset type.',
    );
  });
});

describe('parseCaipAssetId', () => {
  it('parses valid asset ids', () => {
    expect(
      parseCaipAssetId(
        'eip155:1/erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d/771769',
      ),
    ).toMatchInlineSnapshot(`
      {
        "assetNamespace": "erc721",
        "assetReference": "0x06012c8cf97BEaD5deAe237070F9587f8E7A266d",
        "chain": {
          "namespace": "eip155",
          "reference": "1",
        },
        "chainId": "eip155:1",
        "tokenId": "771769",
      }
    `);

    expect(parseCaipAssetId('hedera:mainnet/nft:0.0.55492/12'))
      .toMatchInlineSnapshot(`
      {
        "assetNamespace": "nft",
        "assetReference": "0.0.55492",
        "chain": {
          "namespace": "hedera",
          "reference": "mainnet",
        },
        "chainId": "hedera:mainnet",
        "tokenId": "12",
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
    expect(() => parseCaipAssetId(input as any)).toThrow(
      'Invalid CAIP asset ID.',
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

describe('toCaipAccountId', () => {
  it('returns a valid CAIP-10 account ID when given a valid namespace, reference, and accountAddress', () => {
    const namespace = 'eip';
    const reference = '1';
    const accountAddress = '0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb';
    expect(toCaipAccountId(namespace, reference, accountAddress)).toBe(
      `${namespace}:${reference}:${accountAddress}`,
    );
  });

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
    const accountAddress = '0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb';
    expect(() => toCaipAccountId(namespace, reference, accountAddress)).toThrow(
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
    const namespace = 'eip';
    const accountAddress = '0xab16a96D359eC26a11e2C2b3d8f8B8942d5Bfcdb';
    expect(() => toCaipAccountId(namespace, reference, accountAddress)).toThrow(
      `Invalid "reference", must match: ${CAIP_REFERENCE_REGEX.toString()}`,
    );
  });

  it.each([
    // Too short, must have 1 char at least
    '',
    // Not matching
    '!@#$%^&*()',
    // Too long
    Array(129).fill('0').join(''),
  ])('throws for invalid accountAddress: %s', (accountAddress) => {
    const namespace = 'eip';
    const reference = '1';
    expect(() => toCaipAccountId(namespace, reference, accountAddress)).toThrow(
      `Invalid "accountAddress", must match: ${CAIP_ACCOUNT_ADDRESS_REGEX.toString()}`,
    );
  });
});

describe('toCaipAssetType', () => {
  it('returns a valid CAIP-19 asset type when given a valid namespace, reference, assetNamespace, and assetReference', () => {
    const namespace = 'eip';
    const reference = '1';
    const assetNamespace = 'erc20';
    const assetReference = '0x6b175474e89094c44da98b954eedeac495271d0f';
    expect(
      toCaipAssetType(namespace, reference, assetNamespace, assetReference),
    ).toBe(`${namespace}:${reference}/${assetNamespace}:${assetReference}`);
  });

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
    const assetNamespace = 'erc20';
    const assetReference = '0x6b175474e89094c44da98b954eedeac495271d0f';
    expect(() =>
      toCaipAssetType(namespace, reference, assetNamespace, assetReference),
    ).toThrow(
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
    const namespace = 'eip';
    const assetNamespace = 'erc20';
    const assetReference = '0x6b175474e89094c44da98b954eedeac495271d0f';
    expect(() =>
      toCaipAssetType(namespace, reference, assetNamespace, assetReference),
    ).toThrow(
      `Invalid "reference", must match: ${CAIP_REFERENCE_REGEX.toString()}`,
    );
  });

  it.each([
    // Too short, must have 1 char at least
    '',
    // Not matching
    '!@#$%^&*',
    // Too long
    '012345789',
  ])('throws for invalid assetNamespace: %s', (assetNamespace) => {
    const namespace = 'eip';
    const reference = '1';
    const assetReference = '0x6b175474e89094c44da98b954eedeac495271d0f';
    expect(() =>
      toCaipAssetType(namespace, reference, assetNamespace, assetReference),
    ).toThrow(
      `Invalid "assetNamespace", must match: ${CAIP_ASSET_NAMESPACE_REGEX.toString()}`,
    );
  });

  it.each([
    // Too short, must have 1 char at least
    '',
    // Not matching
    '!@#$%^&*()',
    // Too long
    Array(129).fill('0').join(''),
  ])('throws for invalid assetReference: %s', (assetReference) => {
    const namespace = 'eip';
    const reference = '1';
    const assetNamespace = 'erc20';
    expect(() =>
      toCaipAssetType(namespace, reference, assetNamespace, assetReference),
    ).toThrow(
      `Invalid "assetReference", must match: ${CAIP_ASSET_REFERENCE_REGEX.toString()}`,
    );
  });
});

describe('toCaipAssetId', () => {
  it('returns a valid CAIP-19 asset ID when given a valid namespace, reference, assetNamespace, assetReference, and tokenId', () => {
    const namespace = 'eip';
    const reference = '1';
    const assetNamespace = 'erc721';
    const assetReference = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';
    const tokenId = '771769';
    expect(
      toCaipAssetId(
        namespace,
        reference,
        assetNamespace,
        assetReference,
        tokenId,
      ),
    ).toBe(
      `${namespace}:${reference}/${assetNamespace}:${assetReference}/${tokenId}`,
    );
  });

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
    const assetNamespace = 'erc721';
    const assetReference = '0x6b175474e89094c44da98b954eedeac495271d0f';
    const tokenId = '123';
    expect(() =>
      toCaipAssetId(
        namespace,
        reference,
        assetNamespace,
        assetReference,
        tokenId,
      ),
    ).toThrow(
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
    const namespace = 'eip';
    const assetNamespace = 'erc721';
    const assetReference = '0x6b175474e89094c44da98b954eedeac495271d0f';
    const tokenId = '123';
    expect(() =>
      toCaipAssetId(
        namespace,
        reference,
        assetNamespace,
        assetReference,
        tokenId,
      ),
    ).toThrow(
      `Invalid "reference", must match: ${CAIP_REFERENCE_REGEX.toString()}`,
    );
  });

  it.each([
    // Too short, must have 1 char at least
    '',
    // Not matching
    '!@#$%^&*',
    // Too long
    '012345789',
  ])('throws for invalid assetNamespace: %s', (assetNamespace) => {
    const namespace = 'eip';
    const reference = '1';
    const assetReference = '0x6b175474e89094c44da98b954eedeac495271d0f';
    const tokenId = '123';
    expect(() =>
      toCaipAssetId(
        namespace,
        reference,
        assetNamespace,
        assetReference,
        tokenId,
      ),
    ).toThrow(
      `Invalid "assetNamespace", must match: ${CAIP_ASSET_NAMESPACE_REGEX.toString()}`,
    );
  });

  it.each([
    // Too short, must have 1 char at least
    '',
    // Not matching
    '!@#$%^&*()',
    // Too long
    Array(129).fill('0').join(''),
  ])('throws for invalid assetReference: %s', (assetReference) => {
    const namespace = 'eip';
    const reference = '1';
    const assetNamespace = 'erc721';
    const tokenId = '123';
    expect(() =>
      toCaipAssetId(
        namespace,
        reference,
        assetNamespace,
        assetReference,
        tokenId,
      ),
    ).toThrow(
      `Invalid "assetReference", must match: ${CAIP_ASSET_REFERENCE_REGEX.toString()}`,
    );
  });

  it.each([
    // Too short, must have 1 char at least
    '',
    // Not matching
    '!@#$%^&*()',
    // Too long
    Array(79).fill('0').join(''),
  ])('throws for invalid tokenId: %s', (tokenId) => {
    const namespace = 'eip';
    const reference = '1';
    const assetNamespace = 'erc721';
    const assetReference = '0x06012c8cf97BEaD5deAe237070F9587f8E7A266d';
    expect(() =>
      toCaipAssetId(
        namespace,
        reference,
        assetNamespace,
        assetReference,
        tokenId,
      ),
    ).toThrow(
      `Invalid "tokenId", must match: ${CAIP_TOKEN_ID_REGEX.toString()}`,
    );
  });
});
