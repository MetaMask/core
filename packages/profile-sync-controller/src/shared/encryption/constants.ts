// Nonce/Key Sizes
export const ALGORITHM_NONCE_SIZE = 12; // 12 bytes
export const ALGORITHM_KEY_SIZE = 16; // 16 bytes

// Scrypt settings
// see: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt
export const SCRYPT_SALT_SIZE = 16; // 16 bytes
export const SCRYPT_N = 2 ** 17; // CPU/memory cost parameter (must be a power of 2, > 1)
// eslint-disable-next-line @typescript-eslint/naming-convention
export const SCRYPT_r = 8; // Block size parameter
// eslint-disable-next-line @typescript-eslint/naming-convention
export const SCRYPT_p = 1; // Parallelization parameter

export const SHARED_SALT = new Uint8Array([...Array(SCRYPT_SALT_SIZE).keys()]);
