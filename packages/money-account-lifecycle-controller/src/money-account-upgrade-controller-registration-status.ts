// TODO: Replace with the equivalent types from
// `@metamask/money-account-upgrade-controller` once the registration status
// action has been added to that package.

export type RegistrationStatus = {
  isRegistered: boolean;
};

export type MoneyAccountUpgradeControllerGetRegistrationStatusAction = {
  type: 'MoneyAccountUpgradeController:getRegistrationStatus';
  handler: (address: string) => Promise<RegistrationStatus>;
};
