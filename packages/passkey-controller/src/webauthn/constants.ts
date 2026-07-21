/**
 * COSE Algorithms
 *
 * @see https://www.iana.org/assignments/cose/cose.xhtml#algorithms
 */
export enum COSEALG {
  ES256 = -7,
  EdDSA = -8,
  ES384 = -35,
  ES512 = -36,
  PS256 = -37,
  PS384 = -38,
  PS512 = -39,
  ES256K = -47,
  RS256 = -257,
  RS384 = -258,
  RS512 = -259,
  RS1 = -65535,
}

/**
 * COSE Key Types
 *
 * @see https://www.iana.org/assignments/cose/cose.xhtml#key-type
 */
export enum COSEKTY {
  OKP = 1,
  EC2 = 2,
  RSA = 3,
}

/**
 * COSE Curves
 *
 * @see https://www.iana.org/assignments/cose/cose.xhtml#elliptic-curves
 */
export enum COSECRV {
  P256 = 1,
  P384 = 2,
  P521 = 3,
  ED25519 = 6,
  SECP256K1 = 8,
}

/**
 * COSE Key common and type-specific parameter labels.
 *
 * EC2 and RSA re-use the same numeric labels (-1, -2, -3) with different
 * semantics, so this is a plain object instead of an enum to avoid
 * duplicate-value violations.
 *
 * @see https://www.iana.org/assignments/cose/cose.xhtml#key-common-parameters
 * @see https://www.iana.org/assignments/cose/cose.xhtml#key-type-parameters
 */
export const COSEKEYS = {
  /** Key Type (common) */
  Kty: 1,
  /** Algorithm (common) */
  Alg: 3,

  /** EC2 / OKP: curve identifier */
  Crv: -1,
  /** EC2: x-coordinate / OKP: public key */
  X: -2,
  /** EC2: y-coordinate */
  Y: -3,

  /** RSA: modulus n (shares numeric label with Crv) */
  N: -1,
  /** RSA: exponent e (shares numeric label with X) */
  E: -2,
} as const;
