import { TRANSAK_ERROR_CODES } from './transakErrorCodes';
import { TransakApiError } from './TransakService';

export function isTransakApiError(error: unknown): error is TransakApiError {
  return error instanceof TransakApiError;
}

export function getTransakErrorCode(error: unknown): string | undefined {
  return isTransakApiError(error) ? error.errorCode : undefined;
}

export function getTransakApiMessage(error: unknown): string | undefined {
  return isTransakApiError(error) ? error.apiMessage : undefined;
}

export function isTransakErrorCode(error: unknown, code: string): boolean {
  const errorCode = getTransakErrorCode(error);
  return errorCode === code || errorCode === String(code);
}

export function isTransakPhoneRegisteredError(error: unknown): boolean {
  return isTransakErrorCode(
    error,
    TRANSAK_ERROR_CODES.PHONE_ALREADY_REGISTERED,
  );
}
