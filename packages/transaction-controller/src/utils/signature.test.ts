import { isValidSignature } from './signature';

const VALUE_1_MOCK = '0x12345678';
const VALUE_2_MOCK = '0xA234567812345678123456781234567812345678';

// Private Key = 0x8ff403b85f615d1fce7b0b1334080c066ce8ea9c96f98a6ee01177f130d8ba1e';
const PUBLIC_KEY_MOCK = '0xABCD136930f1fda40F728e00383095c91bF7250e';

const SIGNATURE_SINGLE_MOCK =
  '0xa88514f25536fced4ff2f6b5660b54664cd7c7e9d6e47b75ff7fc4acd26a4129148863ebfbb781f9415289945acbc96b1ce72a6b9d7eb0b698200f2a9decee491c';

const SIGNATURE_MULTIPLE_MOCK =
  '0xa88514f25536fced4ff2f6b5660b54664cd7c7e9d6e47b75ff7fc4acd26a4129148863ebfbb781f9415289945acbc96b1ce72a6b9d7eb0b698200f2a9decee491c';

describe('Signature Utils', () => {
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
  });
});
