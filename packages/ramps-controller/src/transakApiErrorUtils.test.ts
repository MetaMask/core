import {
  getTransakApiMessage,
  isTransakPhoneRegisteredError,
} from './transakApiErrorUtils';
import { TransakApiError } from './TransakService';

describe('transakApiErrorUtils', () => {
  const phoneRegisteredError = new TransakApiError(
    400,
    "Fetching 'https://api.transak.com/user' failed with status '400'",
    '2020',
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
