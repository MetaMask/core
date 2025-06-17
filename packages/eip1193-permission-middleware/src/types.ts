// There is no logic in this file.
/* istanbul ignore file */

export enum CaveatTypes {
  RestrictReturnedAccounts = 'restrictReturnedAccounts',
  RestrictNetworkSwitching = 'restrictNetworkSwitching',
}

export enum EndowmentTypes {
  PermittedChains = 'endowment:permitted-chains',
}

export enum RestrictedMethods {
  EthAccounts = 'eth_accounts',
}
