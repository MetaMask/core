export const CaveatTypes = Object.freeze({
  restrictReturnedAccounts: 'restrictReturnedAccounts' as const,
  restrictNetworkSwitching: 'restrictNetworkSwitching' as const,
});

export const EndowmentTypes = Object.freeze({
  permittedChains: 'endowment:permitted-chains',
});

export const RestrictedMethods = Object.freeze({
  eth_accounts: 'eth_accounts',
});
