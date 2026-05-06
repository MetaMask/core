import { ed25519 } from '@noble/curves/ed25519';
import { p384, p521 } from '@noble/curves/nist';
import { sha384, sha512 } from '@noble/hashes/sha2';
import { webcrypto } from 'node:crypto';

import { base64URLToBytes } from '../utils/encoding';
import { COSEALG, COSECRV, COSEKEYS, COSEKTY } from './constants';
import { verifySignature } from './verify-signature';

function decodeJwkBase64Url(value: string): Uint8Array {
  return Uint8Array.from(
    atob(
      value.replace(/-/gu, '+').replace(/_/gu, '/') +
        '='.repeat((4 - (value.length % 4)) % 4),
    ),
    (char) => char.charCodeAt(0),
  );
}

describe('verifySignature', () => {
  it('verifies P-256 EC2 signature from conformance vector', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES256);
    coseMap.set(COSEKEYS.Crv, COSECRV.P256);
    coseMap.set(
      COSEKEYS.X,
      base64URLToBytes('_qRi-kwOVobsqJ_1GAHZYfC77QoIdsVFYkx2Mw20UM4'),
    );
    coseMap.set(
      COSEKEYS.Y,
      base64URLToBytes('BXEathwyOK_uQRmlZ_m4wReHLujSXk_-e3-9co5B2MY'),
    );

    const data = base64URLToBytes(
      'Bt81jmu3ieajF4w1at8HmieVOTDymHd7xJguJCUsL-Q',
    );
    const signature = base64URLToBytes(
      'MEQCH1h_F7TPTMVh_kwb_ssjD0_2U77bbXazz2ux-P6khLQCIQCutHs9eCBkCIMP3yA9mmNRKEfFd-REmhGY2GbHozaC7w',
    );

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });

    expect(result).toBe(true);
  });

  it('verifies P-384 EC2 signature', async () => {
    const privateKey = p384.utils.randomSecretKey();
    const publicKeyRaw = p384.getPublicKey(privateKey, false);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES384);
    coseMap.set(COSEKEYS.Crv, COSECRV.P384);
    coseMap.set(COSEKEYS.X, publicKeyRaw.slice(1, 49));
    coseMap.set(COSEKEYS.Y, publicKeyRaw.slice(49, 97));

    const data = new Uint8Array(32).fill(0xcc);
    const hash = sha384(data);
    const ecdsaSig = p384.sign(hash, privateKey);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature: new Uint8Array(ecdsaSig.toDERRawBytes()),
      data,
    });

    expect(result).toBe(true);
  });

  it('verifies P-384 EC2 signature from conformance vector', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES384);
    coseMap.set(COSEKEYS.Crv, COSECRV.P384);
    coseMap.set(
      COSEKEYS.X,
      base64URLToBytes(
        'pm-0exykk1x0O72S9sm6fl-iXxFrGikjQHi1CgONIiEz_yDJdCPxN453qg6HLkOx',
      ),
    );
    coseMap.set(
      COSEKEYS.Y,
      base64URLToBytes(
        '2B7yW7sgza8Sf7ifznQlGJqmJxgupkAevUqqOJTWaWBZiQ7sAf-TfAaNBukiz12K',
      ),
    );

    const data = base64URLToBytes(
      'D7mI8UwWXv4rpfSQUNqtUXAhZEPbRLugmWclPpJ9m7c',
    );
    const signature = base64URLToBytes(
      'MGMCL3lZ2Rjxo5WcmTCdWyB6jTE9PVuduOR_AsJu956J9S_mFNbHP_-MbyWem4dfb5iqAjABJhTRltNl5Y0O4XC7YLNsYKq2WxYQ1HFOMGsr6oNkUPsX3UAr2zeeWL_Tp1VgHeM',
    );

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });

    expect(result).toBe(true);
  });

  it('verifies P-521 EC2 signature from conformance vector', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES512);
    coseMap.set(COSEKEYS.Crv, COSECRV.P521);
    coseMap.set(
      COSEKEYS.X,
      base64URLToBytes(
        'AaLbnrCvCuQivbknRW50FjdqPQv4NRF9tHsN4QuVQ3sw8uSspd33o-NTBfjg5JzX9rnpbkKDigb6NugmrVjzNMNK',
      ),
    );
    coseMap.set(
      COSEKEYS.Y,
      base64URLToBytes(
        'AE64axa8L8PkLX5Td0GaX79cLOW9E2-8-ObhL9XT_ih-1XxbGQcA5VhL1gI0xIQq5zYAxgZYey6PmbbqgtcUPRVt',
      ),
    );

    const data = base64URLToBytes(
      '5p0h9RZTjLoBlnL2nY5pqOnhGy4q60NzbjDe2rVDR7o',
    );
    const signature = base64URLToBytes(
      'MIGHAkFRpbGknlgpETORypMprGBXMkJMfuqgJupy3NcgCOaJJdj3Voz74kV2pjPqkLNpuO9FqVtXeEsUw-jYsBHcMqHZhwJCAQ88uFDJS5g81XVBcLMIgf6ro-F-5jgRAmHx3CRVNGdk81MYbFJhT3hd2w9RdhT8qBG0zzRBXYAcHrKo0qJwQZot',
    );

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });

    expect(result).toBe(true);
  });

  it('verifies Ed25519 OKP signature', async () => {
    const privateKey = ed25519.utils.randomSecretKey();
    const publicKey = ed25519.getPublicKey(privateKey);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.OKP);
    coseMap.set(COSEKEYS.Alg, COSEALG.EdDSA);
    coseMap.set(COSEKEYS.Crv, COSECRV.ED25519);
    coseMap.set(COSEKEYS.X, publicKey);

    const data = new Uint8Array(32).fill(0xdd);
    const signature = ed25519.sign(data, privateKey);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });

    expect(result).toBe(true);
  });

  it('verifies Ed25519 OKP signature from conformance vector', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.OKP);
    coseMap.set(COSEKEYS.Alg, COSEALG.EdDSA);
    coseMap.set(COSEKEYS.Crv, COSECRV.ED25519);
    coseMap.set(
      COSEKEYS.X,
      base64URLToBytes('bN-2dTH53XfUq55T1RkvXMpwHV0dRVnMBPxuOBm1-vI'),
    );

    const data = base64URLToBytes(
      'SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2NBAAAAMpHf6teVnkR1rSabDUgr4IkAIBqlqljErWIWWTGYn6Lqjsb8p3djr7sVZW7WYoECyh5xpAEBAycgBiFYIGzftnUx-d131KueU9UZL1zKcB1dHUVZzAT8bjgZtfrytEHOGqAdESuKacg0dIwKWfEP8VP4or6CINxkD5qWQYw',
    );
    const signature = base64URLToBytes(
      'HdoQloEiGSUHf9dJXbVzyWNbDh0K25tpNQQpj5hrkhCcdfz0pCBPtqChka_4kfIbhf6JyY1EGAuf9pQdwqJVBQ',
    );

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });

    expect(result).toBe(true);
  });

  it('throws for unsupported EC2 curve', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES256);
    coseMap.set(COSEKEYS.Crv, 99);
    coseMap.set(COSEKEYS.X, new Uint8Array(32));
    coseMap.set(COSEKEYS.Y, new Uint8Array(32));

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(64),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('Unsupported EC2 curve');
  });

  it('throws for missing EC2 coordinates', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES256);
    coseMap.set(COSEKEYS.Crv, COSECRV.P256);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(64),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('EC2 public key missing x or y coordinate');
  });

  it('throws for missing EC2 alg', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMap.set(COSEKEYS.Crv, COSECRV.P256);
    coseMap.set(COSEKEYS.X, new Uint8Array(32));
    coseMap.set(COSEKEYS.Y, new Uint8Array(32));

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(64),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('EC2 public key missing alg');
  });

  it('throws for missing OKP x coordinate', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.OKP);
    coseMap.set(COSEKEYS.Alg, COSEALG.EdDSA);
    coseMap.set(COSEKEYS.Crv, COSECRV.ED25519);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(64),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('OKP public key missing x coordinate');
  });

  it('throws for unsupported OKP algorithm', async () => {
    const privateKey = ed25519.utils.randomSecretKey();
    const publicKey = ed25519.getPublicKey(privateKey);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.OKP);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES256);
    coseMap.set(COSEKEYS.Crv, COSECRV.ED25519);
    coseMap.set(COSEKEYS.X, publicKey);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: ed25519.sign(new Uint8Array(32), privateKey),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('Unexpected OKP algorithm');
  });

  it('throws for unsupported OKP curve', async () => {
    const privateKey = ed25519.utils.randomSecretKey();
    const publicKey = ed25519.getPublicKey(privateKey);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.OKP);
    coseMap.set(COSEKEYS.Alg, COSEALG.EdDSA);
    coseMap.set(COSEKEYS.Crv, COSECRV.P256);
    coseMap.set(COSEKEYS.X, publicKey);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: ed25519.sign(new Uint8Array(32), privateKey),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('Unsupported OKP curve');
  });

  it('throws for missing kty', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Alg, COSEALG.ES256);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(64),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('COSE public key missing kty');
  });

  it('throws for unsupported key type', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, 99);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES256);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(64),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('Unsupported COSE key type');
  });

  it('verifies RSA signature via Web Crypto', async () => {
    const keyPair = await webcrypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: 'SHA-256' },
      },
      true,
      ['sign', 'verify'],
    );

    const data = new Uint8Array(32).fill(0xee);
    const signature = new Uint8Array(
      await webcrypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keyPair.privateKey,
        data,
      ),
    );

    const jwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);

    const nBytes = decodeJwkBase64Url(jwk.n as string);
    const eBytes = decodeJwkBase64Url(jwk.e as string);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, COSEALG.RS256);
    coseMap.set(-1, nBytes);
    coseMap.set(-2, eBytes);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });

    expect(result).toBe(true);
  });

  it('throws for unsupported RSA algorithm', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, -999);
    coseMap.set(-1, new Uint8Array(256));
    coseMap.set(-2, new Uint8Array([1, 0, 1]));

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(256),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('Unsupported RSA algorithm');
  });

  it('throws for missing RSA n or e', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, COSEALG.RS256);

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(256),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('RSA public key missing n or e');
  });

  it('throws for missing RSA alg', async () => {
    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.N, new Uint8Array(256).fill(1));
    coseMap.set(COSEKEYS.E, new Uint8Array([1, 0, 1]));

    await expect(
      verifySignature({
        cosePublicKey: coseMap,
        signature: new Uint8Array(256),
        data: new Uint8Array(32),
      }),
    ).rejects.toThrow('RSA public key missing alg');
  });

  it('verifies PS256 signature via Web Crypto', async () => {
    const keyPair = await webcrypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: 'SHA-256' },
      },
      true,
      ['sign', 'verify'],
    );

    const data = new Uint8Array(32).fill(0x9a);
    const signature = new Uint8Array(
      await webcrypto.subtle.sign(
        { name: 'RSA-PSS', saltLength: 32 },
        keyPair.privateKey,
        data,
      ),
    );

    const jwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
    const nBytes = decodeJwkBase64Url(jwk.n as string);
    const eBytes = decodeJwkBase64Url(jwk.e as string);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, COSEALG.PS256);
    coseMap.set(COSEKEYS.N, nBytes);
    coseMap.set(COSEKEYS.E, eBytes);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });

    expect(result).toBe(true);
  });

  it('verifies RS1 signature via Web Crypto', async () => {
    const keyPair = await webcrypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: 'SHA-1' },
      },
      true,
      ['sign', 'verify'],
    );

    const data = new Uint8Array(32).fill(0x44);
    const signature = new Uint8Array(
      await webcrypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keyPair.privateKey,
        data,
      ),
    );

    const jwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
    const nBytes = decodeJwkBase64Url(jwk.n as string);
    const eBytes = decodeJwkBase64Url(jwk.e as string);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, COSEALG.RS1);
    coseMap.set(COSEKEYS.N, nBytes);
    coseMap.set(COSEKEYS.E, eBytes);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });

    expect(result).toBe(true);
  });

  it('verifies PS384 signature via Web Crypto', async () => {
    const keyPair = await webcrypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: 'SHA-384' },
      },
      true,
      ['sign', 'verify'],
    );

    const data = new Uint8Array(32).fill(0x4a);
    const signature = new Uint8Array(
      await webcrypto.subtle.sign(
        { name: 'RSA-PSS', saltLength: 48 },
        keyPair.privateKey,
        data,
      ),
    );

    const jwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
    const nBytes = decodeJwkBase64Url(jwk.n as string);
    const eBytes = decodeJwkBase64Url(jwk.e as string);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, COSEALG.PS384);
    coseMap.set(COSEKEYS.N, nBytes);
    coseMap.set(COSEKEYS.E, eBytes);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });

    expect(result).toBe(true);
  });

  it('verifies PS512 signature via Web Crypto', async () => {
    const keyPair = await webcrypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: 'SHA-512' },
      },
      true,
      ['sign', 'verify'],
    );

    const data = new Uint8Array(32).fill(0x5a);
    const signature = new Uint8Array(
      await webcrypto.subtle.sign(
        { name: 'RSA-PSS', saltLength: 64 },
        keyPair.privateKey,
        data,
      ),
    );

    const jwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
    const nBytes = decodeJwkBase64Url(jwk.n as string);
    const eBytes = decodeJwkBase64Url(jwk.e as string);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, COSEALG.PS512);
    coseMap.set(COSEKEYS.N, nBytes);
    coseMap.set(COSEKEYS.E, eBytes);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });

    expect(result).toBe(true);
  });

  it('verifies RS256 with subarray buffers', async () => {
    const keyPair = await webcrypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: 'SHA-256' },
      },
      true,
      ['sign', 'verify'],
    );

    const data = new Uint8Array(32).fill(0x7c);
    const signature = new Uint8Array(
      await webcrypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keyPair.privateKey,
        data,
      ),
    );

    const signatureContainer = new Uint8Array(signature.length + 8);
    signatureContainer.set(signature, 4);
    const signatureSubarray = signatureContainer.subarray(
      4,
      4 + signature.length,
    );

    const dataContainer = new Uint8Array(data.length + 10);
    dataContainer.set(data, 5);
    const dataSubarray = dataContainer.subarray(5, 5 + data.length);

    const jwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
    const nBytes = decodeJwkBase64Url(jwk.n as string);
    const eBytes = decodeJwkBase64Url(jwk.e as string);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, COSEALG.RS256);
    coseMap.set(COSEKEYS.N, nBytes);
    coseMap.set(COSEKEYS.E, eBytes);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature: signatureSubarray,
      data: dataSubarray,
    });

    expect(result).toBe(true);
  });
});

