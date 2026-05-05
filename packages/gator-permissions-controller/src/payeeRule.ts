import type { Hex } from '@metamask/utils';

/**
 * Execution permission rule restricting which addresses may receive payments
 * (on-chain AllowedCalldataEnforcer / AllowedTargetsEnforcer caveat).
 */
export type PayeeRule = {
  type: 'payee';
  data: {
    addresses: Hex[];
  };
};
