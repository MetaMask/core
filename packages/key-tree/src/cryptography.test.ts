import { bytesToHex } from '@metamask/byte-utils';
import { describe, expect, it, vi } from 'vitest';

import {
  hmacSha512,
  keccak256,
  pbkdf2Sha512,
  ripemd160,
  sha256,
} from './cryptography.js';
import * as utils from './utils.js';

describe('hmacSha512', () => {
  it('returns the HMAC-SHA-512 when using a custom implementation', async () => {
    const key = new Uint8Array(32);
    const data = new Uint8Array(32);

    const hash = new Uint8Array(64).fill(1);
    const customHmacSha512 = vi.fn().mockResolvedValue(hash);

    const result = await hmacSha512(key, data, {
      hmacSha512: customHmacSha512,
    });

    expect(result).toBe(hash);
    expect(customHmacSha512).toHaveBeenCalledWith(key, data);
  });

  it('returns the HMAC-SHA-512 when using the Web Crypto API', async () => {
    const key = new Uint8Array(32);
    const data = new Uint8Array(32);

    const result = await hmacSha512(key, data);
    expect(bytesToHex(result)).toBe(
      '0xbae46cebebbb90409abc5acf7ac21fdb339c01ce15192c52fb9e8aa11a8de9a4ea15a045f2be245fbb98916a9ae81b353e33b9c42a55380c5158241daeb3c6dd',
    );
  });

  it('returns the HMAC-SHA-512 when using the fallback', async () => {
    vi.spyOn(utils, 'isWebCryptoSupported').mockReturnValueOnce(false);

    const key = new Uint8Array(32);
    const data = new Uint8Array(32);

    const result = await hmacSha512(key, data);
    expect(bytesToHex(result)).toBe(
      '0xbae46cebebbb90409abc5acf7ac21fdb339c01ce15192c52fb9e8aa11a8de9a4ea15a045f2be245fbb98916a9ae81b353e33b9c42a55380c5158241daeb3c6dd',
    );
  });
});

describe('keccak256', () => {
  it('returns the keccak-256 hash of the data', () => {
    const data = new Uint8Array(32).fill(1);
    const hash = keccak256(data);

    expect(bytesToHex(hash)).toBe(
      '0xcebc8882fecbec7fb80d2cf4b312bec018884c2d66667c67a90508214bd8bafc',
    );
  });
});

describe('pbkdf2Sha512', () => {
  it('returns the PBKDF2-SHA-512 when using a custom implementation', async () => {
    const password = new Uint8Array(32);
    const salt = new Uint8Array(32);
    const iterations = 1000;
    const keyLength = 64;

    const hash = new Uint8Array(64).fill(1);
    const customPbkdf2Sha512 = vi.fn().mockResolvedValue(hash);

    const result = await pbkdf2Sha512(password, salt, iterations, keyLength, {
      pbkdf2Sha512: customPbkdf2Sha512,
    });

    expect(result).toBe(hash);
    expect(customPbkdf2Sha512).toHaveBeenCalledWith(
      password,
      salt,
      iterations,
      keyLength,
    );
  });

  it('returns the PBKDF2-SHA-512 when using the Web Crypto API', async () => {
    const password = new Uint8Array(32);
    const salt = new Uint8Array(32);
    const iterations = 1000;
    const keyLength = 64;

    const result = await pbkdf2Sha512(password, salt, iterations, keyLength);
    expect(bytesToHex(result)).toBe(
      '0xab3d65e9e6341a924c752a77b8dc6b78f1e6db5d31df7dd0cc534039dd9662a97bcaf0b959fe78248a49859c7952ddb25d66840f052b27ef1ab60b9446c0c9fd',
    );
  });

  it('returns the PBKDF2-SHA-512 when using the fallback', async () => {
    vi.spyOn(utils, 'isWebCryptoSupported').mockReturnValueOnce(false);

    const password = new Uint8Array(32);
    const salt = new Uint8Array(32);
    const iterations = 1000;
    const keyLength = 64;

    const result = await pbkdf2Sha512(password, salt, iterations, keyLength);
    expect(bytesToHex(result)).toBe(
      '0xab3d65e9e6341a924c752a77b8dc6b78f1e6db5d31df7dd0cc534039dd9662a97bcaf0b959fe78248a49859c7952ddb25d66840f052b27ef1ab60b9446c0c9fd',
    );
  });
});

describe('ripemd160', () => {
  it('returns the RIPEMD-160 hash of the data', () => {
    const data = new Uint8Array(32).fill(1);
    const hash = ripemd160(data);

    expect(bytesToHex(hash)).toBe('0x422d0010f16ae8539c53eb57a912890244a9eb5a');
  });
});

describe('sha256', () => {
  it('returns the SHA-256 hash of the data', () => {
    const data = new Uint8Array(32).fill(1);
    const hash = sha256(data);

    expect(bytesToHex(hash)).toBe(
      '0x72cd6e8422c407fb6d098690f1130b7ded7ec2f7f5e1d30bd9d521f015363793',
    );
  });
});
