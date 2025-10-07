// Hook functions
export { upgradeAccount } from './hooks/upgradeAccount';
export { getAccountUpgradeStatus } from './hooks/getAccountUpgradeStatus';

// Method wrappers
export { walletUpgradeAccount } from './methods/wallet_upgradeAccount';
export { walletGetAccountUpgradeStatus } from './methods/wallet_getAccountUpgradeStatus';

// Utilities
export {
  validateParams,
  validateAndNormalizeAddress,
  resemblesAddress,
} from './utils';

// Constants
export { METHOD_NAMES } from './constants';

// Types
export type {
  UpgradeAccountParams,
  UpgradeAccountResult,
  GetAccountUpgradeStatusParams,
  GetAccountUpgradeStatusResult,
  UpgradeAccountHooks,
  GetAccountUpgradeStatusHooks,
} from './types';
