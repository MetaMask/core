import { verifyMessage } from '@ethersproject/wallet';

import {
  MAX_CACHE_SIZE,
  clearSignatureCache,
  isValidSignature,
} from './signature.js';

jest.mock('@ethersproject/wallet', () => ({
  ...jest.requireActual('@ethersproject/wallet'),
  verifyMessage: jest.fn(),
}));

const { verifyMessage: actualVerifyMessage } = jest.requireActual<
  typeof import('@ethersproject/wallet')
>('@ethersproject/wallet');

const VALUE_1_MOCK = '0x12345678';
const VALUE_2_MOCK = '0xabcabcabcabcabcabcabcabc';

// Private Key = 0x8ff403b85f615d1fce7b0b1334080c066ce8ea9c96f98a6ee01177f130d8ba1e';
const PUBLIC_KEY_MOCK = '0xABCD136930f1fda40F728e00383095c91bF7250e';

const SIGNATURE_SINGLE_MOCK =
  '0xc68c89833a91c07ff871e60aeff096c99eb851c78b1c3116aca6f6d7492ab132337aa4343f313c391df8ab9d6b92f184d5ba9d6a500c8c67b9591499e64b3e2a1c';

const SIGNATURE_MULTIPLE_MOCK =
  '0x777b4f4461009b937de6a5ea7b0640c783433ad2cb50b0d0822a9ce9cadea12c5614b47927ddffc2e855b6932adb6a6e0a558667fd188eaf120a153c6b693dcb1b';

describe('Signature Utils', () => {
  const verifyMessageMock = jest.mocked(verifyMessage);

  beforeEach(() => {
    // `resetMocks` clears the implementation between tests.
    verifyMessageMock.mockImplementation(actualVerifyMessage);
    clearSignatureCache();
  });

  describe('isValidSignature', () => {
    it('returns true if signature correct and single data', async () => {
      expect(
        isValidSignature(
          [VALUE_1_MOCK],
          SIGNATURE_SINGLE_MOCK,
          PUBLIC_KEY_MOCK,
        ),
      ).toBe(true);
    });

    it('returns true if signature correct and multiple data', async () => {
      expect(
        isValidSignature(
          [VALUE_1_MOCK, VALUE_2_MOCK],
          SIGNATURE_MULTIPLE_MOCK,
          PUBLIC_KEY_MOCK,
        ),
      ).toBe(true);
    });

    it('returns false if signature incorrect', async () => {
      expect(
        isValidSignature(['0x123'], SIGNATURE_SINGLE_MOCK, PUBLIC_KEY_MOCK),
      ).toBe(false);
    });

    it('returns false if signature invalid', async () => {
      expect(
        isValidSignature(
          ['test' as never],
          SIGNATURE_SINGLE_MOCK,
          PUBLIC_KEY_MOCK,
        ),
      ).toBe(false);
    });

    it('verifies once only if called repeatedly with identical arguments', () => {
      const results = [1, 2, 3].map(() =>
        isValidSignature(
          [VALUE_1_MOCK],
          SIGNATURE_SINGLE_MOCK,
          PUBLIC_KEY_MOCK,
        ),
      );

      expect(results).toStrictEqual([true, true, true]);
      expect(verifyMessageMock).toHaveBeenCalledTimes(1);
    });

    it('caches negative results', () => {
      const results = [1, 2, 3].map(() =>
        isValidSignature(['0x123'], SIGNATURE_SINGLE_MOCK, PUBLIC_KEY_MOCK),
      );

      expect(results).toStrictEqual([false, false, false]);
      expect(verifyMessageMock).toHaveBeenCalledTimes(1);
    });

    it('verifies again if data differs', () => {
      isValidSignature([VALUE_1_MOCK], SIGNATURE_SINGLE_MOCK, PUBLIC_KEY_MOCK);
      isValidSignature([VALUE_2_MOCK], SIGNATURE_SINGLE_MOCK, PUBLIC_KEY_MOCK);

      expect(verifyMessageMock).toHaveBeenCalledTimes(2);
    });

    it('verifies again if signature differs', () => {
      isValidSignature([VALUE_1_MOCK], SIGNATURE_SINGLE_MOCK, PUBLIC_KEY_MOCK);
      isValidSignature(
        [VALUE_1_MOCK],
        SIGNATURE_MULTIPLE_MOCK,
        PUBLIC_KEY_MOCK,
      );

      expect(verifyMessageMock).toHaveBeenCalledTimes(2);
    });

    it('does not return a cached result if public key differs', () => {
      const first = isValidSignature(
        [VALUE_1_MOCK],
        SIGNATURE_SINGLE_MOCK,
        PUBLIC_KEY_MOCK,
      );

      const second = isValidSignature(
        [VALUE_1_MOCK],
        SIGNATURE_SINGLE_MOCK,
        '0x1234567890123456789012345678901234567890',
      );

      expect(first).toBe(true);
      expect(second).toBe(false);
      expect(verifyMessageMock).toHaveBeenCalledTimes(2);
    });

    it('clears the cache once it reaches the maximum size', () => {
      verifyMessageMock.mockReturnValue(PUBLIC_KEY_MOCK);

      isValidSignature([VALUE_1_MOCK], SIGNATURE_SINGLE_MOCK, PUBLIC_KEY_MOCK);

      for (let index = 0; index < MAX_CACHE_SIZE; index++) {
        isValidSignature(
          [`0x${index}`],
          SIGNATURE_SINGLE_MOCK,
          PUBLIC_KEY_MOCK,
        );
      }

      verifyMessageMock.mockClear();

      isValidSignature([VALUE_1_MOCK], SIGNATURE_SINGLE_MOCK, PUBLIC_KEY_MOCK);

      expect(verifyMessageMock).toHaveBeenCalledTimes(1);
    });

    it('distinguishes data entries that concatenate identically', () => {
      isValidSignature(
        [VALUE_1_MOCK, VALUE_2_MOCK],
        SIGNATURE_MULTIPLE_MOCK,
        PUBLIC_KEY_MOCK,
      );

      isValidSignature(
        [`${VALUE_1_MOCK}${VALUE_2_MOCK.slice(2)}` as never],
        SIGNATURE_MULTIPLE_MOCK,
        PUBLIC_KEY_MOCK,
      );

      expect(verifyMessageMock).toHaveBeenCalledTimes(2);
    });
  });
});
