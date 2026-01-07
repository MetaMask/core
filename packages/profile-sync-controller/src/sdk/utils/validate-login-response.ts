import type { LoginResponse } from '../authentication-jwt-bearer/types';

/**
 * Validates Shape is LoginResponse
 * NOTE - validation is pretty loose, we can improve this by using external libs like Zod for improved/tighter validation
 *
 * @param input - unknown/untyped input
 * @returns boolean if input is LoginResponse
 */
export function validateLoginResponse(input: unknown): input is LoginResponse {
  const assumedInput = input as LoginResponse;

  if (!assumedInput) {
    return false;
  }

  if (!assumedInput?.token || !assumedInput?.profile) {
    return false;
  }

  return true;
}
