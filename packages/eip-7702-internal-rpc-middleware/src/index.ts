// Method handlers
export { walletUpgradeAccount } from './wallet_upgradeAccount';
export { walletGetAccountUpgradeStatus } from './wallet_getAccountUpgradeStatus';

// Utilities
export { validateParams, validateAndNormalizeAddress } from './utils';

// Constants
export { METHOD_NAMES } from './constants';

// Types
export type {
  UpgradeAccountParams,
  UpgradeAccountResult,
  GetAccountUpgradeStatusParams,
  GetAccountUpgradeStatusResult,
} from './types';
