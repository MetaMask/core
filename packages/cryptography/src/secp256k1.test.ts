import { bytesToHex, hexToBytes, stringToBytes, add0x } from '@metamask/utils';
import { secp256k1 } from '@noble/curves/secp256k1';

import * as random from './random.js';
import { generateKeyPair, getPublicKey, sign, verify } from './secp256k1.js';

const privateKey = hexToBytes(
  '0xf05665c0091fc75a5a558eddb88acd3ce2a789e15c0e10ceb334849357394ac1',
);
const publicKey = hexToBytes(
  '0x02ddf19d643bcc61ee6dd45740e69c6a6b56de8a4c2b5c1d44cc6fb18ad8874384',
);

const message = stringToBytes('foo');

const messageSignature = hexToBytes(
  '0x42ddf4266c0276e0c029d24ca43b63ad00237da6cccc3dd4c2814ae6c1fbfbe7371fce2c9cb630955c0d1f13c09cde1c97529c75afc8dce771eed18d4084a278',
);

describe('generateKeyPair', () => {
  it('uses 32 random bytes as the private key and derives the public key from it', async () => {
    const getRandomBytesSpy = jest
      .spyOn(random, 'getRandomBytes')
      .mockReturnValueOnce(privateKey);

    const keyPair = await generateKeyPair();

    expect(getRandomBytesSpy).toHaveBeenCalledTimes(1);
    expect(getRandomBytesSpy).toHaveBeenCalledWith(32);
    expect(bytesToHex(keyPair.privateKey)).toBe(bytesToHex(privateKey));
    expect(bytesToHex(keyPair.publicKey)).toBe(bytesToHex(publicKey));
  });

  it('generates a 32-byte private key and a 33-byte public key', async () => {
    const keyPair = await generateKeyPair();

    expect(keyPair.privateKey).toHaveLength(32);
    expect(keyPair.publicKey).toHaveLength(33);
  });

  it('generates a different key pair each time', async () => {
    const first = await generateKeyPair();
    const second = await generateKeyPair();

    expect(bytesToHex(first.privateKey)).not.toBe(
      bytesToHex(second.privateKey),
    );
    expect(bytesToHex(first.publicKey)).not.toBe(bytesToHex(second.publicKey));
  });

  it('generates a public key that matches the private key', async () => {
    const { privateKey: generatedPrivateKey, publicKey: generatedPublicKey } =
      await generateKeyPair();

    const derivedPublicKey = await getPublicKey(generatedPrivateKey);
    expect(bytesToHex(derivedPublicKey)).toBe(bytesToHex(generatedPublicKey));
  });

  it('generates a key pair that can sign and verify data', async () => {
    const { privateKey: generatedPrivateKey, publicKey: generatedPublicKey } =
      await generateKeyPair();
    const data = stringToBytes('foo');

    const signature = await sign(generatedPrivateKey, data);

    const valid = await verify(generatedPublicKey, signature, data);

    expect(valid).toBe(true);
  });
});

describe('getPublicKey', () => {
  it('derives the public key from a provided private key', async () => {
    const pubKey = await getPublicKey(privateKey);
    expect(bytesToHex(pubKey)).toBe(bytesToHex(publicKey));
  });

  it('accepts an ArrayBuffer private key', async () => {
    const pubKey = await getPublicKey(privateKey.buffer);
    expect(bytesToHex(pubKey)).toBe(bytesToHex(publicKey));
  });

  it('accepts a DataView private key', async () => {
    const pubKey = await getPublicKey(new DataView(privateKey.buffer));
    expect(bytesToHex(pubKey)).toBe(bytesToHex(publicKey));
  });

  it('throws if the private key is too short', async () => {
    await expect(getPublicKey(new Uint8Array(31))).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for secp256k1.',
    );
  });

  it('throws if the private key is too long', async () => {
    await expect(getPublicKey(new Uint8Array(33))).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for secp256k1.',
    );
  });
});

describe('sign', () => {
  it('signs the provided data with the private key', async () => {
    const signature = await sign(privateKey, message);
    // Temp
    expect(add0x(secp256k1.sign(message, privateKey).toHex())).toBe(
      bytesToHex(messageSignature),
    );
    expect(bytesToHex(signature)).toBe(bytesToHex(messageSignature));
  });

  it('accepts an ArrayBuffer private key and data', async () => {
    const signature = await sign(privateKey.buffer, message.buffer);
    expect(bytesToHex(signature)).toBe(bytesToHex(messageSignature));
  });

  it('accepts a DataView private key and data', async () => {
    const signature = await sign(
      new DataView(privateKey.buffer),
      new DataView(message.buffer),
    );
    expect(bytesToHex(signature)).toBe(bytesToHex(messageSignature));
  });

  it('throws if the private key is too short', async () => {
    await expect(sign(new Uint8Array(31), new Uint8Array(0))).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for secp256k1.',
    );
  });

  it('throws if the private key is too long', async () => {
    await expect(sign(new Uint8Array(33), new Uint8Array(0))).rejects.toThrow(
      'Invalid private key length: Private key must be exactly 32 bytes for secp256k1.',
    );
  });
});

describe('verify', () => {
  it('verifies the provided data, public key and signature', async () => {
    const verified = await verify(publicKey, messageSignature, message);
    expect(verified).toBe(true);
  });

  it('returns false when signature does not match data', async () => {
    const valid = await verify(publicKey, messageSignature, new Uint8Array(0));
    expect(valid).toBe(false);
  });

  it('returns false when signature does not match public key', async () => {
    const valid = await verify(new Uint8Array(33), messageSignature, message);
    expect(valid).toBe(false);
  });

  it('accepts an ArrayBuffer public key, signature, and data', async () => {
    const valid = await verify(
      publicKey.buffer,
      messageSignature.buffer,
      message.buffer,
    );
    expect(valid).toBe(true);
  });

  it('accepts a DataView public key, signature, and data', async () => {
    const valid = await verify(
      new DataView(publicKey.buffer),
      new DataView(messageSignature.buffer),
      new DataView(message.buffer),
    );
    expect(valid).toBe(true);
  });

  it('throws if the public key is too short', async () => {
    await expect(
      verify(new Uint8Array(32), messageSignature, message),
    ).rejects.toThrow(
      'Invalid public key length: Public key must be exactly 33 bytes for secp256k1.',
    );
  });

  it('throws if the public key is too long', async () => {
    await expect(
      verify(new Uint8Array(34), messageSignature, message),
    ).rejects.toThrow(
      'Invalid public key length: Public key must be exactly 33 bytes for secp256k1.',
    );
  });

  it('throws if the signature is too short', async () => {
    await expect(
      verify(publicKey, new Uint8Array(63), message),
    ).rejects.toThrow(
      'Invalid signature length: Signature must be exactly 64 bytes for secp256k1.',
    );
  });

  it('throws if the signature is too long', async () => {
    await expect(
      verify(publicKey, new Uint8Array(65), message),
    ).rejects.toThrow(
      'Invalid signature length: Signature must be exactly 64 bytes for secp256k1.',
    );
  });
});
