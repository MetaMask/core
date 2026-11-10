# @metamask/key-tree

An interface over [SLIP-10], [BIP-32], and [BIP-44] key derivation paths.

This library was audited by Cure53 in February 2023, and April 2024. The audit reports can be found [here](./audits).

## Installation

`yarn add @metamask/key-tree`

or

`npm install @metamask/key-tree`

## Usage

This package is designed to accommodate the creation of keys for any level of a [SLIP-10] or [BIP-44] path.
Recall that a [BIP-44] HD tree path consists of the following nodes (and depths):

> `m / 44' / coin_type' / account' / change / address_index`
>
> `0 / 1 / 2 / 3 / 4 / 5`

Where `m` is the "master" or seed node, `coin_type` indicates the protocol for which deeper keys are intended,
and `address_index` usually furnishes key pairs intended for user addresses / accounts.
For details, refer to the [BIP-44] specification.
For the authoritative list of protocol `coin_type` indices, see [SLIP-44].

The [SLIP-10] interface provides a more generic way for deriving keys, which is not constrained to the [BIP-44] path
nodes. Currently only Secp256k1 and Ed25519 are supported for [SLIP-10], but NIST P-256 may be added if there is
sufficient demand for it.

This package exports a few classes intended to facilitate the creation of keys in contexts with different privileges.
They are used as follows.

```typescript
import { BIP44CoinTypeNode } from '@metamask/key-tree';

// Per SLIP-44, Ethereum has a coin_type of 60.
// Ethereum is only used by way of example.
const coinType = 60;

// Imagine that this takes place in some privileged context with access to
// the user's secret recovery phrase.
const secretRecoveryPhrase = getSecretRecoveryPhrase();

const coinTypeNode = await BIP44CoinTypeNode.fromDerivationPath([
  `bip39:${secretRecoveryPhrase}`,
  `bip32:44'`, // By BIP-44, the "purpose" node must be "44'"
  `bip32:${coinType}'`,
]);

// Imagine that this is some Node.js stream, but it could be anything that
// can transmit JSON messages, such as window.postMessage.
// Alternatively you can use `coinTypeNode.extendedKey` as well.
stream.write(coinTypeNode.toJSON());

//===============================
// Then, on the receiving end...
//===============================

import { getBIP44AddressKeyDeriver } from '@metamask/key-tree';

// Get the node sent from the privileged context.
// It will have the following shape:
//   {
//     privateKey, // A hexadecimal string of the private key
//     publicKey, // A hexadecimal string of the public key
//     chainCode, // A hexadecimal string of the chain code
//     depth, // The number 2, which is the depth of coin_type nodes
//     parentFingerprint, // The fingerprint of the parent node as number
//     index, // The index of the node as number
//     coin_type, // In this case, the number 60
//     path, // For visualization only. In this case: m / 44' / 60'
//   }
const coinTypeNode = await getCoinTypeNode();

// Get an address key deriver for the coin_type node.
// In this case, its path will be: m / 44' / 60' / 0' / 0 / address_index
// Alternatively you can use an extended key (`xprv`) as well.
const addressKeyDeriver = getBIP44AddressKeyDeriver(coinTypeNode);

// These are Uint8Array representations of the extended private keys for
// the respective addresses.

// m / 44' / 60' / 0' / 0 / 0
const addressKey0 = await addressKeyDeriver(0);

// m / 44' / 60' / 0' / 0 / 1
const addressKey1 = await addressKeyDeriver(1);

// m / 44' / 60' / 0' / 0 / 2'
const addressKey2 = await addressKeyDeriver(2, true);

// Now, the extended private keys can be used to derive the corresponding public
// keys and protocol addresses.
```

You can derive SLIP-10 keys as follows.

```typescript
import { SLIP10Node } from '@metamask/key-tree';

// Create a SLIP10Node from a derivation path. You can also specify a key and depth instead.
const node = await SLIP10Node.fromDerivationPath({
  curve: 'secp256k1',
  derivationPath: [`bip39:${secretRecoveryPhrase}`, `slip10:0'`],
});

// SLIP-10 supports Ed25519 as well.
const ed25519Node = await SLIP10Node.fromDerivationPath({
  curve: 'ed25519',
  derivationPath: [`bip39:${secretRecoveryPhrase}`, `slip10:0'`],
});

// Derive the child node at m / 0' / 1' / 2'. This results in a new SLIP10Node.
// Note that you cannot derive unhardened child nodes when using Ed25519.
const childNode = await node.derive([`slip10:1'`, `slip10:2'`]);
```

The `SLIP10Node` class supports both `bip32:` and `slip10:` paths. While [BIP-32] and [SLIP-10] are mostly compatible with
each other, there are some differences:

- Ed25519 is only supported by [SLIP-10], so you must use `slip10:` paths when deriving Ed25519 keys.
- Key derivation errors (i.e., invalid keys being derived) are handled slightly different. While the chance of
  encountering such an error is extremely low, it is possible.

If you require full compatibility with one or the other, you can choose between the `bip32:` and `slip10:` path types.

There are other ways of deriving keys in addition to the above example.
See the docstrings in the [BIP44Node](./src/BIP44Node.ts), [BIP44CoinTypeNode](./src/BIP44CoinTypeNode.ts) and
[SLIP10Node](./src/SLIP10Node.ts) files for details.

### Internals

This package also has methods for deriving arbitrary [SLIP-10] and [BIP-32] keys, and generating seeds from [BIP-39]
secret recovery phrases.
These methods do not constitute a safe key derivation API, and their use is **strongly discouraged**.
Nevertheless, since those methods were the main exports of this package prior to version `3.0.0`, consumers can
still access them by importing `@metamask/key-tree/derivation`.

## Security

This package is rigorously tested against reference implementations and the [SLIP-10] and [BIP-32] specifications.
See the [reference implementation tests](tests/reference-implementations.test.ts) for details.

## Further Reading

- [BIP-32]
- [BIP-39]
- [BIP-44]
- [SLIP-10]
- [SLIP-44]
- Network Working Group: ["Key Derivation Functions and their Uses"](https://trac.tools.ietf.org/html/draft-irtf-cfrg-kdf-uses-00)

## Contributing

This package is part of a monorepo. Instructions for contributing can be found in the [monorepo README](https://github.com/MetaMask/core#readme).

[bip-32]: https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki
[bip-39]: https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
[bip-44]: https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki
[slip-10]: https://github.com/satoshilabs/slips/blob/master/slip-0010.md
[slip-44]: https://github.com/satoshilabs/slips/blob/master/slip-0044.md
