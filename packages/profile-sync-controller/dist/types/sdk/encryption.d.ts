export type EncryptedPayload = {
    v: '1';
    d: string;
    iterations: number;
};
declare class EncryptorDecryptor {
    #private;
    encryptString(plaintext: string, password: string): string;
    decryptString(encryptedDataStr: string, password: string): string;
}
export declare const Encryption: EncryptorDecryptor;
export default Encryption;
/**
 * Create a SHA-256 hash from a given string.
 *
 * @param data - input
 * @returns hash
 */
export declare function createSHA256Hash(data: string): string;
//# sourceMappingURL=encryption.d.ts.map