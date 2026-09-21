import {
  AccountWalletType,
  toAccountGroupId,
  toAccountWalletId,
  toMultichainAccountGroupId,
  toMultichainAccountWalletId,
} from '@metamask/account-api';
import { AccountGroupType } from '@metamask/account-api';
import { KeyringTypes } from '@metamask/keyring-controller';

import type { AccountTreeControllerState } from '../../types.js';
import {
  ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION,
  AccountWalletPayloadType,
  AccountWalletPrivateKeyEncoding,
  toGroupPayloadId,
  toWalletPayloadId,
} from '../payload.js';
import type {
  AccountTreePayload,
  AccountWalletMnemonicPayload,
  AccountWalletPrivateKeyPayload,
} from '../payload.js';
import { encodeBytes } from '../utils.js';
import type { EncodedBytes } from '../utils.js';

const PRIVATE_KEY_WALLET_PAYLOAD_ID = toWalletPayloadId(
  AccountWalletPayloadType.PrivateKey,
);

const DEFAULT_PRIVATE_KEY_HEX_BYTES = encodeBytes(
  new TextEncoder().encode('0xdeadbeef'),
);

export type LocalMnemonicGroupSpec = {
  groupIndex: number;
  name: string;
  accounts: string[];
  pinned?: boolean;
  hidden?: boolean;
};

export type LocalSingleAccountGroupSpec = {
  address: string;
  name: string;
  accounts: string[];
  pinned?: boolean;
  hidden?: boolean;
};

export function makeLocalMnemonicWallet(
  entropyId: string,
  groups: LocalMnemonicGroupSpec[],
  walletName = 'Wallet 1',
): AccountTreeControllerState['accountTree']['wallets'] {
  const walletId = toMultichainAccountWalletId(entropyId);
  return {
    [walletId]: {
      id: walletId,
      type: AccountWalletType.Entropy,
      status: 'ready',
      groups: Object.fromEntries(
        groups.map(
          ({ groupIndex, name, accounts, pinned = false, hidden = false }) => {
            const groupId = toMultichainAccountGroupId(walletId, groupIndex);
            return [
              groupId,
              {
                id: groupId,
                type: AccountGroupType.MultichainAccount,
                accounts,
                metadata: {
                  name,
                  entropy: { groupIndex },
                  pinned,
                  hidden,
                  lastSelected: 0,
                },
              },
            ];
          },
        ),
      ),
      metadata: { name: walletName, entropy: { id: entropyId } },
    },
  };
}

export function makeLocalKeyringWallet(
  keyringType: KeyringTypes,
  groups: LocalSingleAccountGroupSpec[],
  walletName = 'Imported Accounts',
): AccountTreeControllerState['accountTree']['wallets'] {
  const walletId = toAccountWalletId(AccountWalletType.Keyring, keyringType);
  return {
    [walletId]: {
      id: walletId,
      type: AccountWalletType.Keyring,
      status: 'ready',
      groups: Object.fromEntries(
        groups.map(
          ({ address, name, accounts, pinned = false, hidden = false }) => {
            const groupId = toAccountGroupId(walletId, address);
            return [
              groupId,
              {
                id: groupId,
                type: AccountGroupType.SingleAccount,
                accounts,
                metadata: {
                  name,
                  pinned,
                  hidden,
                  lastSelected: 0,
                },
              },
            ];
          },
        ),
      ),
      metadata: { name: walletName, keyring: { type: keyringType } },
    },
  };
}

export type MnemonicGroupSpec = {
  groupIndex: number;
  name: string;
  pinned?: boolean;
  hidden?: boolean;
};

export function makePayloadMnemonicWallet(
  entropySourceId: string,
  walletName: string,
  groups: MnemonicGroupSpec[],
  options: { mnemonic?: EncodedBytes } = {},
): AccountWalletMnemonicPayload {
  const walletId = toWalletPayloadId(entropySourceId);
  return {
    id: walletId,
    type: AccountWalletPayloadType.Mnemonic,
    ...(options.mnemonic !== undefined && { value: options.mnemonic }),
    metadata: { name: walletName },
    groups: groups.map(
      ({ groupIndex, name, pinned = false, hidden = false }) => ({
        id: toGroupPayloadId(walletId, groupIndex),
        groupIndex,
        metadata: { name, pinned, hidden },
      }),
    ),
  };
}

export type PrivateKeyGroupValue = {
  privateKey?: EncodedBytes;
  encoding?: AccountWalletPrivateKeyEncoding;
  type?: string;
};

export type PrivateKeyGroupSpec = {
  address: string;
  name: string;
  pinned?: boolean;
  hidden?: boolean;
  value?: PrivateKeyGroupValue | null;
};

export function makePayloadPrivateKeyWallet(
  groups: PrivateKeyGroupSpec[],
): AccountWalletPrivateKeyPayload {
  return {
    id: PRIVATE_KEY_WALLET_PAYLOAD_ID,
    type: AccountWalletPayloadType.PrivateKey,
    metadata: { name: 'Imported Accounts' },
    groups: groups.map(
      ({ address, name, pinned = false, hidden = false, value }) => {
        const resolvedValue =
          value === null
            ? undefined
            : {
                privateKey: value?.privateKey ?? DEFAULT_PRIVATE_KEY_HEX_BYTES,
                encoding:
                  value?.encoding ??
                  AccountWalletPrivateKeyEncoding.Hexadecimal,
                ...(value?.type !== undefined && { type: value.type }),
              };
        return {
          id: toGroupPayloadId(PRIVATE_KEY_WALLET_PAYLOAD_ID, address),
          ...(resolvedValue !== undefined && { value: resolvedValue }),
          metadata: { name, pinned, hidden },
        };
      },
    ),
  };
}

export function makeAccountTreePayload(
  ...wallets: (AccountWalletMnemonicPayload | AccountWalletPrivateKeyPayload)[]
): AccountTreePayload {
  return { version: ACCOUNT_TREE_PAYLOAD_CURRENT_VERSION, wallets };
}
