import type { UserStoragePath } from '../controllers/user-storage/schema';
import type { IBaseAuth } from './authentication-jwt-bearer/types';
import type { Env } from './env';
export declare const STORAGE_URL: (env: Env, encryptedPath: string) => string;
export type UserStorageConfig = {
    env: Env;
    auth: Pick<IBaseAuth, 'getAccessToken' | 'getUserProfile' | 'signMessage'>;
};
export type StorageOptions = {
    getStorageKey: () => Promise<string | null>;
    setStorageKey: (val: string) => Promise<void>;
};
export type UserStorageOptions = {
    storage?: StorageOptions;
};
export declare class UserStorage {
    #private;
    protected config: UserStorageConfig;
    protected options: UserStorageOptions;
    protected env: Env;
    constructor(config: UserStorageConfig, options: UserStorageOptions);
    setItem(path: UserStoragePath, value: string): Promise<void>;
    getItem(path: UserStoragePath): Promise<string>;
    getStorageKey(): Promise<string>;
}
//# sourceMappingURL=user-storage.d.ts.map