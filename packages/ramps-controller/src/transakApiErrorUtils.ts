import { TransakApiError } from './TransakService';

const PHONE_ALREADY_REGISTERED_ERROR_CODE = '2020';

export function getTransakApiMessage(error: unknown): string | undefined {
  return error instanceof TransakApiError ? error.apiMessage : undefined;
}

export function isTransakPhoneRegisteredError(error: unknown): boolean {
  return (
    error instanceof TransakApiError &&
    error.errorCode === PHONE_ALREADY_REGISTERED_ERROR_CODE
  );
}
