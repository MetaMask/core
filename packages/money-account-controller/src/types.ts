import type { Bip44Account } from '@metamask/account-api';
import type { KeyringAccount } from '@metamask/keyring-api';

export type MoneyAccount = Bip44Account<KeyringAccount>;
