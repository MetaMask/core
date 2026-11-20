import { describe, expect, it } from 'vitest';

import { ed25519, secp256k1 } from '../src/curves/index.js';
import { deriveKeyFromPath } from '../src/derivation.js';
import {
  createBip39KeyFromSeed,
  getDerivationPathWithSeed,
} from '../src/derivers/bip39.js';
import type { SLIP10Node, HDPathTuple } from '../src/index.js';
import { BIP44Node, BIP44PurposeNodeToken } from '../src/index.js';
import {
  getBIP44CoinTypeToAddressPathTuple,
  hexStringToBytes,
} from '../src/utils.js';
import fixtures from './fixtures.js';

describe('reference implementation tests', () => {
  describe('local', () => {
    const { addresses, mnemonic } = fixtures.local;
    const mnemonicBip39Node = `bip39:${mnemonic}` as const;

    describe('BIP44Node', () => {
      it('derives the expected keys', async () => {
        // Ethereum coin type node
        const node = await BIP44Node.fromDerivationPath({
          derivationPath: [
            mnemonicBip39Node,
            BIP44PurposeNodeToken,
            `bip32:60'`,
          ],
        });

        for (let index = 0; index < addresses.length; index++) {
          const expectedAddress = addresses[index];
          const childNode = await node.derive(
            getBIP44CoinTypeToAddressPathTuple({ address_index: index }),
          );

          expect(childNode.address).toStrictEqual(expectedAddress);
        }
      });
    });

    describe('deriveKeyFromPath', () => {
      it('derives the expected keys', async () => {
        // Ethereum coin type key
        const node = await deriveKeyFromPath({
          path: await getDerivationPathWithSeed({
            path: [mnemonicBip39Node, BIP44PurposeNodeToken, `bip32:60'`],
            curve: 'secp256k1',
          }),
          curve: 'secp256k1',
        });

        for (let index = 0; index < addresses.length; index++) {
          const expectedAddress = addresses[index];
          const { address } = await deriveKeyFromPath({
            path: getBIP44CoinTypeToAddressPathTuple({
              address_index: index,
            }),
            node,
          });

          expect(address).toStrictEqual(expectedAddress);
        }
      });
    });
  });

  describe('eth-hd-keyring', () => {
    const { mnemonic, addresses } = fixtures['eth-hd-keyring'];
    const mnemonicBip39Node = `bip39:${mnemonic}` as const;

    describe('BIP44Node', () => {
      it('derives the same keys as the reference implementation', async () => {
        // Ethereum coin type node
        const node = await BIP44Node.fromDerivationPath({
          derivationPath: [
            mnemonicBip39Node,
            BIP44PurposeNodeToken,
            `bip32:60'`,
          ],
        });

        const numberOfAccounts = 5;
        for (let i = 0; i < numberOfAccounts; i++) {
          const path = getBIP44CoinTypeToAddressPathTuple({
            address_index: i,
          });
          const address = await node
            .derive(path)
            .then((childNode) => childNode.address);

          expect(address).toBe(addresses[i]);
        }
      });

      it('derives the same keys as the reference implementation using public key derivation', async () => {
        // Ethereum coin type node
        const node = await BIP44Node.fromDerivationPath({
          derivationPath: [
            mnemonicBip39Node,
            BIP44PurposeNodeToken,
            `bip32:60'`,
          ],
        });

        const numberOfAccounts = 5;
        for (let i = 0; i < numberOfAccounts; i++) {
          const [account, change, index] = getBIP44CoinTypeToAddressPathTuple({
            address_index: i,
          });
          const parentNode = await node.derive([account, change]);

          const address = await parentNode
            .neuter()
            .derive([index])
            .then((childNode) => childNode.address);

          expect(address).toBe(addresses[i]);
        }
      });
    });

    describe('deriveKeyFromPath', () => {
      it('derives the same keys as the reference implementation', async () => {
        // Ethereum coin type key
        const node = await deriveKeyFromPath({
          path: await getDerivationPathWithSeed({
            path: [mnemonicBip39Node, BIP44PurposeNodeToken, `bip32:60'`],
            curve: 'secp256k1',
          }),
          curve: 'secp256k1',
        });

        const numberOfAccounts = 5;
        const ourAccounts = [];
        for (let i = 0; i < numberOfAccounts; i++) {
          ourAccounts.push(
            await deriveKeyFromPath({
              path: getBIP44CoinTypeToAddressPathTuple({ address_index: i }),
              node,
            }).then(({ address }) => address),
          );
        }

        expect(addresses).toStrictEqual(ourAccounts);
      });
    });
  });

  describe('ethereumjs-wallet', () => {
    const { sampleAddressIndices, hexSeed, privateKey, address, path } =
      fixtures['ethereumjs-wallet'];
    const seed = hexStringToBytes(hexSeed);

    describe('BIP44Node', () => {
      it('derives the same keys as the reference implementation', async () => {
        const parentNode = await createBip39KeyFromSeed(seed, secp256k1);
        const node = await parentNode.derive(path.ours.tuple);

        expect(node.privateKey).toStrictEqual(privateKey);
        expect(node.address).toStrictEqual(address);

        for (const { index, address: theirAddress } of sampleAddressIndices) {
          const ourAddress = await node
            .derive([`bip32:${index}`])
            .then((childNode) => childNode.address);

          expect(ourAddress).toStrictEqual(theirAddress);
        }
      });

      it('derives the same keys as the reference implementation using public key derivation', async () => {
        const parentNode = await createBip39KeyFromSeed(seed, secp256k1);
        const node = await parentNode.derive(path.ours.tuple);

        expect(node.privateKey).toStrictEqual(privateKey);
        expect(node.address).toStrictEqual(address);

        for (const { index, address: theirAddress } of sampleAddressIndices) {
          const ourAddress = await node
            .neuter()
            .derive([`bip32:${index}`])
            .then((childNode) => childNode.address);

          expect(ourAddress).toStrictEqual(theirAddress);
        }
      });
    });

    describe('deriveKeyFromPath', () => {
      it('derives the same keys as the reference implementation', async () => {
        const node = await createBip39KeyFromSeed(seed, secp256k1);
        const childNode = await deriveKeyFromPath({
          path: path.ours.tuple,
          node,
        });

        expect(childNode.privateKey).toStrictEqual(privateKey);
        expect(childNode.address).toStrictEqual(address);

        for (const { index, address: theirAddress } of sampleAddressIndices) {
          const childChildNode = await deriveKeyFromPath({
            path: [`bip32:${index}`],
            node: childNode,
          });

          expect(childChildNode.address).toStrictEqual(theirAddress);
        }
      });
    });
  });

  describe('BIP-32 specification test vectors', () => {
    const vectors = fixtures.bip32;

    // We only test the BIP-32 vectors with deriveKeyFromPath, since not all
    // paths are BIP-44 compatible.
    describe('deriveKeyFromPath', () => {
      it('derives the test vector keys', async () => {
        for (const vector of vectors) {
          const seed = hexStringToBytes(vector.hexSeed);
          const node = await createBip39KeyFromSeed(seed, secp256k1);

          for (const keyObj of vector.keys) {
            const { path, privateKey } = keyObj;

            let targetNode: SLIP10Node;

            // If the path is empty, use the master node
            if (path.ours.string === '') {
              targetNode = node;
            } else {
              targetNode = await deriveKeyFromPath({
                path: path.ours.tuple as HDPathTuple,
                node,
              });
            }

            expect(targetNode.privateKey).toStrictEqual(privateKey);
          }
        }
      });
    });
  });

  describe('ed25519', () => {
    describe('SLIP-10', () => {
      const vectors = fixtures.ed25519.slip10;

      describe('deriveKeyFromPath', () => {
        it('derives the test vector keys', async () => {
          for (const { hexSeed, keys } of vectors) {
            const node = await createBip39KeyFromSeed(
              hexStringToBytes(hexSeed),
              ed25519,
            );

            for (const { path, privateKey, publicKey } of keys) {
              let targetNode: SLIP10Node;
              if (path.ours.string === '') {
                targetNode = node;
              } else {
                targetNode = await deriveKeyFromPath({
                  path: path.ours.tuple,
                  node,
                });
              }

              expect(targetNode.privateKey).toBe(privateKey);
              expect(targetNode.publicKey).toBe(publicKey);
            }
          }
        });
      });
    });

    describe('ed25519-hd-key', () => {
      const { sampleKeyIndices, hexSeed, privateKey, path } =
        fixtures.ed25519['ed25519-hd-key'];
      const seed = hexStringToBytes(hexSeed);

      describe('SLIP10Node', () => {
        it('derives the same keys as the reference implementation', async () => {
          // Ethereum coin type node
          const parentNode = await createBip39KeyFromSeed(seed, ed25519);
          const node = await parentNode.derive(path.ours.tuple);

          expect(node.privateKey).toStrictEqual(privateKey);

          for (const {
            index,
            privateKey: theirPrivateKey,
            publicKey: theirPublicKey,
          } of sampleKeyIndices) {
            const childNode = await node.derive([`slip10:${index}'`]);

            expect(childNode.privateKey).toStrictEqual(theirPrivateKey);
            expect(childNode.publicKey).toStrictEqual(theirPublicKey);
          }
        });
      });

      describe('deriveKeyFromPath', () => {
        it('derives the same keys as the reference implementation', async () => {
          // Ethereum coin type key
          const node = await createBip39KeyFromSeed(seed, ed25519);
          const childNode = await deriveKeyFromPath({
            path: [`slip10:44'`, `slip10:0'`, `slip10:0'`, `slip10:1'`],
            node,
          });

          for (const {
            index,
            privateKey: theirPrivateKey,
          } of sampleKeyIndices) {
            const { privateKey: ourPrivateKey } = await deriveKeyFromPath({
              path: [`slip10:${index}'`],
              node: childNode,
            });

            expect(ourPrivateKey).toStrictEqual(theirPrivateKey);
          }
        });
      });
    });
  });
});
