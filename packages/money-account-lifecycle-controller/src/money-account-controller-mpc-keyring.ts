// TODO: Replace with the equivalent types from
// `@metamask/money-account-controller` once the MPC keyring action has been
// added to that package.

export type MoneyAccountControllerUseMpcKeyringAction = {
  type: 'MoneyAccountController:useMpcKeyring';
  handler: (options: {
    moneyAccountAddress: string;
    mpcAddress: string;
  }) => Promise<void>;
};
