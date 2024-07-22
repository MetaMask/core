type CachedEntry = {
    salt: Uint8Array;
    base64Salt: string;
    key: Uint8Array;
};
/**
 * Returns a given cached derived key from a hashed password and salt
 *
 * @param hashedPassword - hashed password for cache lookup
 * @param salt - provide salt to receive cached key
 * @returns cached key
 */
export declare function getCachedKeyBySalt(hashedPassword: string, salt: Uint8Array): CachedEntry | undefined;
/**
 * Gets any cached key for a given hashed password
 *
 * @param hashedPassword - hashed password for cache lookup
 * @returns any (the first) cached key
 */
export declare function getAnyCachedKey(hashedPassword: string): CachedEntry | undefined;
/**
 * Sets a key to the in memory cache.
 * We have set an arbitrary size of 10 cached keys per hashed password.
 *
 * @param hashedPassword - hashed password for cache lookup
 * @param salt - salt to set new derived key
 * @param key - derived key we are setting
 */
export declare function setCachedKey(hashedPassword: string, salt: Uint8Array, key: Uint8Array): void;
export {};
//# sourceMappingURL=cache.d.ts.map