import {
  getTransakApiMessage,
  isTransakPhoneRegisteredError,
} from './transakApiErrorUtils';
import { TRANSAK_ERROR_CODES } from './transakErrorCodes';
import { TransakApiError } from './TransakService';

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
