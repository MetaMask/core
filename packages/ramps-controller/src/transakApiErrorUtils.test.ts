import {
  getTransakApiMessage,
  getTransakErrorCode,
  isTransakApiError,
  isTransakErrorCode,
  isTransakPhoneRegisteredError,
} from './transakApiErrorUtils';
import { TransakApiError } from './TransakService';
import { TRANSAK_ERROR_CODES } from './transakErrorCodes';

describe('transakApiErrorUtils', () => {
  const phoneRegisteredError = new TransakApiError(
    400,
    "Fetching 'https://api.transak.com/user' failed with status '400'",
    TRANSAK_ERROR_CODES.PHONE_ALREADY_REGISTERED,
    'Phone registered with t***@test.com',
  );

  it('identifies TransakApiError instances', () => {
    expect(isTransakApiError(phoneRegisteredError)).toBe(true);
    expect(isTransakApiError(new Error('generic'))).toBe(false);
  });

  it('reads errorCode and apiMessage from TransakApiError', () => {
    expect(getTransakErrorCode(phoneRegisteredError)).toBe('2020');
    expect(getTransakApiMessage(phoneRegisteredError)).toBe(
      'Phone registered with t***@test.com',
    );
  });

  it('matches known Transak error codes', () => {
    expect(
      isTransakErrorCode(
        phoneRegisteredError,
        TRANSAK_ERROR_CODES.PHONE_ALREADY_REGISTERED,
      ),
    ).toBe(true);
    expect(isTransakPhoneRegisteredError(phoneRegisteredError)).toBe(true);
    expect(isTransakErrorCode(phoneRegisteredError, '5000')).toBe(false);
  });

  it('returns undefined helpers for non-Transak errors', () => {
    expect(getTransakErrorCode(new Error('generic'))).toBeUndefined();
    expect(getTransakApiMessage(new Error('generic'))).toBeUndefined();
    expect(isTransakPhoneRegisteredError(new Error('generic'))).toBe(false);
  });
});
