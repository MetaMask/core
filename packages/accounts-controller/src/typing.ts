import type { KeyringAccountEntropyOptions } from '@metamask/keyring-api';
import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AccountsControllerState } from './AccountsController';

/**
 * Type constraint to ensure a type is compatible with {@link AccountsControllerState}.
 * If the constraint is not matching, this type will resolve to `never` and thus, fails
 * to compile.
 */
type IsAccountControllerState<Type extends AccountsControllerState> = Type;

/**
 * A type compatible with {@link InternalAccount} which removes any use of recursive-type.
 */
export type StrictInternalAccount = Omit<InternalAccount, 'options'> & {
  // Use stricter options, which are relying on `Json` (which sometimes
  // cause compiler errors because of instanciation "too deep".
  // In anyway, we should rarely have to use those "untyped" options.
  options: {
    entropy?: KeyringAccountEntropyOptions;
  };
};

/**
 * A type compatible with {@link AccountControllerState} which can be used to
 * avoid recursive-type issue with `internalAccounts`.
 */
export type AccountsControllerStrictState = IsAccountControllerState<{
  internalAccounts: {
    accounts: Record<InternalAccount['id'], StrictInternalAccount>;
    selectedAccount: InternalAccount['id'];
  };
}>;
