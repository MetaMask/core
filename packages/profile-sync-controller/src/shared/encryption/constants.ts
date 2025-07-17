// Nonce/Key Sizes
export const ALGORITHM_NONCE_SIZE = 12; // 12 bytes
export const ALGORITHM_KEY_SIZE = 16; // 16 bytes

// Scrypt settings
// see: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt
export const SCRYPT_SALT_SIZE = 16; // 16 bytes
export const SCRYPT_N = 2 ** 17; // CPU/memory cost parameter (must be a power of 2, > 1)
export const SCRYPT_N_V2 = 2;
export const SCRYPT_r = 8; // Block size parameter
export const SCRYPT_p = 1; // Parallelization parameter

export const SHARED_SALT = new Uint8Array([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
]);
// Different salt for SCRYPT_N_V2 to prevent cache collisions on outdated clients
export const SHARED_SALT_V2 = new Uint8Array([
  16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
]);
