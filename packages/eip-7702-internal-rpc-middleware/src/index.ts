// Method handlers
export { walletUpgradeAccount } from './wallet_upgradeAccount.js';
export { walletGetAccountUpgradeStatus } from './wallet_getAccountUpgradeStatus.js';

// Utilities
export { validateParams, validateAndNormalizeAddress } from './utils.js';

// Constants
export { METHOD_NAMES } from './constants.js';

// Types
export type {
  UpgradeAccountParams,
  UpgradeAccountResult,
  GetAccountUpgradeStatusParams,
  GetAccountUpgradeStatusResult,
} from './types.js';
