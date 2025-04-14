import Controller from './UserStorageController';

const UserStorageController = Controller;
export { Controller };
export default UserStorageController;
export * from './UserStorageController';
export * as Mocks from './mocks';
export * from '../../shared/encryption';
export * from '../../shared/storage-schema';
export { BackupAndSyncFeatures } from './types';
