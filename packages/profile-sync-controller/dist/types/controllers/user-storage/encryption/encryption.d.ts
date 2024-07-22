export type EncryptedPayload = {
    v: '1';
    t: 'scrypt';
    d: string;
    o: {
        N: number;
        r: number;
        p: number;
        dkLen: number;
    };
    saltLen: number;
};
declare class EncryptorDecryptor {
    #private;
    encryptString(plaintext: string, password: string): string;
    decryptString(encryptedDataStr: string, password: string): string;
}
declare const encryption: EncryptorDecryptor;
export default encryption;
/**
 * Receive a SHA256 hash from a given string
 * @param data - input
 * @returns sha256 hash
 */
export declare function createSHA256Hash(data: string): string;
//# sourceMappingURL=encryption.d.ts.map