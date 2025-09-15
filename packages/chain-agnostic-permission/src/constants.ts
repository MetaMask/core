export const CaveatTypes = Object.freeze({
  restrictReturnedAccounts: 'restrictReturnedAccounts',
  restrictNetworkSwitching: 'restrictNetworkSwitching',
});

/**
 * The "keys" of permissions recognized by the PermissionController.
 * Permission keys and names have distinct meanings in the permission system.
 */
export const PermissionKeys = Object.freeze({
  eth_accounts: 'eth_accounts',
  permittedChains: 'endowment:permitted-chains',
});
