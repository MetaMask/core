import { TRANSAK_ERROR_CODES } from './transakErrorCodes.js';
import { TransakApiError } from './TransakService.js';

export function getTransakApiMessage(error: unknown): string | undefined {
  return error instanceof TransakApiError ? error.apiMessage : undefined;
}

export function isTransakPhoneRegisteredError(error: unknown): boolean {
  return (
    error instanceof TransakApiError &&
    error.errorCode === TRANSAK_ERROR_CODES.PHONE_ALREADY_REGISTERED
  );
}
