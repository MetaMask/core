import {
  getTransakApiMessage,
  isTransakPhoneRegisteredError,
} from './transakApiErrorUtils.js';
import { TRANSAK_ERROR_CODES } from './transakErrorCodes.js';
import { TransakApiError } from './TransakService.js';

describe('transakApiErrorUtils', () => {
  const phoneRegisteredError = new TransakApiError(
    400,
    "Fetching 'https://api.transak.com/user' failed with status '400'",
    TRANSAK_ERROR_CODES.PHONE_ALREADY_REGISTERED,
    'Phone registered with t***@test.com',
  );

  it('reads apiMessage from TransakApiError', () => {
    expect(getTransakApiMessage(phoneRegisteredError)).toBe(
      'Phone registered with t***@test.com',
    );
    expect(getTransakApiMessage(new Error('generic'))).toBeUndefined();
  });

  it('detects phone already registered errors', () => {
    expect(isTransakPhoneRegisteredError(phoneRegisteredError)).toBe(true);
    expect(isTransakPhoneRegisteredError(new Error('generic'))).toBe(false);
  });
});
