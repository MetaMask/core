import { SignTypedDataVersion } from '@metamask/keyring-controller';

import type { MessageParamsPersonal, MessageParamsTyped } from '../types';
import {
  convertNumericValuesToQuotedString,
  normalizePersonalMessageParams,
  normalizeTypedMessageParams,
} from './normalize';

describe('Normalize Utils', () => {
  describe('normalizePersonalMessageParams', () => {
    it('normalizes data', async () => {
      const firstNormalized = normalizePersonalMessageParams({
        data: '879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
      } as MessageParamsPersonal);

      const secondNormalized = normalizePersonalMessageParams({
        data: 'somedata',
      } as MessageParamsPersonal);

      expect(firstNormalized.data).toBe(
        '0x879a053d4800c6354e76c7985a865d2922c82fb5b3f4577b2fe08b998954f2e0',
      );

      expect(secondNormalized.data).toBe('0x736f6d6564617461');
    });
  });

  describe('normalizeTypedMessageParams', () => {
    it.each([SignTypedDataVersion.V3, SignTypedDataVersion.V4])(
      'serializes data to JSON if not a string and version is %s',
      async (version) => {
        const normalized = normalizeTypedMessageParams(
          {
            data: { test: 'data' },
          } as unknown as MessageParamsTyped,
          version,
        );

        expect(normalized.data).toBe('{"test":"data"}');
      },
    );
  });

  describe('convertNumericValuesToQuotedString', () => {
    it('wraps numeric value in a json string in quotes', async () => {
      expect(convertNumericValuesToQuotedString('{temp:123}')).toBe(
        '{temp:"123"}',
      );
      expect(convertNumericValuesToQuotedString('{temp:{test:123}}')).toBe(
        '{temp:{test:"123"}}',
      );
      expect(convertNumericValuesToQuotedString('')).toBe('');
    });
  });
});
