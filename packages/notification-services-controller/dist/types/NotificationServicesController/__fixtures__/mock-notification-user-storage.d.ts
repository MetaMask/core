import { TRIGGER_TYPES } from '../constants/notification-schema';
import type { UserStorage } from '../types/user-storage/user-storage';
export declare const MOCK_USER_STORAGE_ACCOUNT = "0x0000000000000000000000000000000000000000";
export declare const MOCK_USER_STORAGE_CHAIN = "1";
/**
 * Mocking Utility - create a mock notification user storage object
 *
 * @param override - provide any override configuration for the mock
 * @returns a mock notification user storage object
 */
export declare function createMockUserStorage(override?: Partial<UserStorage>): UserStorage;
/**
 * Mocking Utility - create a mock notification user storage object with triggers
 *
 * @param triggers - provide any override configuration for the mock
 * @returns a mock notification user storage object with triggers
 */
export declare function createMockUserStorageWithTriggers(triggers: string[] | {
    id: string;
    e: boolean;
    k?: TRIGGER_TYPES;
}[]): UserStorage;
/**
 * Mocking Utility - create a mock notification user storage object (full/realistic object)
 *
 * @param props - provide any override configuration for the mock
 * @param props.triggersEnabled - choose if all triggers created are enabled/disabled
 * @param props.address - choose a specific address for triggers to be assigned to
 * @returns a mock full notification user storage object
 */
export declare function createMockFullUserStorage(props?: {
    triggersEnabled?: boolean;
    address?: string;
}): UserStorage;
//# sourceMappingURL=mock-notification-user-storage.d.ts.map