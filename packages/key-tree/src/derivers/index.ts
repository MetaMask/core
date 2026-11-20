import type { Network } from '../constants.js';
import type { Curve } from '../curves/index.js';
import type { SLIP10Node } from '../SLIP10Node.js';
import * as bip32 from './bip32.js';
import * as bip39 from './bip39.js';
import * as cip3 from './cip3.js';
import * as slip10 from './slip10.js';

export type DerivedKeys = {
  /**
   * The derived private key, can be undefined if public key derivation was used.
   */
  privateKey?: Uint8Array<ArrayBuffer>;
  publicKey: Uint8Array<ArrayBuffer>;
  chainCode: Uint8Array<ArrayBuffer>;
};

export type DeriveChildKeyArgs = {
  path: Uint8Array<ArrayBuffer> | string;
  curve: Curve;
  node?: SLIP10Node;
  network?: Network | undefined;
};

export type Deriver = {
  deriveChildKey: (args: DeriveChildKeyArgs) => Promise<SLIP10Node>;
};

export const derivers = {
  bip32,
  bip39,
  slip10,
  cip3,
};

export { createBip39KeyFromSeed, mnemonicToSeed } from './bip39.js';
