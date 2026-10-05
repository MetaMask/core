import type { Hex } from '@metamask/utils';

// TODO: Replace with the equivalent types from the MFA Migration Controller
// package once its create MFA account action has been added.

export type MfaMigrationControllerCreateMfaAccountAction = {
  type: 'MfaMigrationController:createMfaAccount';
  handler: () => Promise<Hex>;
};