describe('verifySignature RSA hash variants', () => {
  async function generateRSAKeyPairAndSign(
    hashName: string,
    alg: number,
  ): Promise<{
    coseMap: Map<number, number | Uint8Array>;
    signature: Uint8Array;
    data: Uint8Array;
  }> {
    const keyPair = await webcrypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: { name: hashName },
      },
      true,
      ['sign', 'verify'],
    );

    const data = new Uint8Array(32).fill(0xff);
    const signature = new Uint8Array(
      await webcrypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',
        keyPair.privateKey,
        data,
      ),
    );

    const jwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey);
    const nBytes = decodeJwkBase64Url(jwk.n as string);
    const eBytes = decodeJwkBase64Url(jwk.e as string);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.RSA);
    coseMap.set(COSEKEYS.Alg, alg);
    coseMap.set(-1, nBytes);
    coseMap.set(-2, eBytes);

    return { coseMap, signature, data };
  }

  it('verifies RS384 signature', async () => {
    const { coseMap, signature, data } = await generateRSAKeyPairAndSign(
      'SHA-384',
      COSEALG.RS384,
    );
    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });
    expect(result).toBe(true);
  });

  it('verifies RS512 signature', async () => {
    const { coseMap, signature, data } = await generateRSAKeyPairAndSign(
      'SHA-512',
      COSEALG.RS512,
    );
    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature,
      data,
    });
    expect(result).toBe(true);
  });

  it('verifies ES512/P-521 signature', async () => {
    const privateKey = p521.utils.randomSecretKey();
    const publicKeyRaw = p521.getPublicKey(privateKey, false);

    const coseMap = new Map<number, number | Uint8Array>();
    coseMap.set(COSEKEYS.Kty, COSEKTY.EC2);
    coseMap.set(COSEKEYS.Alg, COSEALG.ES512);
    coseMap.set(COSEKEYS.Crv, COSECRV.P521);
    coseMap.set(COSEKEYS.X, publicKeyRaw.slice(1, 67));
    coseMap.set(COSEKEYS.Y, publicKeyRaw.slice(67, 133));

    const data = new Uint8Array(32).fill(0xab);
    const hash = sha512(data);
    const ecdsaSig = p521.sign(hash, privateKey);

    const result = await verifySignature({
      cosePublicKey: coseMap,
      signature: new Uint8Array(ecdsaSig.toDERRawBytes()),
      data,
    });

    expect(result).toBe(true);
  });
});
